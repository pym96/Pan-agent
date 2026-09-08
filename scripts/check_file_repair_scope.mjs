/** #43 scope and obligation inventory; exact protected bytes from accepted #44. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repository=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(process.argv[2]??repository),base='4cc479a16cd2767efda06c46f3d006f281e4c324';
const git=(...args)=>execFileSync('git',['-C',repository,...args],{encoding:'utf8',maxBuffer:64*1024*1024});
const hash=b=>createHash('sha256').update(b).digest('hex');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const files=git('ls-tree','-r','--name-only',base).trim().split('\n');const map=JSON.parse(read('docs/design/workorder-43-repair-obligations.json'));assert.equal(map.base,base);assert.equal(map.criteria_version,'1.1');
const allowed=new Set(map.changed_files);const protectedHashes={};
for(const file of files)if(!allowed.has(file)){const bytes=fs.readFileSync(path.join(root,file));assert.deepEqual(bytes,execFileSync('git',['-C',repository,'show',`${base}:${file}`],{maxBuffer:64*1024*1024}),`protected file changed: ${file}`);protectedHashes[file]=hash(bytes);}
const changed=[...new Set([...git('diff','--name-only',base).trim().split('\n'),...git('ls-files','--others','--exclude-standard').trim().split('\n')].filter(Boolean))];assert.deepEqual([...allowed].sort(),changed.sort(),'declared scope inventory differs');
const permittedOld=f=>['typescript/src/tui/attachment-picker.ts','typescript/src/tui/terminal-input.ts','typescript/src/tui/compact-tui.ts','typescript/src/tui/presentation.ts','typescript/src/tui/tui.ts','docs/agents/current-assignment.md'].includes(f)||f.endsWith('README.md');
const permittedNew=f=>/^typescript\/test\//.test(f)||/^scripts\//.test(f)||/^docs\/design\/(native-file-input-repair\.md|workorder-43-repair-obligations\.json)$/.test(f);
for(const file of allowed)assert.ok(files.includes(file)?permittedOld(file):permittedNew(file),`unauthorized scope inventory: ${file}`);
const obligations=[];for(const file of files.filter(f=>/^typescript\/test\/.*\.test\.ts$/.test(f))){const before=git('show',`${base}:${file}`);let expected=before;for(const row of map.test_substitutions.filter(r=>r.file===file)){assert.equal(expected.split(row.before).length-1,row.occurrences);expected=expected.split(row.before).join(row.after);}assert.equal(read(file),expected,`old test changed: ${file}`);for(const match of before.matchAll(/^test\("([^"]+)"/gm))obligations.push({file,title:match[1],execution:file.endsWith('module-layout.test.ts')?'exact #41 historical snapshot and unchanged negative controls':'current Product'});}
assert.equal(obligations.length,99);assert.deepEqual(map.prior_obligations,obligations);
execFileSync(process.execPath,[path.join(repository,'scripts/check_file_graph.mjs'),root],{stdio:'pipe'});
for(const file of changed.filter(f=>f.endsWith('.md')))for(const match of read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=match[1];if(/^(https?:|mailto:|#)/.test(target))continue;assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),target.split('#')[0])),`${file}: broken link ${target}`);}
console.log(JSON.stringify({base,changed,protectedHashes,criteriaVersion:"1.1",priorObligations:obligations.length},null,2));console.log('PASS #43 scope, protected bytes, current graph, 99 prior obligations and document links');
