"""Public metadata only. No task images, data, weights, oracle, or verifier execution."""
import argparse,hashlib,json,os,subprocess,time,tomllib
from pathlib import Path
HARBOR='f9deaca7f44ab0b91f1dd445d79629e4d97a0716'
REGISTRY_SHA='da1446bce05eabbd72a25eb9eef5a2f5db94645ce88c28e2497581433b3d2e60'
SEED='pan-tbench-pilot-v1\n'
def visible_test_exception(task):
 if task['id']!='break-filter-js-from-html':return None
 assert task['git_url']=='https://github.com/laude-institute/terminal-bench-2.git' and task['path']=='break-filter-js-from-html'
 assert task['git_commit_id']=='69671fbaac6d67a7ef0dfec016cc38a64ef7a77c'
 files={f['path']:f['git_blob_sha1'] for f in task['files']}
 assert files['environment/Dockerfile']=='77d131ae0ec556e851a6290e07b1387a8e9a935f'
 assert files['environment/tests/test_outputs.py']==files['tests/test_outputs.py']=='1bf2128a002d4014d85094c2223f87c62ae9088d'
 return {'status':'official visible test permitted; actual image unverified','source_path':'environment/tests/test_outputs.py','visible_path':'/app/test_outputs.py','git_blob_sha1':files['environment/tests/test_outputs.py'],'dockerfile_blob_sha1':files['environment/Dockerfile'],'ruling':'https://github.com/pym96/Pan-agent/issues/75#issuecomment-5775497812','scope':'original file only; no additional tests, solution, answers or controller verifier logs'}
def select(entry):
 tasks=entry['tasks'];names=[t['name'] for t in tasks]
 if len(set(names))!=len(names):raise ValueError('duplicate canonical ID')
 return sorted(tasks,key=lambda t:(hashlib.sha256((SEED+t['name']).encode()).hexdigest(),t['name'].encode()))[:5]
def guard(root):
 st=os.statvfs(root)
 if st.f_bavail*st.f_frsize<60*2**30:raise RuntimeError('free disk boundary')
 size=sum(p.stat().st_size for p in root.rglob('*') if p.is_file() and not p.is_symlink())
 if size>=24*2**30:raise RuntimeError('owned file boundary')
def fetch(url,target,root):
 guard(root);target.parent.mkdir(parents=True,exist_ok=True)
 r=subprocess.run(['curl','-fLsS','--connect-timeout','15','--max-time','120','--retry','1',url,'-o',str(target)],env={'PATH':'/usr/bin:/bin:/opt/homebrew/bin'},timeout=245)
 guard(root)
 if r.returncode:raise RuntimeError('public metadata download failed')
 return target.read_bytes()
def main():
 a=argparse.ArgumentParser();a.add_argument('--source',type=Path,required=True);a.add_argument('--output',type=Path,required=True);args=a.parse_args();root=args.source;root.mkdir(parents=True,exist_ok=True)
 reg=root/'registry.json'
 if not reg.exists():fetch(f'https://raw.githubusercontent.com/laude-institute/harbor/{HARBOR}/registry.json',reg,root)
 raw=reg.read_bytes();assert hashlib.sha256(raw).hexdigest()==REGISTRY_SHA
 entry=next(e for e in json.loads(raw) if e['name']=='terminal-bench' and e['version']=='2.0');chosen=select(entry)
 tasks=[];exposure=[]
 for t in chosen:
  repo=t['git_url'].removeprefix('https://github.com/').removesuffix('.git');commit=t['git_commit_id'];treefile=root/(commit+'-tree.json')
  if not treefile.exists():fetch(f'https://api.github.com/repos/{repo}/git/trees/{commit}?recursive=1',treefile,root)
  tree=json.loads(treefile.read_text());assert not tree.get('truncated')
  files=[x for x in tree['tree'] if x['type']=='blob' and x['path'].startswith(t['path']+'/')]
  contents={}
  for relative in ['instruction.md','task.toml','environment/Dockerfile','tests/test.sh']:
   path=t['path']+'/'+relative;meta=next((x for x in files if x['path']==path),None)
   if not meta:continue
   dest=root/'tasks'/path
   if not dest.exists():fetch(f'https://raw.githubusercontent.com/{repo}/{commit}/{path}',dest,root)
   b=dest.read_bytes();assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==meta['sha']
   contents[relative]={'sha256':hashlib.sha256(b).hexdigest(),'git_blob_sha1':meta['sha'],'bytes':len(b)}
   exposure.append({'task':t['name'],'path':relative,'read_by':'Builder integration','solution_read':False})
  cfg=tomllib.loads((root/'tasks'/t['path']/'task.toml').read_text())
  tasks.append({**t,'id':t['name'],'selection_hash':hashlib.sha256((SEED+t['name']).encode()).hexdigest(),'config':cfg,'files':[{'path':x['path'][len(t['path'])+1:],'git_blob_sha1':x['sha'],'bytes':x['size']} for x in files],'inspected':contents,'image_reference':cfg.get('environment',{}).get('docker_image'),'image_digest':None,'architecture':'unknown; not pulled or probed','environment_verified':False})
 for task in tasks:
  exception=visible_test_exception(task)
  if exception:task['official_visible_test']=exception
 manifest={'schema':1,'harbor_sha':HARBOR,'registry_sha256':REGISTRY_SHA,'registry_entry':entry,'selection_seed':SEED,'denominator':5,'tasks':tasks,'exposure':exposure,'claims':'public development pilot; no live score; not unseen holdout'}
 args.output.write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'selected':[t['id'] for t in tasks],'population':len(entry['tasks'])}))
if __name__=='__main__':main()
