"""One real broker preflight per admitted task. Failed/unknown cleanup stops the loop."""
import argparse,json
from pathlib import Path
from budget import Budget
HERE=Path(__file__).resolve().parent

def main():
 p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--round',type=int,default=1);a=p.parse_args();b=Budget(a.work);manifest=json.loads((HERE.parent/'manifest.json').read_text());images=json.loads((a.work/'images.json').read_text());sources=json.loads((a.work/'sources.json').read_text());rows=[];halt=False
 assert a.round>=1
 directory='preflight' if a.round==1 else 'preflight-r'+str(a.round)
 (a.work/directory).mkdir(exist_ok=True)
 previous=[r for f in a.work.glob('preflights*.json') for r in json.loads(f.read_text())]
 if any(r.get('status')=='prepared' for r in previous):raise RuntimeError('prepared tasks must not be restarted by Builder')
 for task in manifest['tasks']:
  image=next(i for i in images if i['task']==task['id']);source=next(s for s in sources if s['task']==task['id']);row={'task':task['id'],'status':'not_started'};rows.append(row)
  if halt:row['reason']='previous_cleanup_unconfirmed'
  elif image['status']!='pulled' or source['status']!='verified':row.update(status='blocked',reason='source_or_image_not_admitted')
  else:
   try:
    if (a.work/directory/task['id']).exists():raise RuntimeError('preflight_already_attempted; preserve and review prior receipt')
    r=b.run('preflight-'+task['id'],['node',str(HERE/'preflight.mjs'),str(a.work),task['id'],str(a.round)],timeout=700,cleanup_grace=40,controller_home=True)
    target=a.work/directory/task['id'];report_path=target/'report.json';report=json.loads(report_path.read_text()) if report_path.exists() else {'status':'blocked','reason':'broker_report_missing'}
    row.update(report);row['command_log']=r['log'];row['report']=str(report_path)
    stop_path=target/'harbor/stop.json';config_path=target/'harbor/configuration.json'
    if config_path.exists():
     config=json.loads(config_path.read_text());row['container_id']=config['id'];row['configuration']=str(config_path)
     stops=json.loads(stop_path.read_text()) if stop_path.exists() else [];confirmed=bool(stops) and all(not s['state']['Running'] and s['state'].get('Pid')==0 for s in stops);row['stop_confirmed']=confirmed
     if not confirmed:row.update(status='blocked',reason='stop_unconfirmed');halt=True
    elif report.get('ready'):row.update(status='blocked',reason='missing_configuration');halt=True
    if r['exit'] or r['error']:row['status']='blocked';row.setdefault('reason','preflight_process_failed')
   except Exception as exc:row.update(status='blocked',reason=str(exc))
  (a.work/('preflights.json' if a.round==1 else 'preflights-r'+str(a.round)+'.json')).write_text(json.dumps(rows,indent=2)+'\n')
 print(json.dumps({'preflight_status':rows}))
if __name__=='__main__':main()
