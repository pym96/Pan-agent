import pathlib,os,json,subprocess,signal,time
source=pathlib.Path(__file__).with_name('check110-negative.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check110-negative.py')),'exec'))
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid=conversation(a,bid);_,q=append(a,cid,'heartbeat lost while Node alive');tid=q['id'];env['WEB_CHECKPOINT_FAULT']='after-commit';worker=start('worker');t=wait(tid,predicate=lambda t:any(e.get('type')=='checkpoint.barrier' for e in t['events']));cp=t['recovery']['checkpointId'];pid=t['recovery']['attempts'][-1]['nodePid']
 # Suspend only the owned Worker. Its Node remains alive, and cannot be certified stopped.
 os.kill(worker.pid,signal.SIGSTOP)
 try:
  time.sleep(11);t=task(tid);check(t['state']=='interrupted' and not t['cleanupConfirmed'],'lost heartbeat is not proof of Node stop');os.kill(pid,0)
  s,x=jreq(a,f'/api/conversations/{cid}/tasks/{tid}/cancel',{'requestId':'cancel-lost'});t=task(tid);check(s==200 and x['decision']=='cancelling' and not t['cleanupConfirmed'] and t['stopConfirmedAt'] is None,'cancel lost producer waits for actual stop');check(resume(a,cid,tid,cp)[0]==409,'no recovery while old live resources unconfirmed');save('unconfirmed.json',t)
 finally:os.kill(worker.pid,signal.SIGCONT)
 t=wait(tid);check(t['state']=='cancelled' and t['cleanupConfirmed'] and t['stopConfirmedAt'] is not None,'owned producer eventually stops before final cancel');save('stopped.json',t);save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
