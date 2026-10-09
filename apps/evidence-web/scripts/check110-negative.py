#!/usr/bin/env python3
import pathlib,os,json,subprocess,time,uuid,signal,hashlib,base64,concurrent.futures
source=pathlib.Path(__file__).with_name('check110.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check110.py')),'exec'))
def sql(q):return subprocess.check_output(['/opt/homebrew/opt/postgresql@14/bin/psql',env['DATABASE_URL'],'-XAt','-c',q],text=True).strip()
def newpoint():
 global worker
 cid=conversation(a,bid);_,t=append(a,cid,'controlled checkpoint');env['WEB_CHECKPOINT_FAULT']='after-commit';worker=start('worker');v=interrupted(t['id']);return cid,t['id'],v['recovery']['checkpointId']
def finishResume(cid,tid,cp):
 global worker
 check(resume(a,cid,tid,cp)[0]==200,'explicit request recorded before executor validation');env['WEB_CHECKPOINT_FAULT']='';worker=start('worker');worker.wait(timeout=40);worker=None;t=task(tid);save('rejected-'+tid+'.json',t);check(t['state']=='interrupted' and not t['recovery']['recoverable'],'bad checkpoint blocked without blind retry');check(sum(e.get('type')=='model.turn_started' for e in t['events'])==1,'rejected import sends no new model/tool')
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 # No point before full commit; next exchange invalidates the old point; partial multi-tool never commits.
 for fault in ['before-commit','after-exchange','partial-tools']:
  cid=conversation(a,bid);_,q=append(a,cid,fault);tid=q['id'];env['WEB_CHECKPOINT_FAULT']=fault;worker=start('worker')
  if fault=='before-commit':t=wait(tid);stop(worker);worker=None
  else:
   t=wait(tid,predicate=lambda t:sum(e.get('type')=='model.turn_started' for e in t['events'])==2 if fault=='after-exchange' else any(e.get('type')=='tool.started' and e.get('toolCallId')=='partial-second' for e in t['events']))
   os.kill(t['recovery']['attempts'][-1]['nodePid'],signal.SIGKILL);worker.wait(timeout=40);worker=None;t=task(tid)
  save(fault+'.json',t);check(not t['recovery']['recoverable'],fault+' has no recoverable point');check(resume(a,cid,tid,t['recovery'].get('checkpointId','f'*64))[0]==409,fault+' cannot replay')
  if fault=='after-exchange':check(t['recovery']['accounting']['unknown']==1,'unsettled sent exchange counted unknown')
 # Valid bytes alone do not confer ownership; server never accepts uploaded payload/hash.
 cid,tid,cp=newpoint();c2=conversation(a,bid);_,q2=append(a,c2,'unrelated');check(resume(a,c2,q2['id'],cp)[0]==409,'same-owner different task cannot use checkpoint');check(jreq(a,f'/api/conversations/{cid}/tasks/{tid}/resume',{'requestId':'forge','checkpointId':cp,'sha256':'a'*64,'payload':{}})[0]==400,'recomputed client hash/payload rejected')
 # API/Worker restart does not consume a point automatically.
 stop(app);app=start('app');ready();login(a,'a');env['WEB_CHECKPOINT_FAULT']='';worker=start('worker');wait(q2['id']);stop(worker);worker=None;check(task(tid)['recovery']['recoverable'] and len(task(tid)['recovery']['attempts'])==1,'restart retains point without automatic resume')
 # Cancellation wins against a subsequent resume; no fresh Node.
 check(jreq(a,f'/api/conversations/{cid}/tasks/{tid}/cancel',{'requestId':'cancel-cp'})[0]==200,'cancel interrupted checkpoint persists');check(resume(a,cid,tid,cp)[0]==409 and task(tid)['state']=='cancelled','cancelled point cannot resume')
 # Resume wins, then queued replacement cancels it before any next attempt starts.
 cid,tid,cp=newpoint();s,x=resume(a,cid,tid,cp);assert s==200
 s,y=jreq(a,f'/api/conversations/{cid}/tasks/{tid}/replace',{'requestId':'replace-resuming','question':'new branch'});check(s==200,'replacement can retire queued resume');check(resume(a,cid,tid,cp,'second')[0]==409,'superseded consumed point rejected');check(task(tid)['state']=='cancelled' and task(tid)['recovery']['attempts'][-1]['nodePid'] is None,'retired resume never starts executor')
 # Retire replacement queue explicitly so corruption fixtures remain isolated.
 jreq(a,f'/api/conversations/{cid}/tasks/{y["replacementId"]}/cancel',{'requestId':'retire-fixture'})
 for fault in ['missing-file','corrupt-payload','provider','schema','executor','bundle','private-state']:
  cid,tid,cp=newpoint()
  if fault=='missing-file':(R/'tasks'/tid/'output/stage1.json').rename(R/'tasks'/tid/'output/stage1.missing-evidence')
  elif fault=='corrupt-payload':sql("UPDATE ew_checkpoints SET payload=convert_to('{}','UTF8') WHERE id='"+cp+"'");check(resume(a,cid,tid,cp)[0]==409 and not task(tid)['recovery']['recoverable'],'payload differs from authoritative hash denied and not advertised recoverable');continue
  else:
   raw=base64.b64decode(sql("SELECT encode(payload,'base64') FROM ew_checkpoints WHERE id='"+cp+"'"));v=json.loads(raw)
   if fault=='provider':v['native']['provider']='kimi'
   elif fault=='schema':v['version']=2
   elif fault=='executor':v['identity']['executor']='0'*64
   elif fault=='bundle':v['identity']['contextSHA256']='0'*64
   elif fault=='private-state':v['native']['providerState']={}
   data=json.dumps(v,separators=(',',':')).encode();encoded=base64.b64encode(data).decode();sql("UPDATE ew_checkpoints SET payload=decode('"+encoded+"','base64'),sha256='"+hashlib.sha256(data).hexdigest()+"' WHERE id='"+cp+"'")
  finishResume(cid,tid,cp);check(True,fault+' fixture rejected before send')
 save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
