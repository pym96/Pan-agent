#!/usr/bin/env python3
"""Owned, real Node crashes at persisted operation barriers; original receipts remain private."""
import pathlib,os,json,subprocess,time,uuid,signal,hashlib
source=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue==111
env.update(WEB_CHECKPOINT_MODE='1',WEB_OPERATION_MODE='1')
def resume(cid,tid,cp,rid='resume',c=None):return jreq(c or a,f'/api/conversations/{cid}/tasks/{tid}/resume',{'requestId':rid,'checkpointId':cp})
def archivefiles(tid):return {str(p.relative_to(R/'tasks'/tid)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (R/'tasks'/tid/'archive').rglob('*') if p.is_file()}
def kill(tid):
 global worker
 t=wait(tid,predicate=lambda t:any(e.get('type')=='operation.barrier' for e in t['events']))
 os.kill(t['recovery']['attempts'][-1]['nodePid'],signal.SIGKILL);worker.wait(timeout=40);worker=None
 t=task(tid);assert t['state']=='interrupted' and t['cleanupConfirmed'];return t
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 for fault in ['after-receipt','pre-dispatch','after-dispatch']:
  cid=conversation(a,bid);_,t=append(a,cid,'two tool stages');tid=t['id'];env['WEB_OPERATION_FAULT']=fault;worker=start('worker')
  held=wait(tid,predicate=lambda t:any(e.get('type')=='operation.barrier' for e in t['events']))
  if fault=='after-receipt':
   oldContainer=next(e['configuration']['Id'] for e in held['events'] if e.get('type')=='sandbox.config');info=json.loads(subprocess.check_output(['docker','inspect',oldContainer],env=env))[0];check(not info['State']['Running'],'owned container stopped before explicit loss');subprocess.run(['docker','rm',oldContainer],env=env,check=True,stdout=subprocess.DEVNULL);save('removed-container.json',info)
  old=kill(tid);save(fault+'-interrupted.json',old);cp=old['recovery']['checkpointId'];oldhash=archivefiles(tid)
  for c in [b,n]:check(resume(cid,tid,cp,c=c)[0] in [401,403,404],'foreign reconcile denied')
  status,result=resume(cid,tid,cp);save(fault+'-decision.json',result)
  if fault=='after-dispatch':
   check(status==409 and result['decision']=='unresolved','dispatch without receipt never replayed');count=len(task(tid)['recovery']['attempts']);check(resume(cid,tid,cp,'again')[0]==409 and len(task(tid)['recovery']['attempts'])==count,'readonly repeated unknown creates no attempt');env['WEB_OPERATION_FAULT']='';other=conversation(a,bid);_,ot=append(a,other,'independent');worker=start('worker');control=wait(ot['id']);save('uninterrupted-control.json',control);check(control['state']=='completed','stopped unresolved does not starve independent conversation');check(control['result']['result']['finalText']==done['result']['result']['finalText'] and csvcheck(a,ot['id'],source,True)==csvcheck(a,done['id'],source,True),'uninterrupted control matches recovered answer and exact CSV');check(not any(e.get('type')=='tool.started' for e in task(tid)['events'][len(old['events']):]),'unknown has zero new calls');stop(worker);worker=None;continue
  check(status==200,'sufficient proof admitted');check(resume(cid,tid,cp)[1]==result,'idempotent same attempt');check(resume(cid,tid,cp,'duplicate')[0]==409,'consumed point rejected')
  env['WEB_OPERATION_FAULT']='';worker=start('worker');done=wait(tid);save(fault+'-resumed.json',done);check(done['state']=='completed','new Node finishes pending continuation');check(archivefiles(tid)==oldhash,'old sealed archive unchanged');check(sum(e.get('type')=='sandbox.config' for e in done['events'])==2,'only two actual container executions');check(done['result']['result']['modelCalls']==3 and done['result']['result']['toolCalls']==2,'cumulative Native counters correct');csvcheck(a,tid,source,True);answer=json.loads(done['result']['result']['finalText']);check(answer['total']==89 and answer['validScored']==23 and answer['counts']=={'success':18,'valid_failure':5,'unscored':20,'unknown_interrupted':20,'not_started':26},'exact 89-row classification and 23 valid scores');check(done['recovery']['accounting']['observedToolExecutions']==2,'reused result not charged as an execution')
  if fault=='after-receipt':check([e['configuration']['Id'] for e in done['events'] if e.get('type')=='sandbox.config'][-1]!=oldContainer,'rebuilt container has different ID')
  check('WEB110_SYNTHETIC_PRIVATE_CONTINUATION' not in json.dumps(done),'private canary absent');stop(worker);worker=None
 save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
