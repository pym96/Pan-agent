"""Persistent WO76 operational accounting; no credential-bearing child environment."""
import json,os,signal,subprocess,time,fcntl
from pathlib import Path
GIB=2**30
class Budget:
 def __init__(self,work):
  self.work=Path(work);self.lock=(self.work/'preparation.lock').open('a');
  try:fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except Exception:self.lock.close();raise
  self.baseline=json.loads((self.work/'baseline.json').read_text());self.file=self.work/'budget.json'
  self.data=json.loads(self.file.read_text()) if self.file.exists() else {'limit_seconds':self.baseline.get('limit_seconds',7200),'spent_seconds':0,'commands':[]}
  self.limit=self.data['limit_seconds']
  if not 0<self.limit<=7200 or self.limit!=self.baseline.get('limit_seconds',7200):raise RuntimeError('budget_identity_mismatch')
  if any(r.get('status')=='running' for r in self.data['commands']):
   self.lock.close();raise RuntimeError('interrupted_preparation_requires_accounting; do not reset ledger')
  self.env={'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin','HOME':str(self.work/'home'),'DOCKER_CONFIG':str(self.work/'docker-config'),'DOCKER_HOST':'unix://'+str(Path.home()/'.docker/run/docker.sock'),'PYTHONDONTWRITEBYTECODE':'1','LANG':'en_US.UTF-8'}
 def save(self):
  p=self.file.with_suffix('.tmp');p.write_text(json.dumps(self.data,indent=2)+'\n');p.replace(self.file)
 def sample(self):
  s=os.statvfs(self.work);seen=set();owned=0
  repo=Path(__file__).resolve().parents[4]
  roots=[self.work,Path(__file__).resolve().parent,repo/'docs/design/terminal-bench-environments-76.md',repo/'docs/evidence/terminal-bench-environments-76.md']
  for root in roots:
   for p in ([root] if root.is_file() else root.rglob('*')):
    if p.is_file() and not p.is_symlink():
     st=p.stat();key=(st.st_dev,st.st_ino)
     if key not in seen:owned+=st.st_blocks*512;seen.add(key)
  row={'utc':time.time(),'free_bytes':s.f_bavail*s.f_frsize,'docker_allocated':Path(self.baseline['docker_raw']).stat().st_blocks*512,'owned_allocated':owned}
  row['increment_bytes']=max(0,row['docker_allocated']-self.baseline['docker_allocated'])+max(0,owned-self.baseline['owned_allocated'])
  return row
 def check(self,estimate=0):
  s=self.sample()
  if s['free_bytes']-estimate<60*GIB or s['increment_bytes']+estimate>24*GIB:raise RuntimeError('resource_admission_blocked')
  if self.data['spent_seconds']>=self.limit:raise RuntimeError('preparation_time_exhausted')
  return s
 def run(self,name,args,timeout=600,estimate=0,cleanup_grace=5,controller_home=False):
  before=self.check(estimate);remaining=self.limit-self.data['spent_seconds'];timeout=min(timeout,remaining-cleanup_grace)
  if timeout<=0:raise RuntimeError('preparation_time_exhausted')
  number=len(self.data['commands'])+1;log=self.work/'commands'/f'{number:03d}-{name}.log';log.parent.mkdir(exist_ok=True)
  row={'number':number,'name':name,'args':args,'status':'running','timeout':timeout,'samples':[before],'log':str(log)};self.data['commands'].append(row);self.save();start=time.monotonic();error=None
  with log.open('wb') as out:
   child_env=dict(self.env)
   if controller_home:child_env['HOME']=str(Path.home())
   row['controller_home']=controller_home
   process=subprocess.Popen(args,env=child_env,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
   try:
    while process.poll() is None:
     s=self.check();row['samples'].append(s);self.save()
     if time.monotonic()-start>=timeout:raise RuntimeError('command_timeout')
     try:process.wait(timeout=min(5,max(.05,timeout-(time.monotonic()-start))))
     except subprocess.TimeoutExpired:pass
   except BaseException as exc:
    error=type(exc).__name__+': '+str(exc);os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(cleanup_grace)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
   finally:
    elapsed=time.monotonic()-start;row.update(status='finished',exit=process.wait(),elapsed_seconds=elapsed,error=error);row['samples'].append(self.sample());self.data['spent_seconds']+=elapsed;self.save()
  return row
