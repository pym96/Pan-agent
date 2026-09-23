"""Credential-free Harbor capability server. Only the Node controller reads keys."""
import asyncio,json,hashlib,sys,uuid,signal,shlex,math
from pathlib import Path
from diagnostics import failure,release_network
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from adapter import PanAgent
from harbor.models.task.task import Task
from harbor.models.trial.paths import TrialPaths
from harbor.environments.docker.docker import DockerEnvironment
from harbor.verifier.verifier import Verifier
class RecordingEnvironment(DockerEnvironment):
 async def exec(self,*args,**kwargs):
  result=await super().exec(*args,**kwargs)
  if getattr(self,'verifier_phase',False):self.verifier_exits.append(result.return_code)
  return result
async def docker(*args):
 p=await asyncio.create_subprocess_exec('docker',*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE);out,_=await asyncio.wait_for(p.communicate(),20)
 if p.returncode:raise RuntimeError('docker_operation_failed. Return code: '+str(p.returncode)+'.')
 return out.decode()
def audit(info,logs,cfg):
 h=info['HostConfig'];assert not h['Privileged'] and not h.get('CapAdd') and not h.get('Devices') and not h.get('DeviceRequests') and h['NetworkMode']!='host'
 assert h['NanoCpus']==cfg.cpus*10**9 and h['Memory']==cfg.memory_mb*2**20
 assert all(m['Type']=='bind' and Path(m['Source']).resolve()==logs.resolve() and m['Destination']=='/logs/verifier' for m in info['Mounts'])
 assert not any(any(w in x.split('=',1)[0].lower() for w in ['api_key','token','secret','password']) for x in info['Config']['Env'])
 return {'id':info['Id'],'image':info['Image'],'host_config':h,'mounts':info['Mounts'],'environment_names':[x.split('=',1)[0] for x in info['Config']['Env']]}
def validate_source(root,meta):
 expected={f['path'] for f in meta['files']}
 actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() or p.is_symlink()}
 if actual!=expected:raise RuntimeError('task_source_inventory')
 for f in meta['files']:
  p=root/f['path']
  if not p.is_file() or p.is_symlink() or not p.resolve().is_relative_to(root.resolve()):raise RuntimeError('task_source_path')
  b=p.read_bytes()
  if hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()!=f['git_blob_sha1']:raise RuntimeError('task_source_identity')
