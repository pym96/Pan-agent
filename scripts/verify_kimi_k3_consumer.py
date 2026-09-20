#!/usr/bin/env python3
"""#68 clean offline install and actual CLI/Session/K3 proof; no real credential sources."""
import argparse, hashlib, json, os, shutil, subprocess, tarfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=Path(__file__).resolve().parents[1];out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
node=a.node.resolve();npm=Path(shutil.which('npm')).resolve()
def git(*args):return subprocess.check_output(['git',*args],cwd=repo,text=True).strip()
assert not git('status','--porcelain'),'committed clean candidate required'
sha=git('rev-parse','HEAD');assert subprocess.check_output([node,'--version'],text=True).strip()=='v22.19.0'
h=lambda path:hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save(name,data):(out/name).write_text(json.dumps(data,indent=2)+'\n')
(out/'home').mkdir();(out/'npm-user.conf').write_text('');(out/'npm-global.conf').write_text('')
env={'PATH':str(node.parent)+':'+str(Path(shutil.which('npm')).parent)+':/usr/bin:/bin','HOME':str(out/'home'),'TMPDIR':str(out),'LANG':'en_US.UTF-8','NPM_CONFIG_CACHE':str(out/'cache'),'NPM_CONFIG_USERCONFIG':str(out/'npm-user.conf'),'NPM_CONFIG_GLOBALCONFIG':str(out/'npm-global.conf'),'NPM_CONFIG_UPDATE_NOTIFIER':'false'}
commands=[]
def run(command,cwd,name,environment=None,expected=0):
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(list(map(str,command)),cwd=cwd,env=environment or env,stdout=log,stderr=subprocess.STDOUT,timeout=120)
 commands.append(dict(command=list(map(str,command)),cwd=str(cwd),exit=r.returncode,expected=expected,log=name+'.log',sha256=h(out/(name+'.log'))));save('commands.json',commands)
 assert r.returncode==expected,(name,r.returncode)
def manifest(tarball):
 rows=[]
 with tarfile.open(tarball) as tar:
  for member in tar.getmembers():
   assert member.name.startswith('package/') and '..' not in Path(member.name).parts and not member.issym() and not member.islnk()
   if member.isfile():rows.append(dict(path=member.name[8:],sha256=hashlib.sha256(tar.extractfile(member).read()).hexdigest(),mode=member.mode&0o777))
 return sorted(rows,key=lambda row:row['path'])
packs=[]
for i in [1,2]:
 destination=out/f'pack-{i}';destination.mkdir();run([node,npm,'pack','--offline','--json','--pack-destination',destination],repo/'typescript',f'pack-{i}');packs.append(next(destination.glob('*.tgz')))
files=manifest(packs[0]);assert files==manifest(packs[1]);save('runtime-files.json',files)
build=[]
for source in sorted((repo/'typescript/src').rglob('*.ts')):
 relative=source.relative_to(repo/'typescript/src');target=repo/'typescript/dist'/relative.with_suffix('.js');build.append(dict(source=str(source.relative_to(repo)),source_sha256=h(source),emitted=str(target.relative_to(repo/'typescript')),emitted_sha256=h(target)))
save('source-build-map.json',build)
consumer=out/'consumer';consumer.mkdir();(consumer/'package.json').write_text('{"name":"k3-offline-consumer","private":true,"type":"module"}\n')
for ancestor in consumer.parents:assert not (ancestor/'node_modules').exists()
for source,name in [('scripts/wo35-consumer-guard.mjs','base-guard.mjs'),('scripts/wo49-consumer-guard.mjs','guard.mjs'),('scripts/fixtures/kimi/kimi-k3-driver.mjs','driver.mjs')]:shutil.copy2(repo/source,consumer/name)
archive=consumer/'pan.tgz';shutil.copy2(packs[0],archive)
def guarded(phase,install=False):
 config=out/(phase+'-guard.json');allowed=[str(out)]
 if install:allowed.extend([str(node.parent.parent),str(npm.parent.parent)])
 config.write_text(json.dumps(dict(phase=phase,consumer=str(consumer),allowed=allowed,denied=[str(repo)],report=str(out/(phase+'-meter')))))
 return {**env,'NODE_OPTIONS':'--import='+str(consumer/'guard.mjs'),'WO35_GUARD_CONFIG':str(config)}
run([node,npm,'--prefix',consumer,'install',archive,'--offline','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],consumer,'install',guarded('install',True))
product=consumer/'node_modules/pan-agent'
def installed():
 actual=sorted(str(path.relative_to(product)) for path in product.rglob('*') if path.is_file());assert actual==[row['path'] for row in files]
 for row in files:
  path=product/row['path'];assert not path.is_symlink() and h(path)==row['sha256'] and path.stat().st_mode&0o777==row['mode'],path
installed();assert len(list((consumer/'node_modules').rglob('package.json')))==1
for effort in ['low','high','max']:
 root=consumer/effort;root.mkdir();shutil.copy2(repo/'scripts/fixtures/kimi/kimi-k3-wire-v1.json',root/'kimi-k3-wire-v1.json')
 for phase in ['configure','startup','task','replay','invalid']:
  name=phase+'-'+effort;run([node,consumer/'driver.mjs',product,root,phase,effort],consumer,name,guarded(name))
# Reuse the source matrix against installed compiled exports (not an independent Regulator test).
source=(repo/'typescript/test/kimi-k3.test.ts').read_text().replace('"../src/index.ts"',json.dumps((product/'dist/index.js').as_uri()))
source=source.replace("new URL('../../scripts/fixtures/kimi/kimi-k3-wire-v1.json', import.meta.url)",json.dumps(str(consumer/'high/kimi-k3-wire-v1.json')))
source=source.replace("new URL('../RUNBOOK.md',import.meta.url).pathname",json.dumps(str(product/'RUNBOOK.md')))
(consumer/'installed-matrix.test.ts').write_text(source)
run([node,'--experimental-strip-types','--test',consumer/'installed-matrix.test.ts'],consumer,'installed-matrix',guarded('installed-matrix'))
# Guard negative control: accidental real transport cannot escape the offline harness.
run([node,'--input-type=module','-e',"try { await fetch('https://example.invalid/forbidden'); } catch {}"],consumer,'caught-network',guarded('caught-network'),1)
nominal=[]
for path in out.glob('*-meter*.json'):
 record=json.loads(path.read_text())
 if record.get('phase')=='caught-network':assert record['network_attempts']==1;continue
 for key in ['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny']:assert record[key]==0,(path,key)
 nominal.append(record)
assert len(nominal)>=17
installed();save('summary.json',dict(candidate_sha=sha,branch=git('branch','--show-current'),tarball=str(packs[0]),tarball_sha256=h(packs[0]),package=str(product),runtime_manifest_sha256=h(out/'runtime-files.json'),installed_bytes_match=True,guard_reports=len(nominal),real_provider_calls=0,real_credential_reads=0,account_quota_calls=0,cost=0))
print('PASS installed K3 offline consumer',sha,product)
