"""Credential-free single-run Harbor DockerEnvironment + original Verifier API."""
import asyncio,json,sys,os,time,pathlib,hashlib,shlex,base64,signal,shutil
import importlib.metadata as metadata
from harbor.models.task.task import Task
from harbor.models.trial.paths import TrialPaths
from harbor.environments.docker.docker import DockerEnvironment
from harbor.verifier.verifier import Verifier
HERE=pathlib.Path(__file__).parent
async def main():
 loop=asyncio.get_running_loop();current=asyncio.current_task()
 for sig in [signal.SIGTERM,signal.SIGINT]:loop.add_signal_handler(sig,current.cancel)
 cfg=json.loads(sys.stdin.readline())
 for name,version in cfg.get('dependencyVersions',{}).items():assert metadata.version(name)==version,'dependency_version_drift'
 for f in cfg['remoteBoundFiles']:
  assert hashlib.sha256(pathlib.Path(f['path']).read_bytes()).hexdigest()==f['sha256'],'remote_bound_file_drift'
 out=pathlib.Path(cfg['output']);out.mkdir(exist_ok=False,parents=True)
 assert shutil.disk_usage(out).free>=20*2**30,'disk_floor'
 def event(kind,**values):
  with (out/'lifecycle.jsonl').open('a') as f:f.write(json.dumps({'time':time.time(),'type':kind,**values})+'\n')
 async def emit(value):print(json.dumps(value),flush=True)
 async def docker(*args):
  p=await asyncio.create_subprocess_exec('docker',*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE);o,e=await p.communicate()
  if p.returncode:raise RuntimeError('docker_failed:'+e.decode()[:500])
  return o.decode()
 class Recorded(DockerEnvironment):
  async def exec(self,*a,**kw):
   r=await super().exec(*a,**kw)
   if getattr(self,'verifying',False):event('verifier_exec',command=a[0] if a else kw.get('command'),return_code=r.return_code,stdout=r.stdout,stderr=r.stderr)
   return r
 task=Task(pathlib.Path(cfg['taskRoot']));trial=TrialPaths(trial_dir=out/'harbor');trial.mkdir()
 env=Recorded(environment_dir=task.paths.environment_dir,environment_name='demo56',session_id=cfg['project'],trial_paths=trial,task_env_config=task.config.environment.model_copy(update={'docker_image':cfg['image']}),mounts=[{'type':'bind','source':str(trial.verifier_dir),'target':'/logs/verifier'}],keep_containers=False)
 cid=None;phase='setup';cancelled=False;active=False;deadline=None
 try:
  event('environment_start',task='db-wal-recovery',api='DockerEnvironment')
  await asyncio.wait_for(env.start(force_build=False),task.config.environment.build_timeout_sec)
  ids=(await docker('ps','-aq','--filter','label=com.docker.compose.project='+cfg['project'],'--filter','label=com.docker.compose.service=main')).split();assert len(ids)==1;cid=ids[0]
  info=json.loads(await docker('inspect',cid))[0];h=info['HostConfig']
  assert info['Image']==cfg['imageId'] and h['NanoCpus']==10**9 and h['Memory']==2*2**30
  assert not h['Privileged'] and not h.get('CapAdd') and not h.get('Devices') and not h.get('DeviceRequests') and h['NetworkMode']!='host'
  assert all(m['Destination']=='/logs/verifier' and pathlib.Path(m['Source']).resolve()==trial.verifier_dir.resolve() for m in info['Mounts'])
  assert not any(any(w in x.split('=',1)[0].lower() for w in ['api_key','token','secret','password']) for x in info['Config']['Env'])
  (out/'container-inspect.json').write_text(json.dumps(info,indent=2))
  clean=await env.exec('test ! -e /tests && test ! -e /solution');assert clean.return_code==0
  phase='agent';event('environment_ready',containerId=cid);await emit({'ready':True,'containerId':cid,'instruction':task.instruction})
  while line:=await asyncio.to_thread(sys.stdin.readline):
   msg=json.loads(line);method=msg.get('method');ident=msg.get('id')
   try:
    if method=='begin':
     assert deadline is None;deadline=time.monotonic()+task.config.agent.timeout_sec;event('agent_begin');result={'started':True}
    elif method=='tool':
     assert phase=='agent' and deadline and time.monotonic()<deadline and not cancelled
     args=msg['arguments'];kind=msg['tool'];assert kind in ['read','write','edit','bash']
     if kind=='bash':command=args['command']
     else:
      encoded=base64.b64encode(json.dumps({'tool':kind,'arguments':args}).encode()).decode();script=base64.b64encode((HERE/'file_operation.py').read_bytes()).decode()
      command="python3 -c "+shlex.quote("import base64;exec(base64.b64decode('"+script+"'))")+' '+shlex.quote(encoded)
     timeout=min(float(args.get('timeout',120)),max(.1,deadline-time.monotonic()));assert timeout>0
     active=True;event('tool_start',tool=kind)
     r=await asyncio.wait_for(env.exec('timeout --signal=TERM --kill-after=2 '+str(timeout)+' bash -c '+shlex.quote(command),cwd='/app'),timeout+10)
     active=False;event('tool_result',tool=kind,exitCode=r.return_code)
     result={'content':[{'type':'text','text':(r.stdout or '')+(('\n'+r.stderr) if r.stderr else '')}], 'isError':r.return_code!=0,'details':{'exitCode':r.return_code,'stdout':r.stdout,'stderr':r.stderr}}
    elif method=='verify':
     assert phase=='agent' and not active and not cancelled;phase='verifier';event('agent_stopped_state_retained')
     # Remove any agent-written score artifacts before the original verifier.
     for p in trial.verifier_dir.iterdir():
      if p.is_file():p.unlink()
     env.verifying=True;event('verifier_start',api='Verifier.verify',timeout=task.config.verifier.timeout_sec)
     value=await asyncio.wait_for(Verifier(task,trial,env).verify(),task.config.verifier.timeout_sec)
     result={'status':'verifier_returned','result':value.model_dump(mode='json'),'testStdout':trial.test_stdout_path.read_text() if trial.test_stdout_path.exists() else None,'testStderr':trial.test_stderr_path.read_text() if trial.test_stderr_path.exists() else None,'ctrf':json.loads((trial.verifier_dir/'ctrf.json').read_text()) if (trial.verifier_dir/'ctrf.json').exists() else None};(out/'verifier-result.json').write_text(json.dumps(result,indent=2));event('verifier_finished',**result);phase='scored'
    elif method=='stop':result={'closing':True};await emit({'id':ident,'result':result});break
    else:raise ValueError('unknown_method')
    await emit({'id':ident,'result':result})
   except Exception as e:
    event('operation_error',method=method,error=type(e).__name__,detail=str(e));await emit({'id':ident,'error':type(e).__name__+': '+str(e)})
    if method in ['verify','begin'] or isinstance(e,asyncio.TimeoutError):break
 finally:
  if cid:
   await env.stop_service('main');state=json.loads(await docker('inspect',cid))[0]['State'];assert not state['Running'] and state['Pid']==0
   event('container_stopped',state=state);(out/'stop.json').write_text(json.dumps({'confirmed':True,'containerId':cid,'state':state}))
   await env.stop(delete=False);remaining=(await docker('ps','-aq','--filter','label=com.docker.compose.project='+cfg['project'])).strip();assert not remaining
   event('owned_environment_removed')
  event('closed')
if __name__=='__main__':asyncio.run(main())
