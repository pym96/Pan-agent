#!/usr/bin/env python3
"""Reproduce D101/D102/D107 from a clean committed source candidate (not packed consumer)."""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
assert not subprocess.check_output(['git','status','--porcelain'],cwd=ROOT).strip(), 'committed clean candidate required'
artifacts=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(tempfile.mkdtemp(prefix='wo34-isolation-evidence-'))
artifacts.mkdir(parents=True,exist_ok=True)
checkout=artifacts/'checkout'
assert not checkout.exists(), 'choose a new artifact directory'
commands=[]
def run(command,cwd=ROOT,env=None,name=None,expected=0):
 path=artifacts/(name or f'command-{len(commands):02}.log')
 with path.open('w') as out: result=subprocess.run(command,cwd=cwd,env=env,stdout=out,stderr=subprocess.STDOUT)
 commands.append({'command':command,'cwd':str(cwd),'exit':result.returncode,'log':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 (artifacts/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
 assert result.returncode==expected, f'{command} exit {result.returncode}: {path}'
 return path
run(['git','clone','--no-hardlinks','--no-checkout',str(ROOT),str(checkout)],name='clone.log')
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
run(['git','checkout','--detach',sha],cwd=checkout,name='checkout.log')
shutil.rmtree(checkout/'references')
product=checkout/'typescript'
# Public registry only, no inherited user/npm/provider config or NODE_PATH/NODE_OPTIONS.
home=artifacts/'empty-home';home.mkdir();userconfig=artifacts/'npm-user.conf';userconfig.touch();globalconfig=artifacts/'npm-global.conf';globalconfig.touch()
env={'PATH':os.environ['PATH'],'HOME':str(home),'TMPDIR':str(artifacts),'LANG':'C.UTF-8','NPM_CONFIG_USERCONFIG':str(userconfig),'NPM_CONFIG_GLOBALCONFIG':str(globalconfig),'NPM_CONFIG_REGISTRY':'https://registry.npmjs.org'}
for ancestor in product.parents:
 modules=ancestor/'node_modules'
 assert not modules.exists(), f'ancestor dependency resolution available: {modules}'
run(['npm','ci','--ignore-scripts'],cwd=product,env=env,name='install.log')
ls=run(['npm','ls','--all','--json'],cwd=product,env=env,name='npm-ls.json')
lock=json.loads((product/'package-lock.json').read_text());manifest=json.loads((product/'package.json').read_text())
assert not any(k in manifest for k in ['workspaces','optionalDependencies','peerDependencies','bundledDependencies','bundleDependencies'])
assert not any(k in manifest['scripts'] for k in ['preinstall','install','postinstall','prepare'])
assert '@earendil-works/pi-' not in json.dumps(lock)+json.dumps(manifest)+ls.read_text()
physical={}
for p in (product/'node_modules').rglob('package.json'):
 assert not p.is_symlink(),p
 package=json.loads(p.read_text());name=package.get('name','')
 assert not name.startswith('@earendil-works/pi-'),p
 physical[str(p.relative_to(product))]={'name':name,'version':package.get('version'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
assert {v['name'] for v in physical.values()}=={'@types/node','typescript','undici-types'},physical
for p in (product/'node_modules').rglob('*'):
 if p.is_symlink(): assert p.resolve().is_relative_to(product/'node_modules'),p
(artifacts/'physical-packages.json').write_text(json.dumps(physical,indent=2)+'\n')
types=run(['npm','run','typecheck','--','--listFiles'],cwd=product,env=env,name='compiler-inputs.log')
assert '@earendil-works/pi-' not in types.read_text() and '/references/' not in types.read_text()
pack=run(['npm','pack','--dry-run','--json','--ignore-scripts'],cwd=product,env=env,name='source-package-inventory.json')
for entry in json.loads(pack.read_text())[0]['files']:
 assert not entry['path'].startswith(('references/','node_modules/')),entry
# Compiler parser enumerates every static/type root, not just a string grep.
graph_script=r'''
import ts from './node_modules/typescript/lib/typescript.js';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
const files=fs.readdirSync('src',{recursive:true}).filter(p=>p.endsWith('.ts')).map(p=>path.resolve('src',p));
const graph={};
for(const file of files) {
 const imports=ts.preProcessFile(fs.readFileSync(file,'utf8'),true,true).importedFiles.map(x=>x.fileName);
 for(const name of imports) {
  assert.ok(name.startsWith('node:') || name.startsWith('.'), `${file}: ${name}`);
  if(name.startsWith('.')) { const resolved=path.resolve(path.dirname(file),name); assert.ok(files.includes(resolved),resolved); }
 }
 graph[file]=imports;
}
console.log(JSON.stringify(graph,null,2));
'''
run(['node','--input-type=module','-e',graph_script],cwd=product,env=env,name='static-type-graph.json')
guard=str(checkout/'scripts/wo34-runtime-guard.mjs')
offline={**env,'NODE_OPTIONS':f'--import={guard}','WO34_GUARD_REPORT':str(artifacts/'runtime')}
run(['npm','test'],cwd=product,env=offline,name='product-offline.log')
run(['npm','run','conformance'],cwd=product,env=offline,name='product-conformance.log')
for args,code in [(['--help'],0),([],2),(['--kernel','pi'],2),(['--kernel','unknown'],2)]:
 run(['node','src/cli.ts',*args],cwd=product,env=offline,name='cli-'+(args[-1] if args else 'omitted')+'.log',expected=code)
reports=[json.loads(p.read_text()) for p in artifacts.glob('runtime.*.json')]
assert len(reports)>4,'runtime instrumentation did not execute'
for report in reports:
 for key in ['forbidden_resolution','reference_filesystem','real_transport_attempts','real_credential_reads','balance_queries','paid_formal_runs','cost_cny']:
  assert report[key]==0,(key,report)
# Demonstrate a caught dynamic request still makes the process fail. No library is resolved.
run(['node','--input-type=module','-e',"try { await import('@earendil-works/pi-ai'); } catch {}"],cwd=product,env={**offline,'WO34_GUARD_REPORT':str(artifacts/'intentional-negative')},name='caught-forbidden-negative.log',expected=1)
negative=[json.loads(p.read_text()) for p in artifacts.glob('intentional-negative.*.json')]
assert len(negative)==1 and negative[0]['forbidden_resolution']==1
summary={'candidate':sha,'reference_absent':not (checkout/'references').exists(),'ancestor_node_modules_absent':True,'global_resolution':'NODE_PATH omitted; exercised resolutions logged and Pi denied before and after resolution','physical_package_count':len(physical),'runtime_process_reports':len(reports),'real_provider_calls':0,'real_credential_reads':0,'balance_queries':0,'paid_formal_runs':0,'cost_cny':0,'package_install':'ordinary public npm registry; separately logged','intentional_negative_forbidden_resolution':1}
(artifacts/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2));print('PASS source Product isolation; artifacts:',artifacts)
