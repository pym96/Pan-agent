import pathlib,os,json,subprocess,hashlib
source=pathlib.Path(__file__).with_name('check110-negative.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check110-negative.py')),'exec'))
try:
 app=start('app');ready();a,b=client(),client();login(a,'a');login(b,'b');allrows=sql("SELECT t.id||'|'||a.email FROM ew_tasks t JOIN ew_accounts a ON a.id=t.account_id ORDER BY t.created_at").splitlines();states={};count=0
 for row in allrows:
  tid,email=row.split('|');s,t=jreq(a if email.startswith('a@') else b,'/api/tasks/'+tid);assert s==200;assert 'WEB110_SYNTHETIC_PRIVATE_CONTINUATION' not in json.dumps(t);assert t['state'] not in ['queued','running','cancelling'];states[t['state']]=states.get(t['state'],0)+1;count+=1
  if t['recovery'].get('reason')=='checkpoint_integrity_invalid':assert not t['recovery']['recoverable'];save('invalid-integrity-'+tid+'.json',t)
  save(tid+'.json',t)
 check(count>0,'all owned tasks terminal and private canary absent from authenticated public projections')
 invalid=list(OUT.glob('invalid-integrity-*.json'));check(bool(invalid),'corrupt authoritative payload is not advertised recoverable')
 targets=[]
 for pattern in ['**/executor-stdout.jsonl','**/executor-stderr.log','**/archive/**/*.jsonl','**/archive/**/*.json','**/output/*.csv']:
  for p in (R/'tasks').glob(pattern):assert b'WEB110_SYNTHETIC_PRIVATE_CONTINUATION' not in p.read_bytes(),str(p);targets.append(str(p.relative_to(R)))
 check(bool(targets),'public execution logs archives CSV contain no private canary')
 save('result.json',{'passed':True,'checks':checks,'tasks':count,'states':states,'scannedFiles':targets,'providerSends':0})
finally:
 stop(app)
 for f in logs:f.close()
