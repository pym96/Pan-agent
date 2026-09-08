import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { insist, digest, safe } from './model.ts';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const base='eda8bd58e95ff52af95fe2e021ebf6c7778ba74f';
const allowed=new Set(['devtools/README.md','README.md','docs/design/README.md','docs/evidence/README.md','docs/agents/README.md','docs/agents/current-assignment.md','docs/design/overnight-handoff.md','docs/design/workorder-45-obligations.json','docs/evidence/overnight-handoff-offline-candidate.md']);
const git=(args:string[])=>execFileSync('/usr/bin/git',args,{cwd:root,encoding:'utf8'});
const paths=git(['ls-tree','-r','--name-only',base]).trim().split('\n');let protectedCount=0;
for(const path of paths)if(!allowed.has(path)) {
 const before=execFileSync('/usr/bin/git',['show',`${base}:${path}`],{cwd:root});
 insist(existsSync(join(root,path)) && before.equals(readFileSync(join(root,path))),'protected_bytes_changed');protectedCount++;
}
for(const path of git(['diff','--name-only',base]).trim().split('\n').filter(Boolean))insist(allowed.has(path)||path.startsWith('devtools/overnight/'),'scope_delta');
for(const path of git(['ls-files','--others','--exclude-standard']).trim().split('\n').filter(Boolean))insist(allowed.has(path)||path.startsWith('devtools/overnight/'),'scope_new_file');
const pkg=JSON.parse(readFileSync(join(root,'devtools/overnight/package.json'),'utf8'));
insist(pkg.private===true && !pkg.dependencies && pkg.devDependencies.typescript==='5.9.3' && pkg.devDependencies['@types/node']==='22.19.19','package_policy');
const walk=(dir:string):void=>{for(const name of readdirSync(dir,{withFileTypes:true})) {const path=join(dir,name.name);if(name.isDirectory())walk(path);else if(name.name.endsWith('.ts'))insist(!/from\s+['"][^'"]*(?:typescript\/src|references\/|pan-agent|@mariozechner)/.test(readFileSync(path,'utf8')),'product_import');}};
walk(join(root,'devtools/overnight/src'));
console.log(safe({simulation:'SIMULATED',check:'A-PACKAGE protected bytes and independent package',base,protectedCount,pass:true}));
