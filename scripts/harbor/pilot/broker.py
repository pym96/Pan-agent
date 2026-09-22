"""Credential-free Harbor capability server. Only the Node controller reads keys."""
import asyncio,json,hashlib,sys,uuid,signal
from pathlib import Path
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
 if p.returncode:raise RuntimeError('docker_operation_failed')
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
class Bound:
 def __init__(self,env,stopper,verifier):self.env=env;self.stopper=stopper;self.verifier=verifier;self.finished=False;self.active=False;self.stopped=False;self.stop_task=None
 async def exec(self,command):
  if self.active or self.finished or self.stopped:raise RuntimeError('invalid_environment_phase')
  self.active=True
  try:r=await self.env.exec(command);return {'status':'completed','exit_code':r.return_code,'stdout':r.stdout,'stderr':r.stderr}
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
 validate_source(root,meta)
 task=Task(root);cfg=task.config.environment.model_copy(update={'docker_image':config['image']});assert not task.config.verifier.env
 sid='wo75-'+uuid.uuid4().hex[:16]
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
  await asyncio.wait_for(env.start(force_build=False),cfg.build_timeout_sec)
  ids=(await docker('ps','-aq','--filter','label=com.docker.compose.project='+sid,'--filter','label=com.docker.compose.service=main')).split();assert len(ids)==1;cid=ids[0];helper.container_id=cid
  info=json.loads(await docker('inspect',cid))[0];assert info['Image']==config['image']
  (trial.trial_dir/'configuration.json').write_text(json.dumps(audit(info,trial.verifier_dir,cfg),indent=2)+'\n')
  # Do not inject tests/solutions before the Agent; baked upstream tests are a live blocker.
  absent=await env.exec('test ! -e /tests && test ! -e /solution');assert absent.return_code==0
  bound=Bound(env,stop,verify);await send({'ready':True,'instruction':task.instruction})
  async def handle(msg):
   try:
    assert set(msg)<= {'id','method','command','reason'}
    if msg['method']=='exec':r=await bound.exec(msg['command'])
    elif msg['method']=='stop':r=await bound.stop(msg.get('reason','stop'))
    elif msg['method']=='verify':r=await bound.verify()
    else:raise ValueError('unknown_method')
    await send({'id':msg['id'],'result':r})
   except Exception as e:await send({'id':msg['id'],'error':type(e).__name__})
  while line:=await asyncio.to_thread(sys.stdin.readline):
   msg=json.loads(line);job=asyncio.create_task(handle(msg));jobs.add(job);job.add_done_callback(jobs.discard)
  await asyncio.gather(*jobs)
 except BaseException as exc:
  (trial.trial_dir/'failure.json').write_text(json.dumps({'error':type(exc).__name__})+'\n');raise
 finally:
  if not cid:
   ids=(await docker('ps','-aq','--filter','label=com.docker.compose.project='+sid,'--filter','label=com.docker.compose.service=main')).split()
   if len(ids)==1:cid=ids[0];helper.container_id=cid
  if cid:
   await stop('controller_exit');(trial.trial_dir/'stop.json').write_text(json.dumps(helper.records,indent=2)+'\n')
if __name__=='__main__':asyncio.run(main())
