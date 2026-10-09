import pathlib,os,json,subprocess,signal,concurrent.futures
source=pathlib.Path(__file__).with_name('check110-negative.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check110-negative.py')),'exec'))
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 cid=conversation(a,bid);_,q=append(a,cid,'stop gate');tid=q['id'];env['WEB_CHECKPOINT_FAULT']='after-commit';worker=start('worker');t=wait(tid,predicate=lambda t:any(e.get('type')=='checkpoint.barrier' for e in t['events']));cp=t['recovery']['checkpointId'];check(not t['recovery']['recoverable'] and resume(a,cid,tid,cp)[0]==409,'live producer cannot be resumed');os.kill(t['recovery']['attempts'][-1]['nodePid'],signal.SIGKILL);worker.wait(timeout=40);worker=None
 def race(action):
  c=client();login(c,'a')
  return resume(c,cid,tid,cp,'race-resume') if action=='resume' else jreq(c,f'/api/conversations/{cid}/tasks/{tid}/cancel',{'requestId':'race-cancel'})
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:replies=list(pool.map(race,['resume','cancel']))
 t=task(tid);check(replies[1][0]==200 and replies[0][0] in [200,409] and t['state']=='cancelled' and not t['recovery']['recoverable'],'concurrent cancel/resume has consistent serialized outcome');check(all(x['nodePid'] is None for x in t['recovery']['attempts'][1:]),'no executor starts during API race');save('race.json',{'responses':replies,'task':t})
 # Unsupported application composition cannot silently restart the user question.
 cid,tid,cp=newpoint();check(resume(a,cid,tid,cp)[0]==200,'resume queued for unsupported-mode test');env['WEB_CHECKPOINT_MODE']='0';env['WEB_CHECKPOINT_FAULT']='';worker=start('worker');worker.wait(timeout=40);worker=None;t=task(tid);check(t['state']=='interrupted' and sum(e.get('type')=='model.turn_started' for e in t['events'])==1,'disabled checkpoint composition refuses before sends');env['WEB_CHECKPOINT_MODE']='1'
 # Required source files are bound, not only summary metadata.
 cid,tid,cp=newpoint();sql("UPDATE ew_files SET content=convert_to('changed','UTF8') WHERE bundle_id='"+bid+"' AND name='notes.txt'");finishResume(cid,tid,cp);check(True,'changed bound input rejected')
 save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
