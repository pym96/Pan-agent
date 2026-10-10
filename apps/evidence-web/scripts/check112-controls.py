#!/usr/bin/env python3
"""Connection loss, control idempotency, stale completion and resource sentinels."""
import pathlib,os,json,time,signal,subprocess,urllib.parse,concurrent.futures
source=pathlib.Path(__file__).with_name('check112-faults.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check112-faults.py')),'exec'))
sentinelName='web112-control-'+uuid.uuid4().hex[:10];sentinel=None
try:
 sentinel=subprocess.Popen(['sleep','600']);subprocess.run(['docker','run','-d','--name',sentinelName,'--label','pan.issue=web112-control','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','16','--cpus','.1','--memory','32m',env['PAN_IMAGE'],'python','-c','import time; time.sleep(600)'],env=env,check=True,stdout=subprocess.DEVNULL)
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 env['WEB_ADMISSION_FAULT']='before-tool';cid=conversation(a,bid);_,t=append(a,cid,'lost heartbeat connection');tid=t['id'];worker=start('worker');exists(R/'tasks'/tid/'admission-before-tool.json');old=task(tid);prior=admissions(tid)
 wid=old['ownership']['workerId'];sql("SELECT pg_terminate_backend(connection_pid) FROM ew_owners WHERE id='"+wid+"'")
 (R/'tasks'/tid/'admission-release').write_text('connection lost before next heartbeat');worker.wait(timeout=40);worker=None
 check(admissions(tid)==prior,'dedicated backend loss immediately fences action despite healthy database')
 env['WEB_ADMISSION_FAULT']='';coordinator=start('worker');stopped=until(lambda:(v if (v:=task(tid))['cleanupConfirmed'] else None));save('backend-loss.json',stopped);stop(coordinator);coordinator=None
 # Completion has returned from tools but waits before authoritative result.
 env['WEB_RESULT_BARRIER']='1';cid=conversation(a,bid);_,t=append(a,cid,'cancel beats late completion');tid=t['id'];worker=start('worker');held=wait(tid,predicate=lambda t:any(e.get('type')=='fixture.result_waiting' for e in t['events']));prior=admissions(tid)
 for c in [b,n]:check(jreq(c,f'/api/conversations/{cid}/tasks/{tid}/cancel',{'requestId':'foreign'})[0] in [401,403,404],'foreign control denied')
 for field in ['owner','generation','workerId','authority']:
  check(jreq(a,f'/api/conversations/{cid}/tasks/{tid}/cancel',{'requestId':'forged',field:'untrusted'})[0]==400,'client cannot supply '+field)
 def duplicate(_):
  c=client();login(c,'a');return jreq(c,f'/api/conversations/{cid}/tasks/{tid}/cancel',{'requestId':'same-cancel'})
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:replies=list(pool.map(duplicate,range(8)))
 check(all(s==200 and v==replies[0][1] for s,v in replies),'concurrent cancellation idempotent')
 (R/'tasks'/tid/'result-release').write_text('late completion after cancellation')
 until(lambda:task(tid)['cleanupConfirmed']);stop(worker);worker=None;env['WEB_RESULT_BARRIER']='';coordinator=start('worker');done=until(lambda:(v if (v:=task(tid))['cleanupConfirmed'] else None));save('cancelled-late-completion.json',done)
 check(done['state']=='cancelled' and done['result'] is None,'late completion cannot overwrite cancel');check(admissions(tid)==prior,'cancel admits no more actions');stop(coordinator);coordinator=None
 # Replacement retires queued suffix; old pending operation cannot start.
 env['WEB_ADMISSION_FAULT']='before-tool';cid=conversation(a,bid);_,t=append(a,cid,'replace running');tid=t['id'];_,suffix=append(a,cid,'retired suffix');worker=start('worker');exists(R/'tasks'/tid/'admission-before-tool.json')
 s,replacement=jreq(a,f'/api/conversations/{cid}/tasks/{tid}/replace',{'requestId':'replace','question':'replacement'});check(s==200,'replacement intent persisted');check(task(suffix['id'])['state']=='superseded','queued suffix retired')
 (R/'tasks'/tid/'admission-release').write_text('revoked before dispatch')
 env['WEB_ADMISSION_FAULT']=''
 for _ in range(1000):
  if worker.poll() is not None:worker=None;coordinator=start('worker');break
  replacementBarrier=R/'tasks'/replacement['replacementId']/'admission-before-tool.json'
  if replacementBarrier.exists():
   check(task(tid)['cleanupConfirmed'],'old stop precedes replacement admission');(replacementBarrier.parent/'admission-release').write_text('release replacement fixture');break
  time.sleep(.05)
 done=wait(replacement['replacementId']);save('replacement.json',done);check(done['state']=='completed','replacement executes only after old stop');check(task(tid)['cleanupConfirmed'] and not any(e.get('type')=='sandbox.config' for e in task(tid)['events']),'old effect absent and stop confirmed');stop(worker);worker=None;stop(coordinator);coordinator=None
 check(sentinel.poll() is None,'unrelated process survives');inspection=json.loads(subprocess.check_output(['docker','inspect',sentinelName],env=env))[0];check(inspection['State']['Running'],'unrelated labelled container survives');save('sentinel.json',inspection)
 save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(coordinator);stop(app)
 if sentinel:stop(sentinel)
 subprocess.run(['docker','rm','-f',sentinelName],env=env,stdout=subprocess.DEVNULL,check=False)
 for f in logs:f.close()
