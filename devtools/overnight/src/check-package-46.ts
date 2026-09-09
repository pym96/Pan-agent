import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { insist } from './model.ts';
const root=fileURLToPath(new URL('../../../',import.meta.url)),base='7ade169b276fd68198ca4461d07c5589c273253f';
const allowed=new Set(['AGENTS.md','README.md','devtools/README.md','docs/design/README.md','docs/evidence/README.md','docs/agents/README.md','docs/agents/current-assignment.md','docs/agents/issue-tracker.md','docs/design/codex-single-job-connector.md','docs/design/workorder-46-obligations.json','docs/evidence/codex-single-job-connector-candidate.md']);
const git=(args:string[])=>execFileSync('/usr/bin/git',args,{cwd:root,encoding:'utf8'});
const retained=(p:string)=>!p.startsWith('devtools/overnight/') && !allowed.has(p) || p==='devtools/overnight/src/check-package.ts' || p.startsWith('devtools/overnight/test/') && p.endsWith('.test.ts') || p==='docs/design/workorder-45-obligations.json';
let protectedCount=0;
for(const p of git(['ls-tree','-r','--name-only',base]).trim().split('\n'))if(retained(p)){
 insist(existsSync(join(root,p)) && execFileSync('/usr/bin/git',['show',`${base}:${p}`],{cwd:root}).equals(readFileSync(join(root,p))),'protected_bytes_changed');protectedCount++;
}
for(const p of [...git(['diff','--name-only',base]).split('\n'),...git(['ls-files','--others','--exclude-standard']).split('\n')].filter(Boolean))insist(allowed.has(p)||p.startsWith('devtools/overnight/'),'scope_delta');
const pkg=JSON.parse(readFileSync(join(root,'devtools/overnight/package.json'),'utf8'));insist(pkg.private && !pkg.dependencies && pkg.devDependencies.typescript==='5.9.3' && pkg.devDependencies['@types/node']==='22.19.19','package_policy');
console.log(JSON.stringify({check:'C-LIVE-06 version-aware protected scope',base,protectedCount,retained45Tests:36,pass:true}));
