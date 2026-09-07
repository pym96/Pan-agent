#!/usr/bin/env python3
"""#42 UI-aware extension of #35 source→compiled tarball→production consumer proof, on the declared Node floor.

Guards/drivers are copied verification code, never Product implementation. Runtime
uses only the installed archive. Artifacts are retained; this script never publishes.
"""
import argparse, hashlib, json, os, re, shutil, stat, subprocess, tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--node',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--allow-dirty-development',action='store_true');p.add_argument('--tarball',type=Path);p.add_argument('--manifest',type=Path);args=p.parse_args()
node=args.node.resolve();out=args.output.resolve();assert not out.exists(),'output must be a new directory';out.mkdir(parents=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT).strip());assert not dirty or args.allow_dirty_development,'commit clean candidate before formal verification'
assert subprocess.check_output([str(node),'--version'],text=True).strip()=='v22.19.0','required consumer floor is Node 22.19.0'
toolchain=node.parent.parent;npm=toolchain/'lib/node_modules/npm/bin/npm-cli.js';assert npm.is_file()
commands=[]
def h(body):return hashlib.sha256(body).hexdigest()
def filehash(path):return h(path.read_bytes())
def save(name,data): (out/name).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
for name in ['home','guard-reports']: (out/name).mkdir()
for name in ['npm-user.conf','npm-global.conf']: (out/name).write_text('')
env={'PATH':f'{node.parent}:/usr/bin:/bin','HOME':str(out/'home'),'TMPDIR':str(out),'LANG':'C.UTF-8','NPM_CONFIG_USERCONFIG':str(out/'npm-user.conf'),'NPM_CONFIG_GLOBALCONFIG':str(out/'npm-global.conf'),'NPM_CONFIG_CACHE':str(out/'build-cache'),'NPM_CONFIG_REGISTRY':'https://registry.npmjs.org','NPM_CONFIG_UPDATE_NOTIFIER':'false'}
def run(command,cwd,name,environment=env,expected=0,input=None):
 log=out/(name+'.log')
 try:
  with log.open('w') as stream: result=subprocess.run([str(x) for x in command],cwd=cwd,env=environment,stdout=stream,stderr=subprocess.STDOUT,input=input,text=True,timeout=90)
  code=result.returncode
 except subprocess.TimeoutExpired: code='timeout'
 commands.append({'command':[str(x) for x in command],'cwd':str(cwd),'exit':code,'expected_exit':expected,'log':str(log),'sha256':filehash(log)})
 save('commands.json',commands)
 assert code==expected,f'{name}: exit {code}, expected {expected}; see {log}'
 return log
run([node,'--version'],out,'node-version');run([node,npm,'--version'],out,'npm-version');run(['/usr/bin/uname','-srm'],out,'os-version')
def members(archive):
 files=[];metadata=[]
 with tarfile.open(archive) as tar:
  for item in tar.getmembers():
   assert item.name.startswith('package/') and '..' not in Path(item.name).parts,item.name
   assert not item.issym() and not item.islnk(),item.name
   metadata.append({'path':item.name,'mode':item.mode,'mtime':item.mtime,'uid':item.uid,'gid':item.gid,'uname':item.uname,'gname':item.gname,'type':item.type.decode()})
   if not item.isfile():continue
   body=tar.extractfile(item).read();path=item.name.removeprefix('package/')
   assert path in ['README.md','RUNBOOK.md','package.json','bin/pan-agent.mjs'] or (path.startswith('dist/') and (path.endswith('.js') or path.endswith('.d.ts'))),path
   files.append({'path':path,'mode':item.mode & 0o777,'sha256':h(body),'bytes':len(body)})
   if path.endswith(('.js','.mjs')):
    assert not re.search(rb'(?:from\s*|import\s*\()[\'"][^\'"]+\.ts[\'"]',body),path
    assert b'@earendil-works/pi-' not in body,path
 normalized=sorted(files,key=lambda row:row['path'])
 for required in ['dist/index.js','dist/cli.js','bin/pan-agent.mjs','RUNBOOK.md','package.json']:assert any(x['path']==required for x in normalized),required
 return normalized,metadata
