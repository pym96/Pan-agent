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
class CommandFailure(RuntimeError):
 """Finite diagnostic codes only; never serialize exception text."""
 REASONS=frozenset(['command_control_failed','process_inventory_limit','process_identity_unavailable',
  'scanner_identity_unavailable','command_identity_unavailable','command_identity_changed',
  'unmanaged_process_observed','command_stop_unconfirmed','command_setup_failed','pid_malformed','pid_not_received','process_missing','process_group_mismatch'])
 def __init__(self,reason):self.reason=reason if reason in self.REASONS else 'internal_error';super().__init__(self.reason)
class ManagedCommand:
 """One container-bound process group; never treats cancelling docker client as a stop.

 Linux /proc + setsid + POSIX shell are required. No arbitrary-process sandbox:
 newly observed processes outside the group cause uncertainty and environment stop.
 Only non-zombie members execute; PID/start-time identities guard signal targeting.
 """
 LIMIT=65536
 def __init__(self,container_id,cwd=None):self.cid=container_id;self.cwd=cwd;self.observations=[];self.stage='baseline_snapshot';self.interrupt=asyncio.Event();self.baseline=None
 async def control(self,script):
  clock=asyncio.get_running_loop().time;started=clock();p=None;first=None;size=0;parts=[];outcome='error'
  try:
   p=await asyncio.create_subprocess_exec('docker','exec',self.cid,'/bin/sh','-c',script,stdin=asyncio.subprocess.DEVNULL,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
   spawned=clock()
   async def collect():
    nonlocal first,size
    while chunk:=await p.stdout.read(8192):
     if first is None:first=clock()
     size+=len(chunk)
     if size>262144:raise CommandFailure('process_inventory_limit')
     parts.append(chunk)
    await p.wait()
   await asyncio.wait_for(collect(),5)
   if p.returncode:raise CommandFailure('command_control_failed')
   outcome='completed';return b''.join(parts).decode()
  except TimeoutError:outcome='timeout';raise
  except asyncio.CancelledError:outcome='cancelled';raise
  finally:
   if p is not None and p.returncode is None:p.kill();await p.wait()
   item={'stage':self.stage,'spawn_seconds':spawned-started if p is not None else None,'first_byte_seconds':first-started if first else None,'elapsed_seconds':clock()-started,'bytes':size,'exit_code':p.returncode if p else None,'outcome':outcome}
   if len(self.observations)<32:self.observations.append(item)
 async def snapshot(self):
  raw=await self.control('echo scanner=$$; for f in /proc/[0-9]*/stat; do cat "$f" 2>/dev/null || :; done')
  return self.parse_snapshot(raw)
 @staticmethod
 def parse_snapshot(raw):
  lines=raw.splitlines();rows={}
  if not lines or not lines[0].startswith('scanner='):raise CommandFailure('scanner_identity_unavailable')
  scanner=ManagedCommand.parse_pid(lines[0][8:])
  for line in lines[1:]:
   pid,sep,tail=line.partition(' (');_,sep,tail=tail.rpartition(') ')
   if not sep:raise CommandFailure('process_identity_unavailable')
   fields=tail.split()
   if len(fields)<20 or not pid.isdecimal() or not fields[1].isdecimal() or not fields[2].isdecimal() or not fields[19].isdecimal():raise CommandFailure('process_identity_unavailable')
   rows[int(pid)]={'state':fields[0],'ppid':int(fields[1]),'pgid':int(fields[2]),'start':fields[19]}
  group=rows.get(scanner,{}).get('pgid')
  if group is None:raise CommandFailure('scanner_identity_unavailable')
  return {p:r for p,r in rows.items() if r['pgid']!=group and r['state']!='Z'}
 @staticmethod
 def parse_pid(value):
  if not value.isascii() or not value.isdecimal() or not 0<int(value)<=2147483647:raise CommandFailure('pid_malformed')
  return int(value)
 async def initialize(self):
  if self.baseline is None:self.baseline=await self.snapshot()
 async def confirm_quiescent(self):
  await self.initialize();self.stage="handoff_snapshot";after=await self.snapshot()
  unknown={p:r for p,r in after.items() if p not in self.baseline or r["start"]!=self.baseline[p]["start"]}
  return {"confirmed":not unknown,"baseline":[{"pid":p,**r} for p,r in self.baseline.items()],"remaining":[{"pid":p,**r} for p,r in after.items()],"scope":"pinned pre-Agent process identities; unknown processes reject handoff"}
 async def run(self,command,timeout):
  self.observations=[]
  token=uuid.uuid4().hex;directory='/tmp/pan-command-'+token
  before={};chunks={'stdout':bytearray(),'stderr':bytearray()};sizes={'stdout':0,'stderr':0}
  # The anchor survives normal completion until the controller signals its group.
  # A gate file ensures no solving command starts before identity is captured.
  script='umask 077; mkdir '+directory+' || exit 125; echo $$ > '+directory+'/pid; while [ ! -f '+directory+'/go ]; do sleep 0.01; done; /bin/sh -c "$1"; rc=$?; echo "$rc" > '+directory+'/rc; while :; do sleep 1; done'
  argv=['docker','exec']+(['-w',self.cwd] if self.cwd else [])+[self.cid,'setsid','--wait','/bin/sh','-c',script,'pan-command',command]
  proc=None;readers=[];stages=[];stage='baseline_snapshot';reason=None
  def enter(value):
   nonlocal stage
   stage=value;self.stage=value
   if len(stages)<16:stages.append(value)
  async def drain(name,stream):
   while chunk:=await stream.read(8192):
    sizes[name]+=len(chunk);chunks[name].extend(chunk[:max(0,self.LIMIT-len(chunks[name]))])
  identity=None;received_pid=None;launcher=None;foreign={};observed={};status='stop_unconfirmed';code=None;confirmed=False
  try:
   enter('baseline_snapshot');before=await self.snapshot()
   if self.baseline is None:self.baseline=before
   if any(p not in self.baseline or r['start']!=self.baseline[p]['start'] for p,r in before.items()):raise CommandFailure('unmanaged_process_observed')
   enter('launch');proc=await asyncio.create_subprocess_exec(*argv,stdin=asyncio.subprocess.DEVNULL,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
   readers=[asyncio.create_task(drain(n,getattr(proc,n))) for n in chunks]
   deadline=asyncio.get_running_loop().time()+timeout
   enter('pid_receipt')
   while asyncio.get_running_loop().time()<deadline:
    value=(await self.control('cat '+directory+'/pid 2>/dev/null || :')).strip()
    if value:
     pid=self.parse_pid(value);received_pid=pid;enter('process_snapshot');snap=await self.snapshot();enter('identity_validation');row=snap.get(pid)
     if not row:raise CommandFailure('process_missing')
     if row['pgid']!=pid:raise CommandFailure('process_group_mismatch')
     identity={'pid':pid,'start':row['start']};observed.update(snap)
     parent=snap.get(row.get('ppid'))
     if parent and row['ppid'] not in before:launcher={'pid':row['ppid'],'start':parent['start']}
     if self.interrupt.is_set() or asyncio.get_running_loop().time()>=deadline:break
     enter('go_release');await self.control('touch '+directory+'/go');break
    if proc.returncode is not None:raise CommandFailure('command_setup_failed')
    await asyncio.sleep(.01)
   if identity is None:raise CommandFailure('pid_not_received')
   enter('settlement')
   while asyncio.get_running_loop().time()<deadline:
    if self.interrupt.is_set():status='interrupted';break
    try:value=(await asyncio.wait_for(self.control('cat '+directory+'/rc 2>/dev/null || :'),max(.001,deadline-asyncio.get_running_loop().time()))).strip()
    except TimeoutError:status='timeout';break
    if value:code=int(value);status='completed';break
    await asyncio.sleep(.02)
   else:status='timeout'
   # Completion racing the deadline never changes timeout into a retry.
   enter('termination_snapshot');snap=await self.snapshot();observed.update(snap);pid=identity['pid']
   if snap.get(pid,{}).get('start')!=identity['start']:raise CommandFailure('command_identity_changed')
   known_groups={r['pgid'] for r in before.values()}
   foreign={p:r for p,r in snap.items() if r['pgid'] not in known_groups and r['pgid']!=pid and not (launcher and p==launcher['pid'] and r['start']==launcher['start'])}
   if foreign:raise CommandFailure('unmanaged_process_observed')
   enter('termination_signal');await self.control('kill -9 -'+str(pid))
   enter('termination_confirmation');cleanup=asyncio.get_running_loop().time()+2
   while True:
    remaining=await self.snapshot()
    if not any(r['pgid']==pid for r in remaining.values()):
     if any(r['pgid'] not in known_groups and r['pgid']!=pid and not (launcher and p==launcher['pid'] and r['start']==launcher['start']) for p,r in remaining.items()):raise CommandFailure('unmanaged_process_observed')
     confirmed=True;break
    if asyncio.get_running_loop().time()>=cleanup:raise CommandFailure('command_stop_unconfirmed')
    await asyncio.sleep(.02)
   enter('output_settlement');await asyncio.wait_for(proc.wait(),2);await asyncio.wait_for(asyncio.gather(*readers),2)
  except (Exception,asyncio.CancelledError) as exc:
   reason=exc.reason if isinstance(exc,CommandFailure) else 'operation_timeout' if isinstance(exc,TimeoutError) else 'cancelled' if isinstance(exc,asyncio.CancelledError) else 'internal_error'
   status='stop_unconfirmed';confirmed=False
  finally:
   command_client_exit=proc.returncode if proc else None
   # This is only client cleanup. Bound owns mandatory environment shutdown on uncertainty.
   if proc is not None and proc.returncode is None:proc.kill();await proc.wait()
   for reader in readers:
    if not reader.done():reader.cancel()
   await asyncio.gather(*readers,return_exceptions=True)
  return {'diagnostic':{'stage':stage,'reason':reason,'stages':stages,'received_pid':received_pid,'command_client_exit':command_client_exit,'unmanaged':[{ 'pid':p,**r} for p,r in list(foreign.items())[:16]],'control_operations':self.observations},'status':status,'exit_code':code if status=='completed' else None,
   **{n:bytes(v).decode(errors='replace') for n,v in chunks.items()},
   'output_bounds':{n:{'bytes':sizes[n],'retained_bytes':len(chunks[n]),'truncated':sizes[n]>len(chunks[n])} for n in chunks},
   'termination':{'confirmed':confirmed,'identity':identity,'managed':[{ 'pid':p,**r} for p,r in observed.items() if identity and r['pgid']==identity['pid']],
    'scope':'observed process group; not adversarial containment'}}
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
   if not r['termination']['confirmed']:await self.stop('command_stop_unconfirmed')
   if self.stopped:r={**r,'status':'cancelled' if r['termination']['confirmed'] else 'stop_unconfirmed'}
   return r
  finally:self.active=False;self.active_task=None
 async def quiesce(self):
  self.quiescing=True
  if self.commands is None:return {'confirmed':False,'reason':'no_process_controller'}
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
