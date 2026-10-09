#!/usr/bin/env python3
"""Owned real cancellation/replacement probes. Faux, no Provider/benchmark sends."""
import pathlib,os,json,subprocess,time,uuid,concurrent.futures
source=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue in [109,110,111]
baseStart=start
def start(kind,scenario='success',barrier=False,tool=None,result=False):
 env['WEB_TOOL_BARRIER']=tool or '';env['WEB_RESULT_BARRIER']='1' if result else '0';return baseStart(kind,scenario,barrier)
def control(c,cid,tid,action='cancel',rid=None,question=''):
 return jreq(c,f'/api/conversations/{cid}/tasks/{tid}/{action}',{'requestId':rid or uuid.uuid4().hex,'question':question})
def toolReady(tid):
 wait(tid,predicate=lambda t:(R/'tasks'/tid/'output/tool-ready').exists());check(subprocess.check_output(['docker','ps','-q','--filter','name=^/web'+str(issue)+'-'+tid+'$'],env=env).strip()!=b'','actual controlled Docker tool running')
def marker(tid,name,value='test'):(R/'tasks'/tid/name).write_text(value)
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid=conversation(a,bid)
 # queued cancellation never executes and followers block.
 _,q=append(a,cid,'cancel queued');_,follow=append(a,cid,'depends on cancelled');s,x=control(a,cid,q['id']);check(s==200 and x['decision']=='cancelled','queued cancellation transactional');worker=start('worker');f=wait(follow['id']);check(f['state']=='blocked' and not task(q['id'])['events'][1:] and task(q['id'])['startedAt'] is None,'queued cancelled task never executed');stop(worker);worker=None
 # Build a real completed prefix, then replace a controlled running second turn.
 cid=conversation(a,bid);_,prefix=append(a,cid,'completed prefix');worker=start('worker');prefixValue=wait(prefix['id']);check(prefixValue['state']=='completed','real completed prefix');stop(worker);worker=None
 _,old=append(a,cid,'old running branch');_,suffix=append(a,cid,'old queued suffix');worker=start('worker',tool=old['id']);toolReady(old['id'])
 # Unrelated local process and labelled container: neither is eligible for cleanup.
 sentinel=subprocess.Popen(['sleep','300']);sentinelName='web109-control-'+uuid.uuid4().hex[:12]
 subprocess.run(['docker','run','-d','--name',sentinelName,'--label','pan.issue=web109-control','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','16','--cpus','.1','--memory','32m',env['PAN_IMAGE'],'python','-c','import time; time.sleep(300)'],env=env,check=True,stdout=subprocess.DEVNULL)
 try:
  for c in [b,n]:
   for action in ['cancel','replace']:check(control(c,cid,old['id'],action,question='intruder' if action=='replace' else '')[0] in [401,403,404],'foreign/anonymous control denied')
  other=conversation(a,bid);check(control(a,other,old['id'])[0]==404,'same-account foreign conversation combination denied')
  check(jreq(a,f'/api/conversations/{cid}/tasks/{old["id"]}/cancel',{'requestId':'injection','pid':sentinel.pid,'container':sentinelName})[0]==400,'client PID/container rejected')
  before=task(old['id']);check(before['state']=='running' and before['cancelRequestedAt'] is None,'denied controls leave target unchanged')
  rid='replacement-stable';replacementQuestion='只列出有效失败任务并导出CSV'
  s,x=control(a,cid,old['id'],'replace',rid,replacementQuestion);check(s==200 and x['decision']=='cancelling','replace response is cancelling not stopped');new=x['replacementId'];check(control(a,cid,old['id'],'replace',rid,replacementQuestion)[1]==x,'same replace request returns original identity');check(control(a,cid,old['id'],'replace',rid,'changed')[0]==409,'same replace identity different content rejected');check(control(a,cid,old['id'],'replace','stale','other')[0]==409,'stale replaced target rejected')
  completed=wait(new);cancelled=task(old['id']);save('running-replaced.json',cancelled);save('replacement.json',completed);check(cancelled['state']=='cancelled' and cancelled['cleanupConfirmed'] and cancelled['stopConfirmedAt']<=completed['startedAt'],'replacement starts after confirmed stop');check(any(e.get('type')=='control.cancel_received' for e in cancelled['events']) and any(e.get('type')=='control.stop_confirmed' for e in cancelled['events']),'Pan cancellation and owned stop evidence');check(task(suffix['id'])['state']=='superseded' and task(suffix['id'])['startedAt'] is None,'old queue suffix withdrawn without execution');check(json.loads(completed['contextText'])['turns'][0]['taskId']==prefix['id'] and len(json.loads(completed['contextText'])['turns'])==1,'replacement uses valid prefix only');csvcheck(a,new,source,True);check(completed['state']=='completed' and json.loads(completed['result']['result']['finalText'])['total']==5,'replacement actual Pan Docker computes CSV');check(sentinel.poll() is None and subprocess.check_output(['docker','inspect','--format','{{.State.Running}}',sentinelName],env=env).strip()==b'true','unrelated process/container untouched')
 finally:
  sentinel.terminate();sentinel.wait();subprocess.run(['docker','rm','-f',sentinelName],env=env,check=True,stdout=subprocess.DEVNULL)
 # Completion-before-cancel has already committed, must stay byte-identical.
 prior=task(new);check(control(a,cid,new)[1]['decision']=='completed' and task(new)['result']==prior['result'],'completion commit wins late cancellation');check(control(a,cid,new,'replace',question='too late')[0]==409,'completed target not replaceable');stop(worker);worker=None
 # Two competing replacement IDs while queue is stopped: exactly one succeeds.
 cc=conversation(a,bid);_,ct=append(a,cc,'queued target');_,cs=append(a,cc,'queued suffix')
 def race(i):c=client();login(c,'a');return control(c,cc,ct['id'],'replace','race-'+str(i),'race replacement')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rr=list(pool.map(race,range(2)))
 check(sorted(s for s,x in rr)==[200,409],'two different replacement IDs at most one winner');raceNew=next(x['replacementId'] for s,x in rr if s==200);check(task(cs['id'])['state']=='superseded','queued replacement withdraws suffix');worker=start('worker');check(wait(raceNew)['state']=='completed','queued replacement executes');stop(worker);worker=None
 # Cancel intent before a completed-but-not-published reply; release with deterministic barrier.
 lc=conversation(a,bid);_,lt=append(a,lc,'late result');worker=start('worker',result=True);wait(lt['id'],predicate=lambda t:any(e.get('type')=='fixture.result_waiting' for e in t['events']));x=control(a,lc,lt['id'])[1];check(x['decision']=='cancelling','cancel intent wins before result publication');marker(lt['id'],'result-release');late=wait(lt['id']);save('late-result.json',late);check(late['state']=='cancelled' and late['result'] is None and late['attemptResult']['result']['status']=='completed','late completed reply retained only as attempt');check(late['attemptResult']['result']['usage']['status']=='reported' and req(a,f'/api/tasks/{lt["id"]}/files/details.csv')[0]==200,'late known usage and CSV preserved');stop(worker);worker=None
 # Deterministic unknown stop, API restart, rejected restart, then stop-only recovery.
 uc=conversation(a,bid);_,ut=append(a,uc,'unknown stop');worker=start('worker',tool=ut['id']);toolReady(ut['id']);marker(ut['id'],'stop-unconfirmed');ux=control(a,uc,ut['id'],'replace','unknown-stable','replacement after confirmation')[1];un=ux['replacementId'];worker.wait(timeout=45);check(worker.returncode!=0,'unknown stop pauses admission');worker=None;unknown=task(ut['id']);save('unknown.json',unknown);check(unknown['state']=='cancelling' and not unknown['cleanupConfirmed'] and task(un)['state']=='queued' and not task(un)['events'],'unknown never admits replacement')
 stop(app);app=start('app');ready();login(a,'a');check(control(a,uc,ut['id'],'replace','unknown-stable','replacement after confirmation')[1]==ux,'API restart retains same replacement intent');worker=start('worker');worker.wait(timeout=15);check(worker.returncode!=0 and not task(un)['events'],'restart refuses unconfirmed resources');worker=None;(R/'tasks'/ut['id']/'stop-unconfirmed').unlink();worker=start('worker');recovered=wait(un);check(recovered['state']=='completed' and task(ut['id'])['state']=='cancelled','confirmed recovery executes new task only');check(task(ut['id'])['stopConfirmedAt']<=recovered['startedAt'],'recovery stop precedes replacement');stop(worker);worker=None
 # Worker death during cancellation retains intent and does not replay the old attempt.
 kc=conversation(a,bid);_,kt=append(a,kc,'kill during cancellation');worker=start('worker',barrier=True);wait(kt['id'],predicate=lambda t:any(e.get('type')=='fixture.waiting' for e in t['events']));worker.send_signal(__import__('signal').SIGSTOP);kx=control(a,kc,kt['id'],'replace','kill-stable','post-interruption replacement')[1];worker.kill();worker.wait();worker=None;check(task(kt['id'])['state']=='cancelling','durable cancel survives worker death');worker=start('worker');done=wait(kx['replacementId']);check(done['state']=='completed' and task(kt['id'])['state']=='cancelled','restart stop-only recovery no old replay');save('result.json',{'passed':True,'checks':checks,'bundleId':bid,'conversationId':cid,'replacementId':new,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