package=ROOT/'typescript'
if args.tarball:
 assert args.manifest,'retained artifact requires its expected normalized file manifest'
 archive=out/'retained.tgz';shutil.copy2(args.tarball,archive)
 normalized,metadata=members(archive);assert normalized==json.loads(args.manifest.read_text())
 save('tar-metadata.json',metadata)
else:
 snapshots=[];archives=[]
 for iteration in [1,2]:
  destination=out/f'pack-{iteration}';destination.mkdir()
  # Normal npm pack runs the declared prepack compiler recipe; that recipe clears dist.
  run([node,npm,'pack','--json','--pack-destination',destination,'--offline','--no-audit','--no-fund'],package,f'pack-{iteration}')
  found=list(destination.glob('*.tgz'));assert len(found)==1
  current,metadata=members(found[0]);snapshots.append(current);archives.append(found[0]);save(f'tar-metadata-{iteration}.json',metadata)
 assert snapshots[0]==snapshots[1],'clean builds changed a file path, mode or content'
 archive=archives[0];normalized=snapshots[0]
 emitted=[]
 for source in sorted((package/'src').rglob('*.ts')):
  relative=source.relative_to(package/'src');js=package/'dist'/relative.with_suffix('.js');declaration=package/'dist'/relative.with_suffix('.d.ts')
  assert js.is_file() and declaration.is_file()
  emitted.append({'source':str(source.relative_to(ROOT)),'source_sha256':filehash(source),'js':str(js.relative_to(package)),'js_sha256':filehash(js),'declaration_sha256':filehash(declaration)})
 save('source-build-map.json',emitted)
 # Use the pinned compiler parser at build time, never in the production consumer.
 parser=r'''import ts from './node_modules/typescript/lib/typescript.js'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
const files=fs.readdirSync('dist',{recursive:true}).filter(p=>p.endsWith('.js')).map(p=>path.resolve('dist',p));files.push(path.resolve('bin/pan-agent.mjs'));
const graph={};for(const file of files){const imports=ts.preProcessFile(fs.readFileSync(file,'utf8'),true,true).importedFiles.map(x=>x.fileName);for(const name of imports){assert.ok(name.startsWith('node:')||name.startsWith('.'),name);if(name.startsWith('.'))assert.ok(files.includes(path.resolve(path.dirname(file),name)),name);}graph[path.relative(process.cwd(),file)]=imports;}console.log(JSON.stringify(graph,null,2));'''
 run([node,'--input-type=module','-e',parser],package,'compiled-static-graph')
save('runtime-files.json',normalized)
save('artifact-identity.json',{'source_sha':sha,'development_dirty_source':dirty,'tarball':str(archive),'tarball_sha256':filehash(archive),'runtime_manifest_sha256':filehash(out/'runtime-files.json'),'gzip_header_hex':archive.read_bytes()[:10].hex(),'normalization':'all regular file paths, exact permission modes and content SHA-256; only tar/gzip metadata kept separately','toolchain':{'node':str(node),'npm':str(npm)},'compiler_version':json.loads((package/'node_modules/typescript/package.json').read_text())['version'] if not args.tarball else 'see source-build evidence'})
consumer=out/'consumer';consumer.mkdir();(consumer/'package.json').write_text(json.dumps({'name':'wo35-consumer','private':True,'type':'module','devDependencies':{}})+'\n')
for ancestor in consumer.parents:assert not (ancestor/'node_modules').exists(),f'ancestor dependencies: {ancestor}'
assert not (consumer/'.git').exists();tarball=consumer/archive.name;shutil.copy2(archive,tarball);assert filehash(tarball)==filehash(archive)
instrumentation=consumer/'verification';instrumentation.mkdir()
for source,name in [('scripts/wo35-consumer-guard.mjs','guard.mjs'),('scripts/wo42-consumer-driver.mjs','driver.mjs'),('scripts/fixtures/packed-create-run-verify-v1.json','fixture.json'),('scripts/fixtures/tui-replay-consumer.mjs','replay.mjs'),('scripts/fixtures/tui-archive-consumer.mjs','archives.mjs')]:shutil.copy2(ROOT/source,instrumentation/name)
# npm config/cache start empty, inside the fresh task area. No inherited tokens/config.
cache=consumer/'npm-cache';cache.mkdir();assert list(cache.iterdir())==[]
consumer_env={**env,'NPM_CONFIG_CACHE':str(cache)}
def guarded(directory,phase,install=False):
 config=out/(phase+'-guard-config.json')
 allowed=[str(directory),str(out/'guard-reports'),str(out/'home'),str(out/'npm-user.conf'),str(out/'npm-global.conf'),str(config)]
 if install:allowed.append(str(toolchain))
 data={'phase':phase,'consumer':str(directory),'allowed':allowed,'denied':[str(ROOT),str(ROOT/'references')],'report':str(out/'guard-reports'/phase)}
 config.write_text(json.dumps(data,indent=2)+'\n')
 return {**consumer_env,'NODE_OPTIONS':f'--import={directory}/verification/guard.mjs','WO35_GUARD_CONFIG':str(config)}
