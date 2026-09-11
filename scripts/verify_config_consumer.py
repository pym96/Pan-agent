#!/usr/bin/env python3
"""#52 first-run settings and explicit credential storage: installed clean-consumer proof.

Builds the exact candidate tarball, installs offline into a fresh consumer, then:
configure (env source) → restart+task (Faux) → fresh replay; closed-selection matrix;
synthetic-canary containment incl. transport boundary probe; disposable Keychain
accept/decline/interrupt lifecycle with independent security-CLI verification.
Guard/driver code is copied verification code, never Product implementation.
"""
import argparse, hashlib, json, os, re, shutil, signal, stat, subprocess, tarfile, time, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--node',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--allow-dirty-development',action='store_true');p.add_argument('--tarball',type=Path);p.add_argument('--manifest',type=Path);args=p.parse_args()
node=args.node.resolve();out=args.output.resolve();assert not out.exists(),'output must be a new directory';out.mkdir(parents=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT).strip());assert not dirty or args.allow_dirty_development,'commit clean candidate before formal verification'
assert subprocess.check_output([str(node),'--version'],text=True).strip()=='v22.19.0','required consumer floor is Node 22.19.0'
toolchain=node.parent.parent;npm=toolchain/'lib/node_modules/npm/bin/npm-cli.js';assert npm.is_file()
KEYCHAIN_SERVICE='com.pym96.pan-agent.workorder-52-test'
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
 parser=r'''import ts from './node_modules/typescript/lib/typescript.js'; import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
const files=fs.readdirSync('dist',{recursive:true}).filter(p=>p.endsWith('.js')).map(p=>path.resolve('dist',p));files.push(path.resolve('bin/pan-agent.mjs'));
const graph={};for(const file of files){const imports=ts.preProcessFile(fs.readFileSync(file,'utf8'),true,true).importedFiles.map(x=>x.fileName);for(const name of imports){assert.ok(name.startsWith('node:')||name.startsWith('.'),name);if(name.startsWith('.'))assert.ok(files.includes(path.resolve(path.dirname(file),name)),name);}graph[path.relative(process.cwd(),file)]=imports;}console.log(JSON.stringify(graph,null,2));'''
 run([node,'--input-type=module','-e',parser],package,'compiled-static-graph')