class ManagedCommand:
 """One container-bound process group; never treats cancelling docker client as a stop.

 Linux /proc + setsid + POSIX shell are required. No arbitrary-process sandbox:
 newly observed processes outside the group cause uncertainty and environment stop.
 Only non-zombie members execute; PID/start-time identities guard signal targeting.
 """
 LIMIT=65536
 def __init__(self,container_id,cwd=None):self.cid=container_id;self.cwd=cwd
 async def control(self,script):
  args=['docker','exec',self.cid,'/bin/sh','-c',script]
  p=await asyncio.create_subprocess_exec(*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
  try:
   out,_=await asyncio.wait_for(p.communicate(),2)
   if p.returncode:raise RuntimeError('command_control_failed')
   if len(out)>262144:raise RuntimeError('process_inventory_limit')
   return out.decode()
  finally:
   if p.returncode is None:p.kill();await p.wait()
 async def snapshot(self):
  raw=await self.control('echo scanner=$$; for f in /proc/[0-9]*/stat; do cat "$f" 2>/dev/null || :; done')
  lines=raw.splitlines();scanner=int(lines[0].split('=')[1]);rows={}
  for line in lines[1:]:
   pid,sep,tail=line.partition(' (');_,sep,tail=tail.rpartition(') ')
   if not sep:raise RuntimeError('process_identity_unavailable')
   fields=tail.split();rows[int(pid)]={'state':fields[0],'pgid':int(fields[2]),'start':fields[19]}
  group=rows.get(scanner,{}).get('pgid')
  if group is None:raise RuntimeError('scanner_identity_unavailable')
  return {p:r for p,r in rows.items() if r['pgid']!=group and r['state']!='Z'}
 async def run(self,command,timeout):
  token=uuid.uuid4().hex;directory='/tmp/pan-command-'+token
  before=await self.snapshot();chunks={'stdout':bytearray(),'stderr':bytearray()};sizes={'stdout':0,'stderr':0}
  # The anchor survives normal completion until the controller signals its group.
  # A gate file ensures no solving command starts before identity is captured.
  script='umask 077; mkdir '+directory+' || exit 125; echo $$ > '+directory+'/pid; while [ ! -f '+directory+'/go ]; do sleep 0.01; done; /bin/sh -c "$1"; rc=$?; echo "$rc" > '+directory+'/rc; while :; do sleep 1; done'
  argv=['docker','exec']+(['-w',self.cwd] if self.cwd else [])+[self.cid,'setsid','/bin/sh','-c',script,'pan-command',command]
  proc=await asyncio.create_subprocess_exec(*argv,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
  async def drain(name,stream):
   while chunk:=await stream.read(8192):
    sizes[name]+=len(chunk);chunks[name].extend(chunk[:max(0,self.LIMIT-len(chunks[name]))])
  readers=[asyncio.create_task(drain(n,getattr(proc,n))) for n in chunks]
  identity=None;observed={};status='stop_unconfirmed';code=None;confirmed=False
  deadline=asyncio.get_running_loop().time()+timeout
  try:
   while asyncio.get_running_loop().time()<deadline:
    value=(await self.control('cat '+directory+'/pid 2>/dev/null || :')).strip()
    if value:
     pid=int(value);snap=await self.snapshot();row=snap.get(pid)
     if not row or row['pgid']!=pid:raise RuntimeError('command_identity_unavailable')
     identity={'pid':pid,'start':row['start']};observed.update(snap)
     if asyncio.get_running_loop().time()>=deadline:break
     await self.control('touch '+directory+'/go');break
    if proc.returncode is not None:raise RuntimeError('command_setup_failed')
    await asyncio.sleep(.01)
   if identity is None:raise RuntimeError('command_identity_unavailable')
   while asyncio.get_running_loop().time()<deadline:
    value=(await self.control('cat '+directory+'/rc 2>/dev/null || :')).strip()
    if value:code=int(value);status='completed';break
    await asyncio.sleep(.02)
   else:status='timeout'
   # Completion racing the deadline never changes timeout into a retry.
   snap=await self.snapshot();observed.update(snap);pid=identity['pid']
   if snap.get(pid,{}).get('start')!=identity['start']:raise RuntimeError('command_identity_changed')
   foreign={p:r for p,r in snap.items() if p not in before and r['pgid']!=pid}
   if foreign:raise RuntimeError('unmanaged_process_observed')
   await self.control('kill -9 -'+str(pid))
   cleanup=asyncio.get_running_loop().time()+2
   while True:
    remaining=await self.snapshot()
    if not any(r['pgid']==pid for r in remaining.values()):
     if any(p not in before and r['pgid']!=pid for p,r in remaining.items()):raise RuntimeError('unmanaged_process_observed')
     confirmed=True;break
    if asyncio.get_running_loop().time()>=cleanup:raise RuntimeError('command_stop_unconfirmed')
    await asyncio.sleep(.02)
   await asyncio.wait_for(proc.wait(),2);await asyncio.wait_for(asyncio.gather(*readers),2)
  except (Exception,asyncio.CancelledError):
   status='stop_unconfirmed';confirmed=False
  finally:
   # This is only client cleanup. Bound owns mandatory environment shutdown on uncertainty.
   if proc.returncode is None:proc.kill();await proc.wait()
   for reader in readers:
    if not reader.done():reader.cancel()
   await asyncio.gather(*readers,return_exceptions=True)
  return {'status':status,'exit_code':code if status=='completed' else None,
   **{n:bytes(v).decode(errors='replace') for n,v in chunks.items()},
   'output_bounds':{n:{'bytes':sizes[n],'retained_bytes':len(chunks[n]),'truncated':sizes[n]>len(chunks[n])} for n in chunks},
   'termination':{'confirmed':confirmed,'identity':identity,'managed':[{ 'pid':p,**r} for p,r in observed.items() if identity and r['pgid']==identity['pid']],
    'scope':'observed process group; not adversarial containment'}}
class Bound:
 def __init__(self,env,stopper,verifier,commands=None):self.env=env;self.stopper=stopper;self.verifier=verifier;self.commands=commands;self.finished=False;self.active=False;self.stopped=False;self.stop_task=None
 async def exec(self,command,timeout=30):
  if self.active or self.finished or self.stopped:raise RuntimeError('invalid_environment_phase')
  if not isinstance(command,str) or len(command)>32768 or isinstance(timeout,bool) or not isinstance(timeout,(int,float)) or not math.isfinite(timeout) or not 0<timeout<=30:raise RuntimeError('invalid_command')
  self.active=True
  try:
   if self.commands is None:
    # Legacy offline BaseEnvironment seam is not used by the live broker.
    r=await self.env.exec(command);return {'status':'completed','exit_code':r.return_code,'stdout':r.stdout,'stderr':r.stderr}
   r=await self.commands.run(command,timeout)
   if not r['termination']['confirmed']:await self.stop('command_stop_unconfirmed')
   if self.stopped:r={**r,'status':'cancelled' if r['termination']['confirmed'] else 'stop_unconfirmed'}
   return r
  finally:self.active=False
 async def stop(self,reason):
  self.stopped=True
  if self.stop_task is None:self.stop_task=asyncio.create_task(self.stopper(reason))
  await self.stop_task
  return {'stopped':True}
 async def verify(self):
  if self.active or self.stopped or self.finished:raise RuntimeError('invalid_verifier_phase')
  self.finished=True;return await self.verifier()
async def main():
 current=asyncio.current_task();asyncio.get_running_loop().add_signal_handler(signal.SIGTERM,current.cancel)
 config=json.loads(await asyncio.to_thread(sys.stdin.readline));meta=config['task'];root=Path(config['task_root'])/meta['path'];trial=TrialPaths(trial_dir=Path(config['output']));trial.mkdir()
 stage='source_validation';sid='wo78-'+uuid.uuid4().hex[:16];cid=None
 def record_stage(value):
  nonlocal stage
  stage=value
  print(json.dumps({'diagnostic':{'stage':stage,'project':sid}}),flush=True)
 record_stage(stage)
 try:validate_source(root,meta)
 except BaseException as exc:
  detail=failure(exc,stage,meta['id'],sid,cid);(trial.trial_dir/'failure.json').write_text(json.dumps(detail)+'\n');print(json.dumps({'diagnostic':{'stage':stage,'reason':detail['causes'][0]['reason']}}),flush=True);raise
 task=Task(root);cfg=task.config.environment.model_copy(update={'docker_image':config['image']});assert not task.config.verifier.env
 env=RecordingEnvironment(environment_dir=root/'environment',environment_name='wo75',session_id=sid,trial_paths=trial,task_env_config=cfg,mounts=[{'type':'bind','source':str(trial.verifier_dir),'target':'/logs/verifier'}],keep_containers=True)
 helper=PanAgent(logs_dir=trial.agent_dir);helper.records=[];helper.stopped=False;cid=None
 async def send(x):print(json.dumps(x),flush=True)
 async def stop(reason):await asyncio.wait_for(helper.stop_target(env,reason),30)
 async def verify():
  env.verifier_phase=True;env.verifier_exits=[]
  try:
   value=await asyncio.wait_for(Verifier(task,trial,env).verify(),task.config.verifier.timeout_sec)
   # Preserve Harbor's original reward. Zero alone never labels Agent failure.
   return {'status':'official_scored','rewards':value.rewards,'verifier_exit_or_exception':env.verifier_exits,'raw_reward_paths':['verifier/reward.txt','verifier/reward.json']}
  except Exception as e:return {'status':'evaluation_error','rewards':None,'verifier_exit_or_exception':type(e).__name__,'verifier_exits':env.verifier_exits,'raw_reward_paths':['verifier/reward.txt','verifier/reward.json']}
 jobs=set()
 try:
  record_stage('daemon_connection')
  if (await docker('info','--format','{{.OSType}}')).strip()!='linux':raise RuntimeError('docker_operation_failed')
  record_stage('compose_create')
  await asyncio.wait_for(env.start(force_build=False),cfg.build_timeout_sec)
  record_stage('inspect_audit')
  ids=(await docker('ps','-aq','--filter','label=com.docker.compose.project='+sid,'--filter','label=com.docker.compose.service=main')).split();assert len(ids)==1;cid=ids[0];helper.container_id=cid
  info=json.loads(await docker('inspect',cid))[0];assert info['Image']==config['image']
  (trial.trial_dir/'configuration.json').write_text(json.dumps(audit(info,trial.verifier_dir,cfg),indent=2)+'\n')
  # Do not inject tests/solutions before the Agent; baked upstream tests are a live blocker.
  absent=await env.exec('test ! -e /tests && test ! -e /solution');assert absent.return_code==0
  record_stage('ready')
  bound=Bound(env,stop,verify,ManagedCommand(cid,cfg.workdir));await send({'ready':True,'instruction':task.instruction})
  async def handle(msg):
   try:
    assert set(msg)<= {'id','method','command','reason','timeout'}
    if msg['method']=='exec':r=await bound.exec(msg['command'],msg.get('timeout',30))
    elif msg['method']=='stop':r=await bound.stop(msg.get('reason','stop'))
    elif msg['method']=='verify':r=await bound.verify()
    else:raise ValueError('unknown_method')
    await send({'id':msg['id'],'result':r})
   except Exception as e:await send({'id':msg['id'],'error':type(e).__name__})
  while line:=await asyncio.to_thread(sys.stdin.readline):
   msg=json.loads(line);job=asyncio.create_task(handle(msg));jobs.add(job);job.add_done_callback(jobs.discard)
  await asyncio.gather(*jobs)
 except BaseException as exc:
  detail=failure(exc,stage,meta['id'],sid,cid)
  (trial.trial_dir/'failure.json').write_text(json.dumps(detail,indent=2)+'\n')
  await send({'diagnostic':{'stage':stage,'reason':detail['causes'][0]['reason']}})
  raise
 finally:
  if not cid:
   ids=(await docker('ps','-aq','--filter','label=com.docker.compose.project='+sid,'--filter','label=com.docker.compose.service=main')).split()
   if len(ids)==1:cid=ids[0];helper.container_id=cid
  if cid:
   await stop('controller_exit');(trial.trial_dir/'stop.json').write_text(json.dumps(helper.records,indent=2)+'\n')
  # Only this newly allocated project; never old campaigns or global prune.
  await release_network(docker,sid,trial.trial_dir)
if __name__=='__main__':asyncio.run(main())
