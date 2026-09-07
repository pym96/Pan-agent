import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, after } from "node:test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const checker = join(repository, "scripts/check_module_layout.mjs");
// #42 historical exception: retain the exact accepted #41 inputs and all controls.
const root = await mkdtemp(join(tmpdir(), "wo41-exact-snapshot-"));
execFileSync("tar", ["-xf", "-", "-C", root], {input: execFileSync("git", ["archive", "75de6de21c4f0c5e0a93c7a4143c5ecf94d92358", "typescript/src", "typescript/test", "docs/design/workorder-41-relocations.json"], {cwd: repository, maxBuffer: 32 * 1024 * 1024})});
after(async () => { await rm(root, {recursive:true, force:true}); });
async function copyProduct(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "wo41-layout-control-"));
  await mkdir(join(target, "typescript"));
  await cp(join(root, "typescript/src"), join(target, "typescript/src"), {recursive: true});
  await mkdir(join(target, "docs/design"), {recursive: true});
  await cp(join(root, "docs/design/workorder-41-relocations.json"), join(target, "docs/design/workorder-41-relocations.json"));
  // Product-only tests inspect Product clients; the full scope gate also checks Reference.
  await cp(join(root, "typescript/test"), join(target, "typescript/test"), {recursive: true});
  return target;
}
function rejected(target: string, check: string, diagnostic: RegExp): void {
  const result = spawnSync(process.execPath, [checker, "--root", target, "--check", check, "--product-only"], {cwd: root, encoding: "utf8"});
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, diagnostic);
}

test("C-LAY-01/C-LAY-02 exact relocation and resolved source graph preserve all baseline Modules", () => {
  for (const check of ["fidelity", "graph"]) {
    const output = execFileSync(process.execPath, [checker, "--root", root, "--check", check, "--product-only"], {cwd: root, encoding: "utf8"});
    assert.match(output, new RegExp(`PASS #41 ${check}`));
  }
});

test("C-LAY-02 graph rejects static, type, re-export and literal dynamic runtime-to-DeepSeek edges", async () => {
  for (const declaration of [
    'import { DeepSeekFetchTransport } from "../providers/deepseek/deepseek-transport.ts";',
    'import type { DeepSeekProfile } from "../providers/deepseek/deepseek-profile.ts";',
    'export type { DeepSeekProfile } from "../providers/deepseek/deepseek-profile.ts";',
    'type Forbidden = import("../providers/deepseek/deepseek-profile.ts").DeepSeekProfile;',
    'void import("../providers/deepseek/deepseek-profile.ts");',
  ]) {
    const target = await copyProduct();
    try {
      const file = join(target, "typescript/src/runtime/native-kernel.ts");
      await writeFile(file, (await readFile(file, "utf8")) + "\n" + declaration + "\n");
      rejected(target, "graph", /forbidden edge: runtime -> providers/);
    } finally { await rm(target, {recursive: true, force: true}); }
  }
});

test("C-LAY-01 incomplete relocation mapping fails before it can hide a missing implementation", async () => {
  const target = await copyProduct();
  try {
    const file = join(target, "docs/design/workorder-41-relocations.json");
    const mapping = JSON.parse(await readFile(file, "utf8"));
    delete mapping.sources["typescript/src/session.ts"];
    await writeFile(file, JSON.stringify(mapping));
    rejected(target, "fidelity", /incomplete relocation map/);
  } finally { await rm(target, {recursive: true, force: true}); }
});

test("C-LAY-04 source fidelity rejects an executable default change outside permitted import spans", async () => {
  const target = await copyProduct();
  try {
    const file = join(target, "typescript/src/runtime/agent-kernel.ts");
    const source = await readFile(file, "utf8");
    assert.match(source, /maxModelTurns: 64,/);
    await writeFile(file, source.replace("maxModelTurns: 64,", "maxModelTurns: 65,"));
    rejected(target, "fidelity", /source fidelity: typescript\/src\/kernels\/agent-kernel.ts/);
  } finally { await rm(target, {recursive: true, force: true}); }
});