save('runtime-files.json',normalized)
save('artifact-identity.json',{'source_sha':sha,'development_dirty_source':dirty,'tarball':str(archive),'tarball_sha256':filehash(archive),'runtime_manifest_sha256':filehash(out/'runtime-files.json'),'gzip_header_hex':archive.read_bytes()[:10].hex(),'normalization':'all regular file paths, exact permission modes and content SHA-256; only tar/gzip metadata kept separately','toolchain':{'node':str(node),'npm':str(npm)},'compiler_version':json.loads((package/'node_modules/typescript/package.json').read_text())['version'] if not args.tarball else 'see source-build evidence'})
fixture=json.loads((ROOT/'scripts/fixtures/preview-first-task-v1.json').read_text());assert fixture['id']=='preview-first-task/v1'
expected={'final':fixture['final'],'hello_sha256':h(fixture['calls'][0]['arguments']['content'].encode()),'expected_stdout':fixture['expected_stdout']}
canary_env_value=f'CANARY-WO52-ENV-{uuid.uuid4().hex[:20]}'
canary_keychain_value=f'CANARY-WO52-KC-{uuid.uuid4().hex[:20]}'
canaries={'values':[canary_env_value,canary_keychain_value],'note':'synthetic per-run canaries; never real credentials'}
keychain_account=f'test-{uuid.uuid4().hex[:12]}'
consumer=out/'consumer';consumer.mkdir();(consumer/'package.json').write_text(json.dumps({'name':'wo52-consumer','private':True,'type':'module','devDependencies':{}})+'\n')
for ancestor in consumer.parents:assert not (ancestor/'node_modules').exists(),f'ancestor dependencies: {ancestor}'
assert not (consumer/'.git').exists();tarball=consumer/archive.name;shutil.copy2(archive,tarball);assert filehash(tarball)==filehash(archive)
instrumentation=consumer/'verification';instrumentation.mkdir()
for source,name in [('scripts/wo35-consumer-guard.mjs','guard.mjs'),('scripts/fixtures/preview/config-configure-driver.mjs','configure.mjs'),('scripts/fixtures/preview/config-task-driver.mjs','task.mjs'),('scripts/fixtures/preview/replay-driver.mjs','replay.mjs'),('scripts/fixtures/preview/config-boundary-driver.mjs','boundary.mjs'),('scripts/fixtures/preview/config-keychain-driver.mjs','keychain.mjs'),('scripts/fixtures/preview-first-task-v1.json','fixture.json')]:shutil.copy2(ROOT/source,instrumentation/name)
(instrumentation/'expected-result.json').write_text(json.dumps(expected,indent=2)+'\n')
(instrumentation/'canaries.json').write_text(json.dumps(canaries,indent=2)+'\n')
(instrumentation/'answers-env.json').write_text(json.dumps({'answers':['','deepseek-v4-pro','max','environment']})+'\n')
(instrumentation/'answers-kimi.json').write_text(json.dumps({'answers':['kimi-code']})+'\n')
cache=consumer/'npm-cache';cache.mkdir();assert list(cache.iterdir())==[]
consumer_env={**env,'NPM_CONFIG_CACHE':str(cache)}
def guarded(directory,phase,install=False):
 config=out/(phase+'-guard-config.json')
 allowed=[str(directory),str(out/'guard-reports'),str(out/'home'),str(out/'npm-user.conf'),str(out/'npm-global.conf'),str(config)]
 if install:allowed.append(str(toolchain))
 data={'phase':phase,'consumer':str(directory),'allowed':allowed,'denied':[str(ROOT),str(ROOT/'references')],'report':str(out/'guard-reports'/phase)}
 config.write_text(json.dumps(data,indent=2)+'\n')
 return {**consumer_env,'NODE_OPTIONS':f'--import={directory}/verification/guard.mjs','WO35_GUARD_CONFIG':str(config)}
canary_env={'DEEPSEEK_API_KEY':canary_env_value,'OPENAI_API_KEY':canary_keychain_value}
def security(*argv,expected=0):
 result=subprocess.run(['security',*argv],capture_output=True,text=True)
 assert result.returncode==expected,(argv,result.returncode,result.stderr)
 return result
def keychain_absent():
 return subprocess.run(['security','find-generic-password','-s',KEYCHAIN_SERVICE,'-a',keychain_account,'-w'],capture_output=True,text=True).returncode!=0
