#!/usr/bin/env python3
import pathlib,os,json,subprocess,time,uuid,signal,hashlib,base64,copy,concurrent.futures
source=pathlib.Path(__file__).with_name('check111.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check111.py')),'exec'))
def sql(q):return subprocess.check_output(['/opt/homebrew/opt/postgresql@14/bin/psql',env['DATABASE_URL'],'-XAt','-c',q],text=True).strip()
def put(cp,value):
 raw=json.dumps(value,separators=(',',':')).encode();sql("UPDATE ew_checkpoints SET payload=decode('"+base64.b64encode(raw).decode()+"','base64'),sha256='"+hashlib.sha256(raw).hexdigest()+"' WHERE id='"+cp+"'")
try:
 app=start('app');ready();a,b,n=client(),client(),client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid=conversation(a,bid);_,q=append(a,cid,'receipt negatives');tid=q['id'];env['WEB_OPERATION_FAULT']='after-receipt';worker=start('worker');held=wait(tid,predicate=lambda t:any(e.get('type')=='operation.barrier' for e in t['events']));cp=held['recovery']['checkpointId'];check(resume(cid,tid,cp)[0]==409,'live producer cannot reconcile');old=kill(tid);original=json.loads(base64.b64decode(sql("SELECT encode(payload,'base64') FROM ew_checkpoints WHERE id='"+cp+"'")));save('original-public.json',old)
 def denied(name):
  status,x=resume(cid,tid,cp,name);save(name+'-decision.json',x);check(status==409 and len(task(tid)['recovery']['attempts'])==1,name+' rejected with zero new attempts/sends')
 for fault in ['partial-receipt','wrong-toolcall','wrong-args','wrong-input','wrong-result','dispatched','wrong-task','private-state']:
  v=copy.deepcopy(original)
  if fault=='partial-receipt':v['operation'].pop('result')
  elif fault=='wrong-toolcall':v['operation']['binding']['toolCallId']='other'
  elif fault=='wrong-args':v['operation']['binding']['argsSHA256']='0'*64
  elif fault=='wrong-input':v['identity']['inputs']='0'*64
  elif fault=='wrong-result':v['operation']['result']['content'][0]['text']='{}'
  elif fault=='dispatched':v['operation']['state']='dispatched'
  elif fault=='wrong-task':v['taskId']='0'*64
  elif fault=='private-state':v['native']['provider']='kimi'
  put(cp,v);denied(fault);put(cp,original)
 artifact=R/'tasks'/tid/'output/stage1.json';backup=artifact.read_bytes()
 for fault in ['missing','corrupt','symlink','hardlink']:
  saved=artifact.with_name('stage1-'+fault+'-original');artifact.rename(saved)
  if fault=='corrupt':artifact.write_text('tampered')
  elif fault=='symlink':artifact.symlink_to(saved)
  elif fault=='hardlink':os.link(saved,artifact)
  denied(fault)
  if artifact.exists() or artifact.is_symlink():artifact.unlink()
  saved.rename(artifact)
 # Model-writable success files cannot repair a missing trusted receipt.
 (R/'tasks'/tid/'output/success.json').write_text(json.dumps({'success':True,'receipt':original['operation']}));v=copy.deepcopy(original);v['operation']['state']='dispatched';v['operation'].pop('result');put(cp,v);denied('model-forged-success');put(cp,original)
 check(jreq(a,f'/api/conversations/{cid}/tasks/{tid}/resume',{'requestId':'forged','checkpointId':cp,'state':'completed','sha256':'0'*64,'resourceId':'other'})[0]==400,'client supplied state/hash/resources rejected')
 other=conversation(a,bid);check(resume(other,tid,cp)[0]==404,'wrong conversation rejected')
 # Read-only admission checks repeat across API restart, without starting a worker.
 stop(app);app=start('app');ready();login(a,'a');check(task(tid)['recovery']['reconcileAvailable'],'API restart retains pending receipt')
 def reconcile_request(_):c=client();login(c,'a');return resume(cid,tid,cp,'parallel',c)
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:replies=list(pool.map(reconcile_request,range(4)))
 check(all(s==200 for s,x in replies) and len({x['attemptId'] for s,x in replies})==1,'concurrent request creates one continuation attempt')
 check(jreq(a,f'/api/conversations/{cid}/tasks/{tid}/cancel',{'requestId':'cancel-resuming'})[0]==200 and resume(cid,tid,cp,'stale')[0]==409,'cancelled consumed operation cannot resurrect');check(all(x['nodePid'] is None for x in task(tid)['recovery']['attempts'][1:]),'cancel before Worker creates no executor');save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
