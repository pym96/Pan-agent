#!/usr/bin/env python3
"""Paired experiment. Freeze before submitting any load; retain all rounds on failure."""
import pathlib,os,json,time,hashlib,math,platform,subprocess,urllib.parse
src=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(src.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue==112
env.update(WEB_CHECKPOINT_MODE='1',WEB_OPERATION_MODE='1',ANALYSIS_CPUS='1',ANALYSIS_MEMORY_GIB='1')
clock=lambda:time.clock_gettime_ns(time.CLOCK_MONOTONIC)
u=urllib.parse.urlsplit(env['DATABASE_URL']);pg_env={**env,'PGHOST':u.hostname,'PGPORT':str(u.port),'PGUSER':u.username,'PGPASSWORD':u.password,'PGDATABASE':u.path.lstrip('/')}
def sql(q):return subprocess.check_output(['/opt/homebrew/opt/postgresql@14/bin/psql','-XAt','-v','ON_ERROR_STOP=1','-c',q],env=pg_env,text=True).strip()
def rows(q):return json.loads(sql("SELECT COALESCE(json_agg(x),'[]') FROM ("+q+") x"))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def files(root):return {str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file() and '.git' not in p.parts and 'node_modules' not in p.parts and 'dist' not in p.parts}
w2=None;rounds=[]
try:
 source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes()
 manifest={'version':1,'createdUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'baseSHA':'ebbe2f6e2a03f57ad632b1bd8514340b321c20ee','sourceFiles':files(ROOT),'binarySHA256':sha(R/'evidence-web'),'packageSHA256':sha(R.parent/'pan-agent-0.1.0.tgz'),'inputSHA256':hashlib.sha256(source).hexdigest(),'image':env['PAN_IMAGE'],'host':platform.platform(),'hardware':subprocess.check_output(['sysctl','hw.ncpu','hw.memsize'],text=True),'docker':json.loads(subprocess.check_output(['docker','info','--format','{{json .}}'],env=env)),'workers':[1,2],'conversations':4,'tasksPerConversation':3,'questions':['first classification','ordered followup','ordered third'],'cpusPerContainer':1,'memoryGiBPerContainer':1,'maxAnalysisContainers':2,'totalBudgetCpu':4,'totalBudgetMemoryGiB':8,'heartbeatSeconds':1,'leaseSeconds':10,'heartbeatTimeoutSeconds':2,'stopWaitSeconds':5,'resourceInspectionTimeoutSeconds':30,'reason':'ten heartbeat intervals tolerate scheduling jitter; failed dedicated connection is fenced immediately by PG backend identity; stop is observed not inferred from lease','clock':'POSIX CLOCK_MONOTONIC on the same local host: Python clock_gettime_ns and Go unix.ClockGettime; integer nanoseconds. Admission sample inside locked transaction immediately before insert/commit; terminal time is harness observation, not invented execution finish. No suspend/reboot between rounds.','scriptFiles':{n:sha(ROOT/'executor'/n) for n in ['analysis.py','stage2.py','checkpoint.mjs','main.mjs']},'providerCalls':0,'codingTokens':'unknown'}
 # Exclusive creation forbids silently replacing an earlier frozen experiment.
 with (OUT/'manifest.json').open('x') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
 app=start('app');ready();a=client();login(a,'a');bid=upload(a,source)
 for count in [1,2]:
  tasks=[];cids=[conversation(a,bid) for _ in range(4)]
  round={'workers':count,'tasks':tasks,'finished':False};rounds.append(round);save('rounds.json',rounds)
  # Begin identical queued load with no Worker running. Submission timestamps
  # are immediately before each HTTP POST; first admission comes from PG receipt.
  for cid in cids:
   for q in manifest['questions']:
    submit=clock();s,t=append(a,cid,q);assert s==201;tasks.append({'id':t['id'],'conversationId':cid,'submittedNs':submit,'requestAcknowledgedNs':clock()})
  worker=start('worker');w2=start('worker') if count==2 else None
  pending={t['id']:t for t in tasks};deadline=time.monotonic()+1200
  while pending and time.monotonic()<deadline:
   for tid,t in list(pending.items()):
    v=task(tid)
    if v['state'] not in ['queued','running','cancelling']:
     t.update(observedTerminalNs=clock(),state=v['state']);save(f'{count}-{tid}.json',v);del pending[tid]
   save('rounds.json',rounds)
   if worker.poll() is not None or (w2 and w2.poll() is not None):raise AssertionError('Worker exited during no-fault experiment')
   time.sleep(.1)
  round['lastObservationNs']=clock();round['unfinished']=list(pending);stop(worker);worker=None;stop(w2);w2=None
  ids=','.join("'"+t['id']+"'" for t in tasks)
  round['admissions']=rows('SELECT * FROM ew_admissions WHERE task_id IN ('+ids+') ORDER BY monotonic_ns')
  round['attempts']=rows('SELECT * FROM ew_attempts WHERE task_id IN ('+ids+') ORDER BY started_at')
  for t in tasks:
   first=next((r['monotonic_ns'] for r in round['admissions'] if r['task_id']==t['id']),None);t['firstAdmissionNs']=first
   if first is not None:check(first>=t['submittedNs'] and first<=t['observedTerminalNs'],'common monotonic clock ordering')
   if t.get('state')=='completed':csvcheck(a,t['id'],source,True)
  round['finished']=not pending;save('rounds.json',rounds);check(not pending and all(t['state']=='completed' for t in tasks),f'{count} Worker all 12 completed')
 metrics=json.loads(subprocess.check_output(['python3',str(ROOT/'scripts/recompute112.py'),str(OUT)],text=True));save('recomputed.json',metrics);check(bool(metrics[1]['actualOverlap']),'two Worker actual Docker execution overlaps');save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 save('rounds.json',rounds);stop(worker);stop(w2);stop(app)
 for f in logs:f.close()
