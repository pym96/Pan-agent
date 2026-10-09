#!/usr/bin/env python3
"""Real process boundary; private checkpoint never passes through an HTTP input."""
import pathlib,os,json,subprocess,time,uuid,signal,hashlib
source=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue==110
env['WEB_CHECKPOINT_MODE']='1'
def resume(c,cid,tid,cp,rid='resume'):
 return jreq(c,f'/api/conversations/{cid}/tasks/{tid}/resume',{'requestId':rid,'checkpointId':cp})
def interrupted(tid):
 global worker
 t=wait(tid,predicate=lambda t:any(e.get('type')=='checkpoint.barrier' for e in t['events']))
 pid=t['recovery']['attempts'][-1]['nodePid'];os.kill(pid,signal.SIGKILL)
 worker.wait(timeout=40);worker=None
 t=task(tid);assert t['state']=='interrupted' and t['cleanupConfirmed'];return t
def archivefiles(tid):return {str(p.relative_to(R/'tasks'/tid)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (R/'tasks'/tid/'archive').rglob('*') if p.is_file()}
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid=conversation(a,bid)
 _,t=append(a,cid,'two tool stages');tid=t['id'];env['WEB_CHECKPOINT_FAULT']='after-commit';worker=start('worker');old=interrupted(tid);save('interrupted.json',old);check(old['recovery']['recoverable'],'committed point recoverable only after actual Node exit');cp=old['recovery']['checkpointId'];oldhash=archivefiles(tid)
 for c in [b,n]:check(resume(c,cid,tid,cp)[0] in [401,403,404],'foreign resume denied')
 other=conversation(a,bid);check(resume(a,other,tid,cp)[0]==404,'wrong conversation denied')
 check(jreq(a,f'/api/conversations/{cid}/tasks/{tid}/resume',{'requestId':'bad','checkpointId':cp,'path':'/tmp/forged'})[0]==400,'client state/path denied')
 s,accepted=resume(a,cid,tid,cp);check(s==200,'explicit resume admitted');check(resume(a,cid,tid,cp)[1]==accepted,'same request reuses attempt');check(resume(a,cid,tid,cp,'duplicate')[0]==409,'consumed point cannot create another attempt')
 env['WEB_CHECKPOINT_FAULT']='';worker=start('worker');done=wait(tid);save('resumed.json',done);check(done['state']=='completed','new Node completed second stage');check(done['result']['checkpointRestored'],'adapter imported private synthetic state');check(len(done['recovery']['attempts'])==2 and done['recovery']['attempts'][0]['nodePid']!=done['recovery']['attempts'][1]['nodePid'],'distinct actual Node PIDs');check(archivefiles(tid)==oldhash,'old archive bytes unchanged');check(sum(e.get('type')=='tool.started' and e.get('toolCallId')=='stage-1' for e in done['events'])==1,'stage one actual invocation once');check(sum(e.get('type')=='tool.started' for e in done['events'])==2,'exactly two tool stages total');csvBytes=csvcheck(a,tid,source,True)
 answer=json.loads(done['result']['result']['finalText']);check(answer['total']==89 and answer['validScored']==23 and answer['counts']=={'success':18,'valid_failure':5,'unscored':20,'unknown_interrupted':20,'not_started':26},'89 report statistics and five exact CSV rows');check(done['result']['result']['modelCalls']==3 and done['result']['result']['toolCalls']==2,'cumulative counters retained')
 received=[e for e in done['events'] if e.get('type')=='context.received'];check(len(received)==2 and sum(m['role']=='user' for m in received[1]['messages'])==1 and received[1]['messages'][-1]['toolCallId']=='stage-1','restored canonical correlation without duplicate user')
 cc=conversation(a,bid);_,ct=append(a,cc,'two tool stages');control=wait(ct['id']);save('control.json',control);check(control['state']=='completed' and control['result']['result']['finalText']==done['result']['result']['finalText'] and csvcheck(a,ct['id'],source,True)==csvBytes,'uninterrupted control equivalent');check('WEB110_SYNTHETIC_PRIVATE_CONTINUATION' not in json.dumps(done) and b'WEB110_SYNTHETIC_PRIVATE_CONTINUATION' not in csvBytes,'private canary absent from API/events/CSV')
 save('result.json',{'passed':True,'checks':checks,'taskId':tid,'controlId':ct['id'],'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
