"""Rebuild frozen full population using public registry/tree/task.toml only."""
import argparse,hashlib,json,tomllib,subprocess,concurrent.futures
from pathlib import Path
REGISTRY='da1446bce05eabbd72a25eb9eef5a2f5db94645ce88c28e2497581433b3d2e60'
COMMIT='69671fbaac6d67a7ef0dfec016cc38a64ef7a77c'
def build(root):
 raw=(root/'registry.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==REGISTRY
 entry=next(x for x in json.loads(raw) if x['name']=='terminal-bench' and x['version']=='2.0')
 tree=json.loads((root/'tree.json').read_text());assert not tree.get('truncated') and tree['sha']==COMMIT
 assert len(entry['tasks'])==89 and len({x['name'] for x in entry['tasks']})==89
 def one(t):
  assert t['git_commit_id']==COMMIT and t['git_url']=='https://github.com/laude-institute/terminal-bench-2.git'
  files=[{'path':x['path'][len(t['path'])+1:],'git_blob_sha1':x['sha'],'bytes':x['size']} for x in tree['tree'] if x['type']=='blob' and x['path'].startswith(t['path']+'/')]
  path=root/'configs'/t['name']/'task.toml';path.parent.mkdir(parents=True,exist_ok=True)
  url=f"https://raw.githubusercontent.com/laude-institute/terminal-bench-2/{COMMIT}/{t['path']}/task.toml"
  if not path.exists():
   subprocess.run(['curl','-fLsS','--connect-timeout','15','--max-time','120','--retry','2',url,'-o',str(path)],check=True)
  b=path.read_bytes();blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
  assert blob==next(x['git_blob_sha1'] for x in files if x['path']=='task.toml')
  cfg=tomllib.loads(b.decode())
  return {**t,'id':t['name'],'config':cfg,'config_source':url,'config_sha256':hashlib.sha256(b).hexdigest(),'files':files,'image_reference':cfg.get('environment',{}).get('docker_image'),'preparation_state':'unprepared'}
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:tasks=list(pool.map(one,entry['tasks']))
 return {'schema':1,'registry_sha256':REGISTRY,'source_commit':COMMIT,'denominator':89,'tasks':tasks}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.write_text(json.dumps(build(a.source),indent=2)+'\n')