install_env=guarded(consumer,'install',True)
run([node,npm,'--prefix',consumer,'install',str(tarball),'--omit=dev','--offline','--ignore-scripts','--no-audit','--no-fund'],consumer,'consumer-install',install_env)
run([node,npm,'--prefix',consumer,'ls','--all','--json'],consumer,'consumer-npm-ls',guarded(consumer,'npm-ls',True))
metadata=json.loads((consumer/'package.json').read_text());assert metadata.get('devDependencies',{})=={}
physical=[]
for path in (consumer/'node_modules').rglob('package.json'):
 data=json.loads(path.read_text());physical.append({'path':str(path.relative_to(consumer)),'name':data['name'],'version':data['version'],'realpath':str(path.resolve())})
assert [entry['name'] for entry in physical]==['pan-agent'],physical
installed=consumer/'node_modules/pan-agent'
def verify_installed(directory):
 actual={str(file.relative_to(directory)) for file in directory.rglob('*') if file.is_file()}
 assert actual=={entry['path'] for entry in normalized},'installed file inventory changed'
 for entry in normalized:
  file=directory/entry['path'];assert file.is_file() and not file.is_symlink(),file
  assert filehash(file)==entry['sha256'],file
  assert stat.S_IMODE(file.stat().st_mode)==entry['mode'],(file,oct(stat.S_IMODE(file.stat().st_mode)),entry['mode'])
verify_installed(installed)
save('installed-runtime-files.json',[{**entry,'realpath':str((installed/entry['path']).resolve()),'installed_sha256':filehash(installed/entry['path']),'installed_mode':stat.S_IMODE((installed/entry['path']).stat().st_mode)} for entry in normalized])
for path in (consumer/'node_modules').rglob('*'):
 if path.is_symlink():assert path.resolve().is_relative_to(installed),path
executable=consumer/'node_modules/.bin/pan-agent';assert executable.resolve()==installed/'bin/pan-agent.mjs'
assert (executable.stat().st_mode & stat.S_IXUSR)!=0
package_metadata=json.loads((installed/'package.json').read_text());assert package_metadata['private'] is True
for target in package_metadata['exports'].values():
 for entry in target.values():assert (installed/entry).resolve().is_relative_to(installed) and (installed/entry).is_file()
save('physical-production-packages.json',physical)
shutil.copy2(consumer/'package-lock.json',out/'consumer-lock.json')
# Invoke the actual executable as a subprocess with ordinary Node. No TS loader.
for name,arguments,expected,diagnostic in [('help',['--help'],0,'Usage:'),('omitted',[],2,'kernel_selection_required'),('pi',['--kernel','pi'],2,'kernel_not_in_product'),('unknown',['--kernel','other'],2,'Unsupported kernel')]:
 log=run([executable,*arguments],consumer,'bin-'+name,guarded(consumer,'bin-'+name),expected)
 assert diagnostic in log.read_text()
 assert not (consumer/'memory').exists()
