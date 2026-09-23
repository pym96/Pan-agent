"""WO83 opt-in RPC control: cached container, synthetic oracle, fixed budget."""
import asyncio,json,sys,time,os,fcntl,uuid,subprocess,signal
from pathlib import Path
from broker import ManagedCommand,Bound,docker
IMAGE='sha256:41217bae6667f04a767dc1b2c5c12b034dfc51a18226202003313aaf86832055'
AUTH='H-GRADE83-SCOPE-20260923-001'
SCENARIOS={'normal','deadline','budget','cancel','verifier_cancel','uncertain','timeout'}
def history(rows):
 starts={};ends={}
 for r in rows:
  target=starts if r['event']=='start' else ends
  if r['attempt'] in target:raise RuntimeError('duplicate_attempt')
  target[r['attempt']]=r
 if set(starts)!=set(ends):raise RuntimeError('unfinished_attempt_requires_recovery')
 if any(e['elapsed']<0 or e['elapsed']!=e['end_monotonic']-starts[k]['start_monotonic'] for k,e in ends.items()):raise RuntimeError('invalid_elapsed')
 used=sum(r['elapsed'] for r in ends.values())
 if used>=1800:raise RuntimeError('budget_exhausted')
 return used
async def main():
 config=json.loads(await asyncio.to_thread(sys.stdin.readline));assert config['authorization']==AUTH and config['scenario'] in SCENARIOS
 role=config['role'];assert role in ['builder','regulator']
 fixed=Path('/private/tmp/wo83-work/builder-container-budget.jsonl' if role=='builder' else '/private/tmp/wo83-regulator/regulator-container-budget.jsonl')
 assert Path(config['budget'])==fixed
 root=Path(config['output']);root.mkdir(parents=True,exist_ok=False);fixed.parent.mkdir(parents=True,exist_ok=True)
 repo=Path(__file__).resolve().parents[3]
 sha=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip();assert sha==config['runner_sha']
 assert not subprocess.check_output(['git','-C',str(repo),'status','--porcelain'],text=True).strip()
 f=fixed.open('a+');fcntl.flock(f.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);f.seek(0);used=history([json.loads(s) for s in f.read().splitlines()]);remaining=1800-used
 attempt=str(uuid.uuid4());name='wo83-'+attempt;start=time.monotonic();cid=None;state=None;jobs=set();stops=[];outcome='failed'
 def log(row):f.write(json.dumps({'attempt':attempt,'scenario':config['scenario'],'runner_sha':sha,'resource_name':name,**row})+'\n');f.flush();os.fsync(f.fileno())
 log({'event':'start','start_monotonic':start,'utc':time.time(),'used_seconds':used,'remaining_seconds':remaining,'watchdog_seconds':min(60,remaining)})
 loop=asyncio.get_running_loop();current=asyncio.current_task();watchdog=loop.call_later(min(60,remaining),current.cancel);loop.add_signal_handler(signal.SIGTERM,current.cancel)
 async def send(x):print(json.dumps(x),flush=True)
 try:
  assert json.loads(await docker('image','inspect',IMAGE))[0]['Id']==IMAGE
  # PID 1 is an explicitly established, single-process FIFO echo service.
  service='mkfifo /tmp/service-in /tmp/service-out; echo $$ > /tmp/service-pid; while :; do read request < /tmp/service-in || exit; printf "%s\\n" "$request" > /tmp/service-out; done'
  cid=(await docker('run','-d','--pull=never','--name',name,'--network=none','--cpus=2','--memory=4g','--label','pan.wo83='+attempt,'--entrypoint','/bin/sh',IMAGE,'-c',service)).strip()
  info=json.loads(await docker('inspect',cid))[0];h=info['HostConfig'];assert info['Image']==IMAGE and h['NetworkMode']=='none' and not info['Mounts'] and not h['Privileged'] and not h.get('CapAdd') and not h.get('Devices') and not h.get('DeviceRequests') and h['NanoCpus']==2*10**9 and h['Memory']==4*2**30
  (root/'container.json').write_text(json.dumps(info,indent=2)+'\n')
  assert (await docker('exec',cid,'/bin/sh','-c','test -p /tmp/service-in; cat /tmp/service-pid')).strip()=='1'
  cmd=ManagedCommand(cid,'/tmp');await cmd.initialize();(root/'baseline.json').write_text(json.dumps(cmd.baseline)+'\n')
  async def stop(reason):
   stops.append(reason);await docker('stop','-t','1',cid);s=json.loads(await docker('inspect',cid))[0]['State'];assert not s['Running'] and s['Pid']==0
  async def verify():
   # Wait beyond the delayed writer's deadline; make a real service request.
   if config['scenario']=='verifier_cancel':
    await send({'diagnostic':{'stage':'ready'}});await asyncio.sleep(2)
   observation=await docker('exec',cid,'/bin/sh','-c','set -eu; pid=$(cat /tmp/writer-pid); if [ -f /proc/$pid/stat ]; then cat /proc/$pid/stat; else echo writer_absent; fi')
   if observation!='writer_absent\n':assert observation.rpartition(') ')[2].split()[0]=='Z'
   await docker('exec',cid,'/bin/sh','-c','set -eu; touch /tmp/grade-entry; sleep .15; test ! -e /tmp/late; test -f /tmp/artifact; printf "ping\\n" > /tmp/service-in; read reply < /tmp/service-out; test "$reply" = ping; printf SERVICE_OK')
   return {'status':'synthetic_control','rewards':{'reward':1},'oracle':'artifact preserved; delayed writer absent/zombie before grade-entry trigger; no late write; pinned FIFO service responds','writer_observation':observation}
  bound=Bound(None,stop,verify,cmd)
  await send({'ready':True,'instruction':'Synthetic WO83 fixture; no official task.'})
  async def handle(msg):
   try:
    method=msg['method']
    if method=='exec':
     if config['scenario']=='uncertain':
      # Actual unknown process outside owned group, not a mocked boolean.
      await docker('exec','-d',cid,'setsid','sleep','20')
     r=await bound.exec(msg['command'],msg['timeout'])
    elif method=='quiesce':r=await bound.quiesce()
    elif method=='verify':r=await bound.verify()
    elif method=='stop':r=await bound.stop(msg['reason'])
    else:raise RuntimeError('method')
    with (root/'rpc.jsonl').open('a') as out:out.write(json.dumps({'id':msg['id'],'method':method,'result':r,'monotonic':time.monotonic()})+'\n')
    await send({'id':msg['id'],'result':r})
   except Exception as e:await send({'id':msg['id'],'error':type(e).__name__})
  while line:=await asyncio.to_thread(sys.stdin.readline):
   job=asyncio.create_task(handle(json.loads(line)));jobs.add(job);job.add_done_callback(jobs.discard)
  await asyncio.gather(*jobs);outcome='completed'
 finally:
  watchdog.cancel()
  # Cleanup is mandatory, even when the attempt watchdog has consumed its budget.
  if cid is None:
   ids=(await docker('ps','-aq','--filter','name=^/'+name+'$')).split()
   if len(ids)==1:cid=ids[0]
  if cid:
   await docker('stop','-t','1',cid);state=json.loads(await docker('inspect',cid))[0]['State'];assert not state['Running'] and state['Pid']==0
   (root/'cleanup.json').write_text(json.dumps({'id':cid,'state':state,'stops':stops})+'\n')
   await docker('rm',cid)
  for job in jobs:job.cancel()
  await asyncio.gather(*jobs,return_exceptions=True)
  end=time.monotonic();elapsed=end-start
  log({'event':'end','end_monotonic':end,'elapsed':elapsed,'cumulative_seconds':used+elapsed,'remaining_seconds':1800-used-elapsed,'necessary_cleanup_over_budget_seconds':max(0,used+elapsed-1800),'container':cid,'stopped':state is None or not state['Running'],'outcome':outcome});f.close()
if __name__=='__main__':asyncio.run(main())
