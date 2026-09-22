"""Serial metadata admission and exact platform digest pulls. Never build images."""
import argparse,json
from pathlib import Path
from budget import Budget,GIB
HERE=Path(__file__).resolve().parent

def main():
 p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);a=p.parse_args();
 if (a.work/'images.json').exists():raise RuntimeError('image acquisition receipt exists; reuse assets, do not reset retries')
 b=Budget(a.work);manifest=json.loads((HERE.parent/'manifest.json').read_text());rows=[]
 for task in manifest['tasks']:
  row={'task':task['id'],'reference':task['image_reference'],'status':'not_started','local_image_id':None};rows.append(row)
  try:
   target=a.work/'registry'/task['id']
   for attempt in range(2):
    r=b.run('registry-'+task['id'],['python3',str(HERE/'registry.py'),task['image_reference'],str(target)])
    if r['exit']==0 and not r['error']:break
    if r['exit']!=75 or r['error'] or attempt==1:raise RuntimeError('registry_metadata_failed:'+r['log'])
   meta=json.loads((target/'identity.json').read_text());row.update(meta)
   # Compressed bytes are not a bound; use a conservative estimate then sample actual allocation.
   estimate=meta['compressed_layer_bytes']*4+512*2**20;row['admission_estimate_bytes']=estimate;b.check(estimate)
   reference=meta['repository']+'@'+meta['platform_digest'];row['pull_reference']=reference
   for attempt in range(2):
    r=b.run('pull-'+task['id'],['docker','pull','--platform',meta['platform'],reference],estimate=estimate)
    if r['exit']==0 and not r['error']:break
    log=Path(r['log']).read_text();transient=any(x in log.lower() for x in ['timeout','connection reset','unexpected eof','temporary failure','tls handshake'])
    if r['error'] or not transient or attempt==1:raise RuntimeError('image_pull_failed:'+r['log'])
   r=b.run('inspect-'+task['id'],['docker','image','inspect',reference],timeout=30)
   if r['exit'] or r['error']:raise RuntimeError('image_inspect_failed:'+r['log'])
   info=json.loads(Path(r['log']).read_text())[0]
   if info['Id']!=meta['config_digest'] or info['Architecture']!=meta['architecture'] or info['Os']!=meta['os']:raise RuntimeError('local_image_identity_mismatch')
   row.update(status='pulled',local_image_id=info['Id'],local_size_bytes=info['Size'],inspect_log=r['log'],emulation=info['Architecture']=='amd64')
  except Exception as exc:row.update(status='blocked',reason=str(exc))
  (a.work/'images.json').write_text(json.dumps(rows,indent=2)+'\n')
 print(json.dumps({'image_status':[{k:v for k,v in r.items() if k in ['task','status','reason','architecture','compressed_layer_bytes']} for r in rows]}))
if __name__=='__main__':main()
