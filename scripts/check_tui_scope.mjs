/** Current #42 slice: historical scripts stay exact; core bytes and graph remain protected. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repository=fileURLToPath(new URL('../',import.meta.url));
const root=path.resolve(process.argv[2]??repository),base='75de6de21c4f0c5e0a93c7a4143c5ecf94d92358';
const git=(...args)=>execFileSync('git',['-C',repository,...args],{encoding:'utf8',maxBuffer:32*1024*1024});
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const before=file=>git('show',`${base}:${file}`);
const files=git('ls-tree','-r','--name-only',base).trim().split('\n');
const allowed=new Set(['typescript/src/cli.ts','typescript/src/index.ts','typescript/src/tui/tui.ts','typescript/src/tui/presentation.ts','typescript/src/tui/terminal-input.ts','typescript/src/tui/compact-tui.ts','typescript/test/compact-tui.test.ts','typescript/test/general-agent.test.ts','typescript/test/module-layout.test.ts','typescript/test/cutover-contract.test.ts','README.md','typescript/README.md','typescript/src/README.md','typescript/src/tui/README.md','docs/agents/current-assignment.md','docs/design/README.md','docs/design/native-compact-tui.md','docs/design/workorder-42-obligations.json','scripts/README.md','scripts/fixtures/README.md','scripts/check_tui_scope.mjs','scripts/check_tui_public_package.mjs','scripts/verify_tui_consumer.py','scripts/wo42-consumer-driver.mjs','scripts/verify_tui_execution.mjs','scripts/verify_tui_pty.py','scripts/verify_tui_demo.py','scripts/demo_tui.mjs','scripts/fixtures/tui-pty-driver.mjs','scripts/fixtures/tui-replay-consumer.mjs','scripts/fixtures/tui-archive-consumer.mjs']);
const protectedHashes={};
for(const file of files)if(!allowed.has(file)){const bytes=fs.readFileSync(path.join(root,file));assert.deepEqual(bytes,execFileSync('git',['-C',repository,'show',`${base}:${file}`],{maxBuffer:32*1024*1024}),`protected file changed: ${file}`);protectedHashes[file]=createHash('sha256').update(bytes).digest('hex');}
const changed=[...new Set([...git('diff','--name-only',base).trim().split('\n'),...git('ls-files','--others','--exclude-standard').trim().split('\n')].filter(Boolean))];
for(const file of changed)assert.ok(allowed.has(file),`out of scope: ${file}`);
for(const file of ['typescript/test/general-agent.test.ts','typescript/test/cutover-contract.test.ts']) {
 const expected=file.endsWith('general-agent.test.ts')?before(file).replace('chunk.endsWith("Task> ")','chunk.endsWith("你 › ")'):before(file).replace('WorkOrder #41 Native Module layout/','WorkOrder #42 Native compact TUI/');
 assert.equal(read(file),expected,`non-presentation test change: ${file}`);
}
const obligations=[];
for(const file of files.filter(f=>f.startsWith('typescript/test/')&&f.endsWith('.test.ts'))){const titles=text=>[...text.matchAll(/^test\("([^"]+)"/gm)].map(m=>m[1]);const old=titles(before(file));assert.deepEqual(titles(read(file)),old,`lost obligation: ${file}`);obligations.push(...old.map(title=>({file,title,execution:file.endsWith('module-layout.test.ts')?'exact #41 historical snapshot and its negative controls':'current Product'})));}
assert.equal(obligations.length,73);
const map=JSON.parse(read('docs/design/workorder-42-obligations.json'));assert.deepEqual(map.prior_obligations,obligations);
// Reuse the unchanged compiler-resolved graph checker on the CURRENT source graph.
execFileSync(process.execPath,[path.join(repository,'scripts/check_module_layout.mjs'),'--root',root,'--check','graph','--product-only'],{cwd:repository,stdio:'pipe'});
for(const file of changed.filter(f=>f.endsWith('.md')))for(const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=match[1];if(/^(https?:|mailto:|#)/.test(target))continue;assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),target.split('#')[0])),`${file}: broken link ${target}`);}
console.log(JSON.stringify({base,changed,protectedHashes,priorObligations:obligations.length},null,2));console.log('PASS #42 scope, protected core, current graph, 73 prior obligations and changed-document links');