startup_workspace=consumer/'startup-workspace';startup_workspace.mkdir();startup_memory=consumer/'startup-memory'
log=run([executable,'--kernel','native','--workspace',startup_workspace,'--memory-root',startup_memory],consumer,'bin-native-decline',guarded(consumer,'bin-native-decline'),input='n\n')
assert 'trusted-local' in log.read_text() and 'Cancelled before Provider use.' in log.read_text()
assert not list((startup_memory/'runs').iterdir()),'declined startup created a run'
# Also execute without even the verification --import preload.
run([executable,'--help'],consumer,'bin-help-no-preload',consumer_env)
run([node,instrumentation/'driver.mjs'],consumer,'installed-tracer',guarded(consumer,'tracer'))
run([node,instrumentation/'archives.mjs'],consumer,'installed-cancelled-archives',guarded(consumer,'cancelled-archives'))
run([node,instrumentation/'replay.mjs'],consumer,'installed-fresh-replay',guarded(consumer,'fresh-replay'))
report=json.loads((consumer/'tracer-report.json').read_text());assert report['model_exchanges']==4 and report['tool_names']==['write','bash','read']
verify_installed(installed)
# Separate adversarial inputs are intercepted before any read/load/connect and
# cannot contaminate the zero-attempt nominal report.
controls={
 'caught-pi':"try { await import('@earendil-works/pi-ai'); } catch {}",
 'caught-checkout':f"import fs from 'node:fs'; try {{ fs.readFileSync({json.dumps(str(ROOT/'README.md'))}); }} catch {{}}",
 'caught-network':"try { await fetch('https://example.invalid/wo35-negative-control'); } catch {}",
}
for name,code in controls.items():run([node,'--input-type=module','-e',code],consumer,name,guarded(consumer,name),expected=1)
negative=out/'missing-runbook-consumer';shutil.copytree(consumer,negative,symlinks=True);(negative/'node_modules/pan-agent/RUNBOOK.md').unlink()
missing_workspace=negative/'missing-workspace';missing_workspace.mkdir();missing_memory=negative/'missing-memory'
log=run([negative/'node_modules/.bin/pan-agent','--kernel','native','--workspace',missing_workspace,'--memory-root',missing_memory],negative,'missing-runbook',guarded(negative,'missing-runbook'),expected=2)
assert 'Validation failed:' in log.read_text() and 'RUNBOOK.md' in log.read_text();assert not missing_memory.exists()
verify_installed(installed)
nominal=[];negative_reports=[]
keys=['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny']
for file in sorted((out/'guard-reports').glob('*.json')):
 data=json.loads(file.read_text())
 if data['phase'].startswith('caught-'):negative_reports.append(data)
 else:
  for key in keys:assert data[key]==0,(file,key,data[key])
  nominal.append(data)
for phase,key in [('caught-pi','forbidden_resolution'),('caught-checkout','forbidden_filesystem'),('caught-network','network_attempts')]:
 selected=[r for r in negative_reports if r['phase']==phase];assert len(selected)==1 and selected[0][key]==1,phase
phases={r['phase'] for r in nominal};assert {'install','npm-ls','bin-help','bin-omitted','bin-pi','bin-unknown','bin-native-decline','tracer','missing-runbook'}<=phases
tracer=[r for r in nominal if r['phase']=='tracer'][0];assert len(tracer['children'])==1 and tracer['children'][0]['exit']==0
save('summary.json',{'source_sha':sha,'development_dirty_source':dirty,'tarball_sha256':filehash(archive),'node':'v22.19.0','case':'packed-create-run-verify/v1','consumer':str(consumer),'installed_packages':physical,'nominal_meter_totals':{key:sum(r[key] for r in nominal) for key in keys},'negative_controls':{r['phase']:{key:r[key] for key in keys} for r in negative_reports},'tracer_report_sha256':filehash(consumer/'tracer-report.json'),'runtime_files_unchanged':True,'package_or_toolchain_fetches':'none in consumer; build dependencies/toolchain supplied beforehand'})
print('PASS Node 22.19.0 packed consumer checks; retained evidence:',out)
