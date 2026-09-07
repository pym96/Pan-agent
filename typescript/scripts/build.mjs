import { rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
// Always start clean: deleted/renamed source files cannot survive in a later pack.
await rm(new URL("../dist/", import.meta.url), {recursive: true, force: true});
await mkdir(new URL("../dist/", import.meta.url));
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url)), "-p", "tsconfig.build.json"], {cwd: root, stdio: "inherit"});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
