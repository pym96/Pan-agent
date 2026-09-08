/** #44 explicit current delta; retained historical checks remain byte-exact. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repository=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(process.argv[2]??repository),base='fd408c4ecd236cf97d509436085e4df461829e9e';
const git=(...args)=>execFileSync('git',['-C',repository,...args],{encoding:'utf8',maxBuffer:64*1024*1024});
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),before=file=>git('show',`${base}:${file}`),hash=value=>createHash('sha256').update(value).digest('hex');
const files=git('ls-tree','-r','--name-only',base).trim().split('\n');
const allowed=new Set([
  "README.md",
  "docs/agents/README.md",
  "docs/agents/current-assignment.md",
  "docs/design/README.md",
  "docs/design/native-streaming-tui.md",
  "docs/design/workorder-44-obligations.json",
  "scripts/README.md",
  "scripts/check_streaming_public_package.mjs",
  "scripts/check_streaming_scope.mjs",
  "scripts/demo_streaming.mjs",
  "scripts/fixtures/README.md",
  "scripts/fixtures/streaming-baseline-pty-driver.mjs",
  "scripts/fixtures/streaming-pty-driver.mjs",
  "scripts/fixtures/streaming-replay-consumer.mjs",
  "scripts/fixtures/streaming-wire.mjs",
  "scripts/verify_streaming_baseline_pty.py",
  "scripts/verify_streaming_consumer.py",
  "scripts/verify_streaming_demo.py",
  "scripts/verify_streaming_execution.mjs",
  "scripts/verify_streaming_pty.py",
  "scripts/verify_streaming_scope.py",
  "scripts/wo44-consumer-driver.mjs",
  "typescript/README.md",
  "typescript/src/README.md",
  "typescript/src/cli.ts",
  "typescript/src/index.ts",
  "typescript/src/protocol/README.md",
  "typescript/src/protocol/model-adapter-contract.ts",
  "typescript/src/providers/README.md",
  "typescript/src/providers/deepseek/README.md",
  "typescript/src/providers/deepseek/abortable-body.ts",
  "typescript/src/providers/deepseek/deepseek-transport.ts",
  "typescript/src/providers/deepseek/pan-deepseek-model-adapter.ts",
  "typescript/src/providers/faux/README.md",
  "typescript/src/providers/faux/faux-model-adapter.ts",
  "typescript/src/runtime/README.md",
  "typescript/src/runtime/agent-kernel.ts",
  "typescript/src/runtime/native-kernel.ts",
  "typescript/src/runtime/session.ts",
  "typescript/src/tui/README.md",
  "typescript/src/tui/compact-tui.ts",
  "typescript/src/tui/presentation.ts",
  "typescript/src/tui/terminal-input.ts",
  "typescript/test/README.md",
  "typescript/test/compact-tui.test.ts",
  "typescript/test/cutover-contract.test.ts",
  "typescript/test/general-agent.test.ts",
  "typescript/test/streaming.test.ts"
]);
const protectedHashes={};
for(const file of files)if(!allowed.has(file)){const bytes=fs.readFileSync(path.join(root,file));assert.deepEqual(bytes,execFileSync('git',['-C',repository,'show',`${base}:${file}`],{maxBuffer:64*1024*1024}),`protected file changed: ${file}`);protectedHashes[file]=hash(bytes);}
const changed=[...new Set([...git('diff','--name-only',base).trim().split('\n'),...git('ls-files','--others','--exclude-standard').trim().split('\n')].filter(Boolean))];
for(const file of changed)assert.ok(allowed.has(file),`out of scope: ${file}`);
const map=JSON.parse(read('docs/design/workorder-44-obligations.json'));assert.equal(map.base,base);assert.equal(map.criteria_version,'1.0');
for(const [file,change] of Object.entries(map.approved_core_wiring)){assert.equal(hash(before(file)),change.before_sha256);assert.equal(hash(read(file)),change.approved_after_sha256,`unapproved core wiring: ${file}`);}
const obligations=[];
for(const file of files.filter(f=>f.startsWith('typescript/test/')&&f.endsWith('.test.ts'))){const titles=text=>[...text.matchAll(/^test\("([^"]+)"/gm)].map(m=>m[1]);assert.deepEqual(titles(read(file)),titles(before(file)),`lost obligation: ${file}`);for(const title of titles(before(file)))obligations.push({file,title,execution:file.endsWith('module-layout.test.ts')?'exact #41 historical snapshot and unchanged negative controls':'current Product'});
 let expected=before(file);for(const row of map.test_substitutions.filter(r=>r.file===file)){assert.equal(expected.split(row.before).length-1,row.occurrences);expected=expected.split(row.before).join(row.after);}assert.equal(read(file),expected,`test changed beyond mapped label expectation: ${file}`);
}
assert.equal(obligations.length,83);assert.deepEqual(map.prior_obligations,obligations);
for(const file of ['typescript/src/cli.ts','typescript/src/tui/presentation.ts','typescript/src/tui/compact-tui.ts','scripts/demo_streaming.mjs'])assert.doesNotMatch(read(file),/\p{Script=Han}/u,`Product-owned Chinese remains: ${file}`);
for(const file of new Set(map.english_label_substitutions.map(row=>row.file))){let translated=before(file);for(const row of map.english_label_substitutions.filter(r=>r.file===file)){assert.equal(translated.split(row.before).length-1,row.occurrences,`stale label inventory: ${file} ${row.before}`);translated=translated.split(row.before).join(row.after);}assert.doesNotMatch(translated,/\p{Script=Han}/u,`unmapped original Chinese label: ${file}`);}
execFileSync(process.execPath,[path.join(repository,'scripts/check_module_layout.mjs'),'--root',root,'--check','graph','--product-only'],{cwd:repository,stdio:'pipe'});
for(const file of changed.filter(f=>f.endsWith('.md')))for(const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=match[1];if(/^(https?:|mailto:|#)/.test(target))continue;assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),target.split('#')[0])),`${file}: broken link ${target}`);}
console.log(JSON.stringify({base,changed,protectedHashes,priorObligations:obligations.length,approvedCoreWiring:Object.keys(map.approved_core_wiring)},null,2));console.log('PASS #44 scope, approved core wiring, current graph, 83 prior obligations, English inventory and document links');
