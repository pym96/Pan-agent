import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("C-ENTRY-FIXTURE preview-first-task v1 fixes exact prompt, tool order, source bytes and expected output", async () => {
 const fixture=JSON.parse(await readFile(new URL("../../scripts/fixtures/preview-first-task-v1.json",import.meta.url),"utf8"));
 assert.equal(fixture.id,"preview-first-task/v1");
 assert.equal(typeof fixture.prompt,"string"); assert.ok(fixture.prompt.trim().length>0);
 assert.deepEqual(fixture.calls.map((c:{name:string})=>c.name),["write","bash","read"]);
 assert.deepEqual(fixture.calls.map((c:{id:string})=>c.id),["preview-write","preview-bash","preview-read"]);
 assert.deepEqual(fixture.calls.map((c:{arguments:unknown})=>c.arguments),[{path:"hello.js",content:'console.log("PAN_PREVIEW_OK");\n'},{command:"node hello.js"},{path:"hello.js"}]);
 assert.equal(fixture.final,"verified PAN_PREVIEW_OK"); assert.equal(fixture.expected_stdout,"PAN_PREVIEW_OK");
 assert.ok(fixture.calls[0].arguments.content.includes(fixture.expected_stdout));
 assert.ok(fixture.final.includes(fixture.expected_stdout));
 const packed=JSON.parse(await readFile(new URL("../../scripts/fixtures/packed-create-run-verify-v1.json",import.meta.url),"utf8"));
 assert.equal(packed.id,"packed-create-run-verify/v1","the #35 fixture keeps its own frozen identity");
 assert.notEqual(fixture.final,packed.final); assert.notDeepEqual(fixture.calls,packed.calls);
});

test("C-ENTRY-FIXTURE preview verification assets bind the frozen fixture identity", async () => {
 const fixture=JSON.parse(await readFile(new URL("../../scripts/fixtures/preview-first-task-v1.json",import.meta.url),"utf8"));
 const sha=(body:string)=>createHash("sha256").update(body).digest("hex");
 assert.equal(sha(fixture.calls[0].arguments.content),"92b7e423d9e46a856744afd0417f06fcf7c390c836e3e04feb60ab7a0c62806e");
 for(const asset of ["check-driver.mjs","replay-driver.mjs","interactive-driver.mjs"]) {
  const source=await readFile(new URL("../../scripts/fixtures/preview/"+asset,import.meta.url),"utf8");
  assert.ok(!source.includes('"packed-create-run-verify/v1"'),asset+" must not reuse the #35 fixture identity");
 }
 const check=await readFile(new URL("../../scripts/fixtures/preview/check-driver.mjs",import.meta.url),"utf8");
 assert.ok(check.includes("preview-first-task/v1"));
 const verifier=await readFile(new URL("../../scripts/verify_preview_consumer.py",import.meta.url),"utf8");
 assert.ok(verifier.includes("preview-first-task/v1")&&verifier.includes("CANARY-PREVIEW-FAKE"));
});
