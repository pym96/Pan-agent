import pathlib,os,json,subprocess,concurrent.futures
source=pathlib.Path(__file__).with_name('check110-negative.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check110-negative.py')),'exec'))
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid,tid,cp=newpoint()
 path=R/'tasks'/tid/'output/stage1.json';original=path.read_bytes();(R/'tasks'/tid/'stage1-original.json').write_bytes(original);path.write_bytes(original+b'\n')
 def duplicate(_):c=client();login(c,'a');return resume(c,cid,tid,cp,'parallel-resume')
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:responses=list(pool.map(duplicate,range(4)))
 check(all(s==200 for s,x in responses) and len({x['attemptId'] for s,x in responses})==1,'concurrent identical resume request allocates one attempt')
 env['WEB_CHECKPOINT_FAULT']='';worker=start('worker');worker.wait(timeout=40);worker=None;t=task(tid);check(t['state']=='interrupted' and not t['recovery']['recoverable'] and len(t['recovery']['attempts'])==2,'tampered required file blocks consumed attempt');check(sum(e.get('type')=='model.turn_started' for e in t['events'])==1,'file hash mismatch has zero additional sends');assert 'checkpoint_file_hash' in (R/'tasks'/t['recovery']['attempts'][-1]['id']/'executor-stderr.log').read_text();save('task.json',t);save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