assert keychain_absent(),'test keychain item must not pre-exist'
cleanup_ok=False
try:
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
 for name,arguments,expected_exit,diagnostic in [('help',['--help'],0,'Usage:'),('omitted',[],2,'kernel_selection_required'),('pi',['--kernel','pi'],2,'kernel_not_in_product'),('unknown',['--kernel','other'],2,'Unsupported kernel')]:
  log=run([executable,*arguments],consumer,'bin-'+name,guarded(consumer,'bin-'+name),expected_exit)
  assert diagnostic in log.read_text()
  assert not (consumer/'memory').exists()
 startup_workspace=consumer/'startup-workspace';startup_workspace.mkdir();startup_memory=consumer/'startup-memory'
 log=run([executable,'--kernel','native','--workspace',startup_workspace,'--memory-root',startup_memory],consumer,'bin-native-decline',guarded(consumer,'bin-native-decline'),input='n\n')
 assert 'trusted-local' in log.read_text() and 'Cancelled before Provider use.' in log.read_text()
 assert not list((startup_memory/'runs').iterdir()),'declined startup created a run'
 run([executable,'--help'],consumer,'bin-help-no-preload',consumer_env)
 # C-CONFIG-02 closed selection matrix against the installed executable.
 settings_home=consumer/'settings-home';settings_home.mkdir()
 for name,arguments,diagnostic in [('matrix-model-kimi',['--kernel','native','--model','kimi-code'],'Unsupported DeepSeek model'),('matrix-model-bogus',['--kernel','native','--model','bogus'],'Unsupported DeepSeek model'),('matrix-thinking',['--kernel','native','--thinking','ultra'],'Unsupported thinking level'),('matrix-endpoint',['--kernel','native','--endpoint','https://evil.example'],'Unknown argument: --endpoint')]:
  log=run([executable,*arguments],consumer,name,guarded(consumer,name),2)
  assert diagnostic in log.read_text(),(name,diagnostic)
 assert not (settings_home/'.pan-agent').exists(),'rejected choices must not persist settings'
 # kimi-code through the wizard: explicit unavailable, nothing persisted, cancellation on EOF.
 log=run([node,instrumentation/'configure.mjs',installed,settings_home,instrumentation/'answers-kimi.json',keychain_account,'kimi'],consumer,'configure-kimi',{**guarded(consumer,'configure-kimi'),**canary_env},expected=2)
 kimi_report=json.loads((settings_home/'configure-report.json').read_text())
 assert 'kimi-code: unavailable in this build' in kimi_report['rendered'] and kimi_report['settings'] is None and not kimi_report['itemExists']
 # C-CONFIG-01: configure with environment source, canaries present in the parent env.
 log=run([node,instrumentation/'configure.mjs',installed,settings_home,instrumentation/'answers-env.json',keychain_account,'accept-env'],consumer,'configure-env',{**guarded(consumer,'configure-env'),**canary_env})
 configure_report=json.loads((settings_home/'configure-report.json').read_text())
 settings_file=settings_home/'.pan-agent/settings.json';assert settings_file.is_file()
 settings_bytes=settings_file.read_bytes();settings=json.loads(settings_bytes)
 assert settings=={'schemaVersion':1,'provider':'deepseek','modelId':'deepseek-v4-pro','thinkingLevel':'max','credentialSource':'environment'},settings
 assert stat.S_IMODE(settings_file.stat().st_mode)==0o600
 for canary in canaries['values']:assert canary.encode() not in settings_bytes,'canary in settings'
 assert not configure_report['itemExists']
 # C-CONFIG-01/05: restart with persisted settings runs the deterministic Faux task offline.
 run([node,instrumentation/'task.mjs'],consumer,'configured-task',{**guarded(consumer,'task'),**canary_env})
 report=json.loads((consumer/'tracer-report.json').read_text())
 assert report['model_exchanges']==4 and report['canary_leaks']==0 and report['securityCalls']==0
 assert report['capturedProfile']=={'modelId':'deepseek-v4-pro','thinkingLevel':'max'},'restart must restore persisted selection'
 assert report['settingsSource']=='environment'
 run_id=report['run_id']
 verify_installed(installed)
 # C-CONFIG-05: fresh-process replay adds zero exchanges/effects and mutates nothing.
 run([node,instrumentation/'replay.mjs',installed,consumer/'workspace',consumer/'memory',run_id,consumer/'replay-report.json'],consumer,'configured-replay',{**guarded(consumer,'replay'),**canary_env})
 replay=json.loads((consumer/'replay-report.json').read_text());assert replay['model_exchanges']==0 and replay['effects']==0 and replay['taskReads']==0 and replay['canary_leaks']==0
 assert replay['sealedBefore']==replay['sealedAfter'] and replay['workspaceBefore']==replay['workspaceAfter']
 # C-CONFIG-03: transport boundary probe (unguarded by design; guard intentionally throws on credential-pattern env reads).
 run([node,instrumentation/'boundary.mjs',installed,instrumentation,consumer/'boundary-report.json'],consumer,'boundary-probe',{**consumer_env,**canary_env})
 boundary=json.loads((consumer/'boundary-report.json').read_text())
 assert boundary['endpoint']=='https://api.deepseek.com/chat/completions' and boundary['realFetchTouched'] is False
 # C-CONFIG-04: disposable Keychain lifecycle, independently checked through the security CLI.
 for mode in ['accept','decline','denied','fail-after-save','interrupt-after-save']:
  expected_exit={'interrupt-after-save':143,'fail-after-save':1}.get(mode,0)
  run([node,instrumentation/'keychain.mjs',installed,settings_home,keychain_account,mode,canary_keychain_value],consumer,f'keychain-{mode}',guarded(consumer,f'keychain-{mode}'),expected=expected_exit)
  report=json.loads((settings_home/'keychain-report.json').read_text())
  assert report['canaryInChildArgv'] is False and report['canaryInChildEnv'] is False,(mode,report)
  for call in report.get('children',[]):
   assert call['command']=='security',(mode,call)
   if call['args']!=['-i']:
    assert KEYCHAIN_SERVICE in call['args'] and keychain_account in call['args'],(mode,call)
   if call['env'] is not None:
    for value in call['env'].values():assert canary_keychain_value not in str(value) and canary_env_value not in str(value)
  assert keychain_absent(),f'{mode}: test item must be cleaned up'
  if mode=='accept':
   assert report['ok'] and 'item-created-and-retrieved' in report['steps']
   settings_after=json.loads(settings_file.read_bytes());assert settings_after['credentialSource']=='keychain'
   for canary in canaries['values']:assert canary.encode() not in settings_file.read_bytes()
  if mode=='decline':
   assert report['ok'] and 'decline-no-item' in report['steps']
  if mode=='denied':
   assert report['ok'] and 'denied-explicit' in report['steps']
   assert not any(c['args']==['-i'] for c in report.get('children',[])),'denied must not write'
  if mode=='fail-after-save':
   assert not report['ok'] and 'deliberate-failure' in report['steps'] and report['cleanedUp']
  if mode=='interrupt-after-save':
   assert report.get('interrupted') and report['ok'],'interrupted run reports its state before the signal'
 # restore environment-source settings for the final installed-state assertion
 run([node,instrumentation/'configure.mjs',installed,settings_home,instrumentation/'answers-env.json',keychain_account,'accept-env-final'],consumer,'configure-env-final',{**guarded(consumer,'configure-env-final'),**canary_env})
 # C-CONFIG-03: canaries reach no consumer surface, including package and evidence files.
 for file in consumer.rglob('*'):
  if file.is_file() and not file.is_symlink() and file != instrumentation/'canaries.json':
   body=file.read_bytes()
   for canary in canaries['values']:assert canary.encode() not in body,f'canary reached {file}'
 controls={
  'caught-pi':"try { await import('@earendil-works/pi-ai'); } catch {}",
  'caught-checkout':f"import fs from 'node:fs'; try {{ fs.readFileSync({json.dumps(str(ROOT/'README.md'))}); }} catch {{}}",
  'caught-network':"try { await fetch('https://example.invalid/wo52-negative-control'); } catch {}",
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
 phases={r['phase'] for r in nominal};assert {'install','npm-ls','bin-help','bin-omitted','bin-pi','bin-unknown','bin-native-decline','configure-env','task','replay','keychain-accept','keychain-decline','keychain-interrupt-after-save','missing-runbook'}<=phases
 task_guard=[r for r in nominal if r['phase']=='task'][0];assert len(task_guard['children'])==1 and task_guard['children'][0]['exit']==0
 replay_guard=[r for r in nominal if r['phase']=='replay'][0];assert replay_guard['children']==[],'replay must not spawn children'
 save('summary.json',{'source_sha':sha,'development_dirty_source':dirty,'tarball_sha256':filehash(archive),'node':'v22.19.0','case':'preview-first-task/v1 + first-run settings','run_id':run_id,'keychain_test_service':KEYCHAIN_SERVICE,'keychain_test_account':keychain_account,'keychain_cleanup_verified':keychain_absent(),'consumer':str(consumer),'installed_packages':physical,'nominal_meter_totals':{key:sum(r[key] for r in nominal) for key in keys},'negative_controls':{r['phase']:{key:r[key] for key in keys} for r in negative_reports},'tracer_report_sha256':filehash(consumer/'tracer-report.json'),'replay_report_sha256':filehash(consumer/'replay-report.json'),'boundary_report_sha256':filehash(consumer/'boundary-report.json'),'canary_leaks':0,'runtime_files_unchanged':True,'package_or_toolchain_fetches':'none in consumer; build dependencies/toolchain supplied beforehand'})
 cleanup_ok=True
 print('PASS Node 22.19.0 configured consumer checks; retained evidence:',out)
finally:
 left=subprocess.run(['security','delete-generic-password','-s',KEYCHAIN_SERVICE,'-a',keychain_account],capture_output=True)
 if not keychain_absent(): raise SystemExit('FATAL: disposable keychain item leaked')
