import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const root = fileURLToPath(new URL("../", import.meta.url));
async function inventory() {
 const result: Array<{path:string;mode:number;sha256:string}> = [];
 for (const path of (await readdir(join(root,"dist"),{recursive:true})).sort()) {
  const file=join(root,"dist",path); const info=await stat(file);
  if (info.isFile()) result.push({path,mode:info.mode & 0o777,sha256:createHash("sha256").update(await readFile(file)).digest("hex")});
 }
 return result;
}
test("C-PFREE-E101 clean compiler builds eliminate stale output and preserve deterministic executable exports", async () => {
 execFileSync(process.execPath,["scripts/build.mjs"],{cwd:root}); const first=await inventory();
 await writeFile(join(root,"dist/stale.js"),"throw new Error('stale output');\n");
 execFileSync(process.execPath,["scripts/build.mjs"],{cwd:root}); assert.deepEqual(await inventory(),first);
 assert.ok(first.some((p)=>p.path==="cli.js")); assert.ok(first.some((p)=>p.path==="index.d.ts"));
 for(const file of first.filter((p)=>p.path.endsWith(".js"))) {
  const source=await readFile(join(root,"dist",file.path),"utf8");
  assert.doesNotMatch(source,/from ["'][^"']+\.ts["']|import\(["'][^"']+\.ts["']|@earendil-works\/pi-/);
 }
 const output=execFileSync(process.execPath,["bin/pan-agent.mjs","--help"],{cwd:root,encoding:"utf8"}); assert.match(output,/--kernel native/);
 const metadata=JSON.parse(await readFile(join(root,"package.json"),"utf8")); assert.equal(metadata.private,true); assert.equal(metadata.engines.node,">=22.19.0");
 assert.deepEqual(metadata.bin,{"pan-agent":"bin/pan-agent.mjs"}); assert.equal(metadata.exports["."].import,"./dist/index.js");
 const temporary=await mkdtemp(join(tmpdir(),"wo35-package-test-"));
 try {
  for(const name of ["user.conf","global.conf"])await writeFile(join(temporary,name),"");
  const packed=JSON.parse(execFileSync("npm",["pack","--dry-run","--json","--ignore-scripts","--offline","--update-notifier=false","--no-audit","--no-fund","--cache",join(temporary,"cache"),"--userconfig",join(temporary,"user.conf"),"--globalconfig",join(temporary,"global.conf")],{cwd:root,encoding:"utf8"}));
  const paths=packed[0].files.map((file:{path:string})=>file.path);
  for(const required of ["dist/index.js","dist/cli.js","bin/pan-agent.mjs","RUNBOOK.md","package.json"])assert.ok(paths.includes(required),required);
  assert.ok(paths.every((p:string)=>!p.startsWith("src/")&&!p.startsWith("test/")&&!p.startsWith("references/")&&!p.includes("node_modules/")));
 } finally {await rm(temporary,{recursive:true,force:true});}
});
test("C-PFREE-E104 packed-create-run-verify v1 fixes exact tool order, source bytes and expected output", async () => {
 const fixture=JSON.parse(await readFile(new URL("../../scripts/fixtures/packed-create-run-verify-v1.json",import.meta.url),"utf8"));
 assert.equal(fixture.id,"packed-create-run-verify/v1");
 assert.deepEqual(fixture.calls.map((c:{name:string})=>c.name),["write","bash","read"]);
 assert.deepEqual(fixture.calls.map((c:{arguments:unknown})=>c.arguments),[{path:"hello.js",content:'console.log("PAN_PACK_OK");\n'},{command:"node hello.js"},{path:"hello.js"}]);
 assert.equal(fixture.final,"verified PAN_PACK_OK"); assert.equal(fixture.expected_stdout,"PAN_PACK_OK");
});
