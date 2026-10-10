#!/usr/bin/env python3
"""Real children, PG authority and Docker. Every attempt remains in this fresh evidence root."""
import pathlib,os,json,time,signal,subprocess,urllib.parse
src=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(src.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue in [112,113,119]
env.update(WEB_CHECKPOINT_MODE='1',WEB_OPERATION_MODE='1',ANALYSIS_CPUS='1',ANALYSIS_MEMORY_GIB='1')
u=urllib.parse.urlsplit(env['DATABASE_URL']);pg_env={**env,'PGHOST':u.hostname,'PGPORT':str(u.port),'PGUSER':u.username,'PGPASSWORD':u.password,'PGDATABASE':u.path.lstrip('/')}
def sql(query):return subprocess.check_output(['/opt/homebrew/opt/postgresql@14/bin/psql','-XAt','-v','ON_ERROR_STOP=1','-c',query],env=pg_env,text=True).strip()
def data(query):return json.loads(sql('SELECT COALESCE(json_agg(x),\'[]\') FROM ('+query+') x'))
def exists(path):
 for _ in range(1000):
  if path.exists():return
  time.sleep(.05)
 raise AssertionError('barrier missing '+str(path))
def until(fn):
 for _ in range(600):
  v=fn()
  if v:return v
  time.sleep(.1)
 raise AssertionError('condition not met')
def resume(cid,tid,cp,rid='resume'):return jreq(a,f'/api/conversations/{cid}/tasks/{tid}/resume',{'requestId':rid,'checkpointId':cp})
def admissions(tid):return data("SELECT * FROM ew_admissions WHERE task_id='"+tid+"' ORDER BY admitted_at")
coordinator=None
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 # A checked child waits before/after its atomic request while the Go owner is paused.
 for phase in ['before-model','after-model','before-tool']:
  env['WEB_ADMISSION_FAULT']=phase;cid=conversation(a,bid);_,t=append(a,cid,'two stages');tid=t['id'];worker=start('worker')
  exists(R/'tasks'/tid/('admission-'+phase+'.json'));held=task(tid);save(phase+'-held.json',held)
  pid=held['recovery']['attempts'][-1]['nodePid'];before=admissions(tid);(R/'tasks'/tid/'stop-unconfirmed').write_text('hold stop proof');os.kill(worker.pid,signal.SIGSTOP)
  time.sleep(11);expired=task(tid);check(expired['state']=='interrupted' and not expired['cleanupConfirmed'],phase+' expiration is not stop proof');os.kill(pid,0)
  (R/'tasks'/tid/'admission-release').write_text('release after revoke')
  os.kill(worker.pid,signal.SIGCONT);worker.wait(timeout=40);worker=None
  check(admissions(tid)==before,phase+' old owner admits no new action after reconnect')
  check(not any(e.get('type')=='sandbox.config' for e in task(tid)['events']),phase+' no tool effect')
  (R/'tasks'/tid/'stop-unconfirmed').unlink();env['WEB_ADMISSION_FAULT']='';coordinator=start('worker');stopped=until(lambda: (v if (v:=task(tid))['cleanupConfirmed'] else None));save(phase+'-stopped.json',stopped)
  if phase=='before-tool':
   cp=stopped['recovery']['checkpointId'];s,v=resume(cid,tid,cp);check(s==200,'proven unstarted tool explicitly resumes');done=wait(tid);save('before-tool-resumed.json',done);check(done['state']=='completed' and done['ownership']['generation']==2,'new owner generation completes');check(len([e for e in done['events'] if e.get('type')=='sandbox.config'])==2,'unstarted stage runs only once')
  stop(coordinator);coordinator=None
 # Kill old Go while the operation is dispatched/receipted; old live Node never means stopped.
 for fault in ['after-dispatch','after-receipt']:
  env['WEB_OPERATION_FAULT']=fault;cid=conversation(a,bid);_,t=append(a,cid,'reconcile');tid=t['id'];worker=start('worker');held=wait(tid,predicate=lambda t:any(e.get('type')=='operation.barrier' for e in t['events']));save(fault+'-held.json',held)
  (R/'tasks'/tid/'stop-unconfirmed').write_text('hold stop proof');worker.kill();worker.wait();worker=None;time.sleep(11);expired=task(tid);check(not expired['cleanupConfirmed'],'crash does not confirm stop')
  (R/'tasks'/tid/'stop-unconfirmed').unlink();env['WEB_OPERATION_FAULT']='';coordinator=start('worker');old=until(lambda:(v if (v:=task(tid))['cleanupConfirmed'] else None));save(fault+'-stopped.json',old)
  cp=old['recovery']['checkpointId'];s,v=resume(cid,tid,cp);save(fault+'-decision.json',v)
  if fault=='after-dispatch':
   check(s==409 and v['decision']=='unresolved','dispatched unknown never replayed');independent=conversation(a,bid);_,i=append(a,independent,'independent');done=wait(i['id']);check(done['state']=='completed','stopped unknown does not starve another conversation')
  else:
   check(s==200,'confirmed receipt explicit resume');done=wait(tid);check(done['state']=='completed','receipt reuse completed');check(sum(e.get('type')=='sandbox.config' for e in done['events'])==2,'receipt reuse no duplicate effect');csvcheck(a,tid,source,True)
  save(fault+'-final.json',task(tid));stop(coordinator);coordinator=None
 # Actual dedicated PG outage; restarting DB cannot revive the old owner process.
 env['WEB_ADMISSION_FAULT']='before-tool';cid=conversation(a,bid);_,t=append(a,cid,'db outage');tid=t['id'];worker=start('worker');exists(R/'tasks'/tid/'admission-before-tool.json');prior=admissions(tid)
 pg='/opt/homebrew/opt/postgresql@14/bin/pg_ctl';subprocess.run([pg,'-D',str(R/'pgdata'),'-m','fast','stop'],check=True,stdout=subprocess.DEVNULL)
 try:
  (R/'tasks'/tid/'admission-release').write_text('database absent');worker.wait(timeout=40);worker=None
 finally:subprocess.run([pg,'-D',str(R/'pgdata'),'-l',str(R/'postgres.log'),'start'],check=True,stdout=subprocess.DEVNULL)
 check(admissions(tid)==prior,'database outage adds zero admissions');time.sleep(11);env['WEB_ADMISSION_FAULT']='';coordinator=start('worker');stopped=until(lambda:(v if (v:=task(tid))['cleanupConfirmed'] else None));save('db-outage-stopped.json',stopped);check(stopped['state']=='interrupted','reconnection preserves interrupted authority');stop(coordinator);coordinator=None
 save('result.json',{'passed':True,'checks':checks,'providerSends':0,'admissions':data('SELECT * FROM ew_admissions ORDER BY admitted_at')})
finally:
 if worker and worker.poll() is None:os.kill(worker.pid,signal.SIGCONT)
 stop(worker);stop(coordinator);stop(app)
 for f in logs:f.close()
