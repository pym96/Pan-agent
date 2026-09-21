"""Bounded exact-blob acquisition for the two controls, with no credential discovery."""
import hashlib,json,pathlib,sys,urllib.request
E=pathlib.Path(sys.argv[1]);W=pathlib.Path(sys.argv[2]);snap=pathlib.Path('/Volumes/WD_BLACK/pan-agent/benchmark-feasibility-20260921');manifest=[]
def get(url,maxbytes):
 with urllib.request.urlopen(url,timeout=30) as r:
  data=r.read(maxbytes+1)
  if len(data)>maxbytes:raise ValueError('download cap')
  return data
for repo,rev,key in [('SWE-agent/SWE-ReX','5c995c365dfb1fd5bc56fda688be5d8538f9931f','SWE-ReX'),('yiyihum/da-code','b211daf51fdc9b52d5087c9df28ac50191bcabed','da-code')]:
 tree=json.loads(get(f'https://api.github.com/repos/{repo}/git/trees/{rev}?recursive=1',4*1024**2));assert tree['sha']==rev and not tree['truncated'];(E/(key+'-tree.json')).write_text(json.dumps(tree,indent=2)+'\n')
 selected=[]
 for entry in tree['tree']:
  p=entry['path']
  if entry['type']!='blob':continue
  take=(p.startswith('src/') or p in ['pyproject.toml','README.md','LICENSE','LICENSE.md']) if key=='SWE-ReX' else (p.startswith('da_agent/evaluators/') or p in ['da_agent/__init__.py','da_agent/envs/__init__.py','da_agent/envs/utils.py','evaluate.py','LICENSE','da_code/configs/task/all.jsonl','da_code/configs/eval/eval_all.jsonl'] or p.startswith('da_code/source/data-sa-001/') or p=='da_code/gold/data-sa-001/result.csv')
  if take:selected.append(entry)
 assert sum(x['size'] for x in selected)<16*1024**2
 for entry in selected:
  p=entry['path'];url=f'https://raw.githubusercontent.com/{repo}/{rev}/{p}';data=get(url,entry['size']);assert len(data)==entry['size'];assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==entry['sha']
  dest=W/'sources'/key/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
  manifest.append({'repo':repo,'revision':rev,'path':p,'url':url,'git_blob':entry['sha'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
 (E/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'exact_source_files':len(manifest),'bytes':sum(x['bytes'] for x in manifest)}))
