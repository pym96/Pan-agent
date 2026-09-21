"""WO71 owned-command receipts and finite resource sampling; not a hard quota."""
import datetime, json, os, pathlib, signal, subprocess, time
GIB=2**30
RAW=pathlib.Path('/Users/panyiming/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw')
class Resources:
 def __init__(self,evidence,work):
  self.evidence=pathlib.Path(evidence);self.work=pathlib.Path(work);self.evidence.mkdir(parents=True,exist_ok=True)
  self.state=self.evidence/'resource-state.json'
  if self.state.exists():self.data=json.loads(self.state.read_text())
  else:self.data={'baseline':self.sample(),'active_seconds':0,'steps':[]};self.save()
 def sample(self):
  stat=os.statvfs('/Users/panyiming');allocated=0
  if self.work.exists():
   for root,dirs,files in os.walk(self.work,followlinks=False):
    for name in files:
     p=pathlib.Path(root)/name
     if not p.is_symlink():allocated+=p.stat().st_blocks*512
  return {'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'free_bytes':stat.f_bavail*stat.f_frsize,'docker_raw_bytes':RAW.stat().st_blocks*512,'owned_files_bytes':allocated}
 def save(self):self.state.write_text(json.dumps(self.data,indent=2)+'\n')
 def check(self,s):
  before=self.data['baseline'];delta=s['docker_raw_bytes']-before['docker_raw_bytes']+s['owned_files_bytes']-before['owned_files_bytes']
  if s['free_bytes']<60*GIB or delta>=24*GIB:raise RuntimeError('resource_boundary_crossed')
  if self.data['active_seconds']>=7200:raise RuntimeError('role_time_budget_exhausted')
 def run(self,name,command,*,env,cwd=None,timeout=1200,estimate=0):
  if (self.evidence/(name+'-receipt.json')).exists():raise RuntimeError('receipt_already_exists')
  before=self.sample();self.check(before)
  delta=before['docker_raw_bytes']-self.data['baseline']['docker_raw_bytes']+before['owned_files_bytes']-self.data['baseline']['owned_files_bytes']
  if delta+estimate>24*GIB or before['free_bytes']-estimate<60*GIB:raise RuntimeError('planned_resource_boundary')
  row={'name':name,'command':command,'cwd':str(cwd) if cwd else None,'environment_names':sorted(env),'timeout_seconds':timeout,'estimate_incremental_bytes':estimate,'samples':[before]}
  # Inventory before every acquisition/build; no commands/env/token contents from containers.
  inventory=[]
  for args in [['image','ls','--digests','--no-trunc','--format','{{json .}}'],['ps','-a','--format','{{.ID}} {{.Names}} {{.Image}} {{.Status}}'],['network','ls','--format','{{json .}}'],['volume','ls','--format','{{json .}}'],['system','df']]:
   r=subprocess.run(['docker','--context','desktop-linux',*args],env=env,capture_output=True,text=True,timeout=15);inventory.append({'args':args,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
  (self.evidence/(name+'-inventory.json')).write_text(json.dumps(inventory,indent=2)+'\n')
  started=time.monotonic();error=None
  with (self.evidence/(name+'.log')).open('wb') as log:
   p=subprocess.Popen(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   try:
    while p.poll() is None:
     s=self.sample();row['samples'].append(s);self.check(s)
     elapsed=time.monotonic()-started
     if elapsed>=timeout or elapsed+self.data['active_seconds']>=7200:raise RuntimeError('time_budget_exhausted')
     (self.evidence/(name+'-running.json')).write_text(json.dumps(row,indent=2)+'\n')
     time.sleep(min(5,max(.1,timeout-elapsed)))
   except BaseException as exc:
    error=type(exc).__name__+': '+str(exc);os.killpg(p.pid,signal.SIGTERM)
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   finally:
    row.update(exit=p.wait(),active_seconds=time.monotonic()-started,error=error);row['samples'].append(self.sample());(self.evidence/(name+'-receipt.json')).write_text(json.dumps(row,indent=2)+'\n');self.data['steps']=[json.loads(p.read_text()) for p in sorted(self.evidence.glob('*-receipt.json')) if not p.name.startswith('._') and 'active_seconds' in json.loads(p.read_text())];self.data['active_seconds']=self.data.get('additional_accounted_seconds',0)+sum(r['active_seconds'] for r in self.data['steps']);self.save()
  if error or row['exit']!=0:raise RuntimeError('step_failed:'+name)
  return row
