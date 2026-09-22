"""Only five pinned tasks. Never read or execute solution/test contents for debugging."""
import argparse,hashlib,json,shutil
from pathlib import Path
from budget import Budget
HERE=Path(__file__).resolve().parent;MANIFEST=HERE.parent/'manifest.json';PYTHON='/private/tmp/wo74-work/venv/bin/python'
TRANSIENT={5,6,7,18,28,35,52,55,56,92}
def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--cache',type=Path);a=p.parse_args();b=Budget(a.work);raw=MANIFEST.read_bytes();assert hashlib.sha256(raw).hexdigest()=='74433498d6a551c86ccc6e5faad2f9d8d3c099e5b872170e54edf23769fe6503';m=json.loads(raw);rows=[]
 for task in m['tasks']:
  row={'task':task['id'],'status':'not_started','source_root':str(a.work/'tasks'/task['path']),'files':[]};rows.append(row)
  try:
   for f in task['files']:
    relative=Path(task['path'])/f['path'];assert '..' not in relative.parts and not relative.is_absolute();target=a.work/'tasks'/relative;target.parent.mkdir(parents=True,exist_ok=True);b.check()
    if target.exists():assert blob(target.read_bytes())==f['git_blob_sha1']
    elif a.cache and (a.cache/relative).exists():
     cached=a.cache/relative;assert blob(cached.read_bytes())==f['git_blob_sha1'];shutil.copyfile(cached,target)
    else:
     repo=task['git_url'].removeprefix('https://github.com/').removesuffix('.git');url=f"https://raw.githubusercontent.com/{repo}/{task['git_commit_id']}/{relative.as_posix()}"
     for attempt in range(2):
      result=b.run('source-'+task['id'],['curl','-fLsS','--connect-timeout','20','--max-time','600',url,'-o',str(target)])
      if result['exit']==0 and result['error'] is None:break
      if result['error'] or result['exit'] not in TRANSIENT or attempt==1:raise RuntimeError('source_download_failed:'+result['log'])
     assert blob(target.read_bytes())==f['git_blob_sha1']
    row['files'].append({'path':f['path'],'git_blob_sha1':f['git_blob_sha1'],'bytes':target.stat().st_size})
   r=b.run('validate-'+task['id'],[PYTHON,str(HERE/'validate_source.py'),str(MANIFEST),str(a.work/'tasks'),task['id']],timeout=60)
   if r['exit'] or r['error']:raise RuntimeError('broker_source_validation_failed:'+r['log'])
   row.update(status='verified',validation_log=r['log'])
  except Exception as exc:row.update(status='blocked',reason=str(exc))
  (a.work/'sources.json').write_text(json.dumps(rows,indent=2)+'\n')
 print(json.dumps({'source_status':[{k:v for k,v in r.items() if k in ['task','status','reason']} for r in rows]}))
if __name__=='__main__':main()
