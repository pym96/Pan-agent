"""Credential-free Harbor capability server. Only the Node controller reads keys."""
import asyncio,json,hashlib,sys,uuid,signal,math
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
 p=await asyncio.create_subprocess_exec('docker',*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
 try:
  out,_=await asyncio.wait_for(p.communicate(),20)
  if p.returncode:raise RuntimeError('docker_operation_failed. Return code: '+str(p.returncode)+'.')
  return out.decode()
 finally:
  if p.returncode is None:p.kill();await asyncio.wait_for(p.wait(),2)
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
 """Bounded host Docker-client wait, not a task-process lifecycle controller.

 Mirrors frozen Harbor's bash -c and host-client terminate/kill on wait expiry.
 Task processes may survive; only the owning environment stop ends their lifetime.
 No PID inventory, process-group signals, service registry or initial whitelist.
 """
 LIMIT=65536
 def __init__(self,container_id,cwd=None):
  self.cid=container_id;self.cwd=cwd;self.interrupt=asyncio.Event();self.active=False
 async def initialize(self):pass
 async def confirm_quiescent(self):
  if self.active:return {'confirmed':False,'reason':'client_wait_active'}
  info=json.loads(await asyncio.wait_for(docker('inspect',self.cid),5))[0]
  return {'confirmed':bool(info['State']['Running']),'reason':None if info['State']['Running'] else 'environment_not_running','scope':'Agent admission closed and host client wait settled; task processes retained'}
 async def run(self,command,timeout):
  self.active=True;proc=None;tasks=[];settled=False;status='stop_unconfirmed';reason=None;code=None
  chunks={n:bytearray() for n in ('stdout','stderr')};sizes={n:0 for n in chunks}
  async def drain(name):
   while chunk:=await getattr(proc,name).read(8192):
    sizes[name]+=len(chunk);chunks[name].extend(chunk[:max(0,self.LIMIT-len(chunks[name]))])
  async def collect():
   await asyncio.gather(*(drain(n) for n in chunks));return await proc.wait()
  async def stop_client():
   if proc.returncode is None:
    proc.terminate()
    try:await asyncio.wait_for(proc.wait(),5)
    except TimeoutError:
     proc.kill();await asyncio.wait_for(proc.wait(),2)
  try:
   if self.interrupt.is_set():raise RuntimeError('admission_closed')
   argv=['docker','exec']+(['-w',self.cwd] if self.cwd else [])+[self.cid,'bash','-c',command]
   proc=await asyncio.create_subprocess_exec(*argv,stdin=asyncio.subprocess.DEVNULL,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
   pending=asyncio.create_task(collect());interrupted=asyncio.create_task(self.interrupt.wait());tasks=[pending,interrupted]
   done,_=await asyncio.wait(tasks,timeout=timeout,return_when=asyncio.FIRST_COMPLETED)
   if self.interrupt.is_set():status='interrupted'
   elif pending in done:code=pending.result();status='completed'
   else:status='timeout'
   if status!='completed':await stop_client()
   await asyncio.wait_for(asyncio.shield(pending),2)
   settled=proc.returncode is not None
  except (Exception,asyncio.CancelledError) as exc:
   reason='client_wait_cancelled' if isinstance(exc,asyncio.CancelledError) else 'client_wait_failed'
   status='stop_unconfirmed'
  finally:
   if proc is not None and proc.returncode is None:
    try:await stop_client()
    except Exception:reason='client_cleanup_failed';settled=False;status='stop_unconfirmed'
   for task in tasks:
    if not task.done():task.cancel()
   await asyncio.gather(*tasks,return_exceptions=True)
   self.active=False
  return {'status':status,'exit_code':code if status=='completed' else None,
   **{n:bytes(v).decode(errors='replace') for n,v in chunks.items()},
   'output_bounds':{n:{'bytes':sizes[n],'retained_bytes':len(chunks[n]),'truncated':sizes[n]>len(chunks[n])} for n in chunks},
   'diagnostic':{'reason':reason,'command_client_exit':proc.returncode if proc else None},
   'wait':{'settled':settled,'scope':'host Docker client only'},
   'task_processes':'may continue until task environment stops; timeout does not confirm command termination'}
class Bound:
 def __init__(self,env,stopper,verifier,commands=None):self.env=env;self.stopper=stopper;self.verifier=verifier;self.commands=commands;self.finished=False;self.active=False;self.stopped=False;self.stop_task=None;self.quiescing=False;self.quiet=None;self.active_task=None
 async def exec(self,command,timeout=30):
  if self.active or self.finished or self.stopped or self.quiescing:raise RuntimeError('invalid_environment_phase')
  if not isinstance(command,str) or len(command)>32768 or isinstance(timeout,bool) or not isinstance(timeout,(int,float)) or not math.isfinite(timeout) or not 0<timeout<=30:raise RuntimeError('invalid_command')
  self.active=True;self.active_task=asyncio.current_task()
  try:
   if self.commands is None:
    # Legacy offline BaseEnvironment seam is not used by the live broker.
    r=await self.env.exec(command);return {'status':'completed','exit_code':r.return_code,'stdout':r.stdout,'stderr':r.stderr}
   r=await self.commands.run(command,timeout)
   if not r['wait']['settled']:await self.stop('command_stop_unconfirmed')
   if self.stopped:r={**r,'status':'cancelled' if r['wait']['settled'] else 'stop_unconfirmed'}
   return r
  finally:self.active=False;self.active_task=None
 async def quiesce(self):
  self.quiescing=True
  if self.commands is None:return {'confirmed':False,'reason':'no_wait_controller'}
  self.commands.interrupt.set()
  try:
   if self.active_task:await asyncio.wait_for(asyncio.shield(self.active_task),12)
   if self.stopped:return {'confirmed':False,'reason':'environment_stopped'}
   self.quiet=await self.commands.confirm_quiescent()
   if not self.quiet['confirmed']:await self.stop('command_stop_unconfirmed')
   return self.quiet
  except Exception:
   await self.stop('command_stop_unconfirmed');return {'confirmed':False,'reason':'handoff_failed'}
 async def stop(self,reason):
  self.stopped=True
  if self.stop_task is None:self.stop_task=asyncio.create_task(self.stopper(reason))
  await self.stop_task
  return {'stopped':True}
 async def verify(self):
  if self.active or self.stopped or self.finished or not self.quiet or not self.quiet['confirmed']:raise RuntimeError('invalid_verifier_phase')
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
  commands=ManagedCommand(cid,cfg.workdir);await commands.initialize()
  bound=Bound(env,stop,verify,commands);await send({'ready':True,'instruction':task.instruction})
  async def handle(msg):
   try:
    assert set(msg)<= {'id','method','command','reason','timeout'}
    if msg['method']=='exec':r=await bound.exec(msg['command'],msg.get('timeout',30))
    elif msg['method']=='stop':r=await bound.stop(msg.get('reason','stop'))
    elif msg['method']=='quiesce':r=await bound.quiesce()
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
