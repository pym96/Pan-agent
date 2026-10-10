#!/usr/bin/env python3
"""Actual browser, Redis restart and PG failure; preserve own task history."""
import pathlib,os,json,subprocess,signal
src=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(src.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue==113
env.update(WEB_CACHE='1',WEB_REDIS_ADDR='127.0.0.1:63113',WEB_CACHE_NAMESPACE='web113-services',WEB_CHECKPOINT_MODE='1',WEB_OPERATION_MODE='1',ANALYSIS_CPUS='1',ANALYSIS_MEMORY_GIB='1')
redis=R.parent/'redis-7.2.5/src/redis-cli';server=R.parent/'redis-7.2.5/src/redis-server';pg='/opt/homebrew/opt/postgresql@14/bin/pg_ctl';pgdown=False;redisdown=False
seed=json.loads(pathlib.Path(os.environ['WEB113_SEED']).read_text());tid=seed[0]['id']
def rc(*args):return subprocess.check_output([str(redis),'-p','63113',*args],text=True)
try:
 app=start('app');ready();a=client();login(a,'a');prior=task(tid);task(tid)
 rc('FLUSHDB');check(task(tid)==prior,'own Redis clear retains PG history')
 rc('SHUTDOWN','NOSAVE');redisdown=True;check(task(tid)==prior,'Redis terminated; authoritative fallback identical')
 # A real Worker still executes and publishes through PG while Redis is absent.
 source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid=conversation(a,bid);_,t=append(a,cid,'Redis outage worker');worker=start('worker');done=wait(t['id']);check(done['state']=='completed','Redis outage Worker completes actual Pan/Docker');csvcheck(a,t['id'],source,True);save('outage-task.json',done);stop(worker);worker=None
 subprocess.run([str(server),str(R.parent/'redis/redis.conf')],check=True);redisdown=False;check(task(tid)==prior,'Redis restart rebuilds same history')
 env.update(WEB113_CONTROL_BUNDLE=bid,WEB113_SEED=os.environ['WEB113_SEED']);subprocess.run(['node','scripts/browser113.mjs'],cwd=ROOT,env=env,check=True)
 subprocess.run([pg,'-D',str(R/'pgdata'),'-m','fast','stop'],check=True,stdout=subprocess.DEVNULL);pgdown=True;s,v=jreq(a,'/api/tasks/'+tid);check(s==503,'PG unavailable never served warm cache without authority')
 subprocess.run([pg,'-D',str(R/'pgdata'),'-l',str(R/'postgres.log'),'start'],check=True,stdout=subprocess.DEVNULL);pgdown=False;check(task(tid)==prior,'PG restart retains history')
 stop(app);app=start('app');ready();login(a,'a');check(task(tid)==prior,'API epoch restart retains PG result')
 save('result.json',{'passed':True,'checks':checks,'providerCalls':0})
finally:
 stop(worker);stop(app)
 if pgdown:subprocess.run([pg,'-D',str(R/'pgdata'),'-l',str(R/'postgres.log'),'start'],check=True)
 if redisdown:subprocess.run([str(server),str(R.parent/'redis/redis.conf')],check=True)
 for f in logs:f.close()
