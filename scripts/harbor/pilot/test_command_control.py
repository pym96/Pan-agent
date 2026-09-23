"""Explicit WO81 controlled-container RPC fixture; never part of default discovery runs.
Run via test_command_control.mjs with WO81_CONTROL_ROOT set. No tasks/verifier/model.
"""
import asyncio,json,sys,time,os
from pathlib import Path
from broker import ManagedCommand,Bound,docker
IMAGE='sha256:41217bae6667f04a767dc1b2c5c12b034dfc51a18226202003313aaf86832055'
async def main():
 config=json.loads(await asyncio.to_thread(sys.stdin.readline));root=Path(config['output']);root.mkdir(parents=True,exist_ok=True)
 scenario=config['scenario'];budget=Path(config['budget']);rows=[json.loads(s) for s in budget.read_text().splitlines()] if budget.exists() else []
 if any(r['event']=='start' and not any(e['event']=='end' and e['attempt']==r['attempt'] for e in rows) for r in rows):raise RuntimeError('unfinished_control_attempt')
 if sum(r.get('elapsed',0) for r in rows)>=1800 or sum(r['event']=='start' and r['scenario']==scenario for r in rows)>=2:raise RuntimeError('control_budget_exhausted')
 start=time.monotonic();attempt=len(rows)+1
 def log(row):
  with budget.open('a') as f:f.write(json.dumps({'attempt':attempt,'scenario':scenario,**row})+'\n');f.flush();os.fsync(f.fileno())
 log({'event':'start','monotonic':start,'image':IMAGE})
 cid=None;stops=[];jobs=set()
 async def send(row):print(json.dumps(row),flush=True)
 try:
  cid=(await docker('run','-d','--pull=never','--network=none','--cpus=2','--memory=4g','--label','pan.wo81='+str(attempt),'--entrypoint','/bin/sh',IMAGE,'-c','while :; do sleep 60; done')).strip()
  info=json.loads(await docker('inspect',cid))[0];h=info['HostConfig']
  assert info['Image']==IMAGE and not info['Mounts'] and not h['Privileged'] and not h.get('CapAdd') and h['NetworkMode']=='none' and h['NanoCpus']==2*10**9 and h['Memory']==4*2**30
  (root/'container.json').write_text(json.dumps(info,indent=2)+'\n')
  cmd=ManagedCommand(cid,'/app')
  await docker('exec','-d',cid,'/bin/sh','-c','echo $$ >/tmp/control-pid; while :; do sleep 1; done')
  async def stop(reason):
   stops.append(reason);await docker('stop','-t','1',cid)
   state=json.loads(await docker('inspect',cid))[0]['State'];assert not state['Running'] and state['Pid']==0
  async def verify():return {'status':'synthetic_control','rewards':None,'oracle':'fixture completion only'}
  if scenario=='uncertain':
   original=cmd.snapshot;count=0
   async def uncertain():
    nonlocal count
    count+=1
    if count>=3:raise RuntimeError('injected_confirmation_unavailable')
    return await original()
   cmd.snapshot=uncertain
  bound=Bound(None,stop,verify,cmd)
  await send({'ready':True,'instruction':'Harmless WO81 '+scenario+' fixture only.'})
  async def handle(msg):
   try:
    if msg['method']=='exec':r=await bound.exec(msg['command'],msg['timeout'])
    elif msg['method']=='stop':r=await bound.stop(msg['reason'])
    elif msg['method']=='verify':r=await bound.verify()
    else:raise ValueError('method')
    with (root/'rpc.jsonl').open('a') as f:f.write(json.dumps({'id':msg['id'],'method':msg['method'],'result':r})+'\n')
    await send({'id':msg['id'],'result':r})
   except Exception as e:await send({'id':msg['id'],'error':type(e).__name__})
  while line:=await asyncio.to_thread(sys.stdin.readline):
   job=asyncio.create_task(handle(json.loads(line)));jobs.add(job);job.add_done_callback(jobs.discard)
  await asyncio.gather(*jobs)
 finally:
  if cid:
   await docker('stop','-t','1',cid)
   state=json.loads(await docker('inspect',cid))[0]['State'];assert not state['Running'] and state['Pid']==0
   (root/'cleanup.json').write_text(json.dumps({'container':cid,'state':state,'stops':stops})+'\n')
  log({'event':'end','monotonic':time.monotonic(),'elapsed':time.monotonic()-start})
if __name__=='__main__':asyncio.run(main())
