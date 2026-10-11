#!/usr/bin/env python3
"""Trusted-local, loopback-only deployment operator. No daemon or shell dependency."""
import argparse, contextlib, fcntl, hashlib, json, os, pathlib, secrets, shutil, signal, socket, subprocess, sys, time, urllib.request
P=pathlib.Path
HERE=P(__file__).resolve().parent
IMAGE='sha256:8129910271f9764b5c05038d351ad7b9f9d94b85351355b69c5526eadd111775'
FAULTS={'WEB_FAUX_BARRIER','WEB_RESULT_BARRIER','WEB_TOOL_BARRIER','WEB_CHECKPOINT_FAULT','WEB_OPERATION_FAULT','WEB_ADMISSION_FAULT','WEB107_SCENARIO'}
def require(ok, message):
 if not ok: raise RuntimeError(message)
def digest(p):
 h=hashlib.sha256()
 with P(p).open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def write(p,v):
 p=P(p);tmp=p.with_name(p.name+'.new');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');tmp.chmod(0o600);os.replace(tmp,p)
def tree(root):
 out={}
 for p in sorted(P(root).rglob('*')):
  require(not p.is_symlink(),'symlink rejected in package/backup')
  if p.is_file():out[str(p.relative_to(root))]=digest(p)
 return out
def verify(root,manifest):
 require(tree(root)==manifest,'file inventory mismatch')
def call(args,env=None):
 q=subprocess.run([str(x) for x in args],env=env,capture_output=True,text=True,timeout=45)
 require(q.returncode==0,'command failed: '+P(str(args[0])).name+'; inspect private logs')
 return q.stdout.strip()
def process(pid):
 q=subprocess.run(['ps','-p',str(pid),'-o','stat=','-o','lstart=','-o','command='],capture_output=True,text=True)
 if q.returncode!=0 or not q.stdout.strip() or q.stdout.split()[0].startswith('Z'):return None
 return q.stdout.strip().split(None,1)[1]
def alive(receipt):
 got=process(receipt['pid'])
 if got is None:return False
 same_start=got.split(None,5)[:5]==receipt['identity'].split(None,5)[:5]
 command=got.split(None,5)[5]
 require(got==receipt['identity'] or same_start and command==receipt.get('serviceTitle'),'PID identity changed; no signal sent')
 return True
def waitfor(check,seconds=30):
 until=time.monotonic()+seconds
 while time.monotonic()<until:
  if check():return
  time.sleep(.1)
 raise RuntimeError('readiness/stop not confirmed before deadline')
def freeport(port):
 with socket.socket() as s:
  # Match server restart semantics: TIME_WAIT is not a live listener.
  s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
  s.bind(('127.0.0.1',port))
def dependencies(c):
 for path,h in c['dependencies'].items():require(P(path).is_file() and digest(path)==h,'dependency identity changed: '+P(path).name)
def baseenv(c):
 return {'PATH':c['path'],'HOME':c['data'],'TMPDIR':str(P(c['data'])/'tmp'),'LANG':'en_US.UTF-8','LC_ALL':'C','DOCKER_HOST':c['dockerHost'],'DOCKER_CONFIG':str(P(c['data'])/'docker')}
def environment(c):
 d=P(c['data']);release=P(c['release']);e=baseenv(c)
 e.update(DATABASE_URL=f"postgres://panweb:{c['dbPassword']}@127.0.0.1:{c['pgPort']}/panweb?sslmode=disable",LISTEN_ADDR=f"127.0.0.1:{c['httpPort']}",APP_ORIGIN=f"http://127.0.0.1:{c['httpPort']}",WEB_DIR=str(release/'web'),WEB_MODE='product',WEB_ISSUE=c['namespace'],WEB_CACHE='1',WEB_REDIS_ADDR=f"127.0.0.1:{c['redisPort']}",WEB_CACHE_NAMESPACE=c['namespace'],WEB107_TASK_ROOT=str(d/'tasks'),WEB107_EXECUTOR=str(release/'executor/main.mjs'),PAN_ENTRY=str(release/'pan/dist/index.js'),PAN_IMAGE=IMAGE,WEB_CHECKPOINT_MODE='1',WEB_OPERATION_MODE='1',ANALYSIS_CPUS='1',ANALYSIS_MEMORY_GIB='1')
 mode=c.get('provider','offline-faux');require(mode in ['offline-faux','kimi'],'invalid provider')
 e['WEB_PROVIDER']=mode
 if mode=='kimi':
  require(c['workers']==1 and not c.get('testMode'),'live requires one worker and no fault mode')
  e['WEB_CHECKPOINT_MODE']='0';e['WEB_OPERATION_MODE']='0'
 faults=c.get('faults',{})
 require(not faults or c['testMode'],'fault injection requires explicit test mode')
 require(set(faults)<=FAULTS and all(isinstance(v,str) for v in faults.values()),'unknown fault configuration')
 require(not any(os.environ.get(k) not in (None,'','0') for k in FAULTS),'ambient fault configuration rejected; use explicit private test configuration')
 e.update(faults);return e
def sql(c,query):
 e=baseenv(c);e['PGPASSWORD']=c['dbPassword']
 return call([P(c['pgBin'])/'psql','-X','-h','127.0.0.1','-p',c['pgPort'],'-U','panweb','-d','panweb','-At','-v','ON_ERROR_STOP=1','-c',query],e)
def receiptfile(c):return P(c['data'])/'processes.json'
def receipts(c):return json.loads(receiptfile(c).read_text()) if receiptfile(c).exists() else {}
def spawn(c,name,args,env):
 rec=receipts(c);require(name not in rec or not alive(rec[name]),'service already running')
 with (P(c['data'])/'logs'/f'{name}.log').open('a') as f:
  p=subprocess.Popen([str(x) for x in args],env=env,cwd=c['data'],stdout=f,stderr=f,stdin=subprocess.DEVNULL,start_new_session=True)
 identity=process(p.pid);require(identity is not None,'process failed immediately; inspect logs')
 rec[name]={'pid':p.pid,'identity':identity}
 if name=='redis':rec[name]['serviceTitle']=c['redis']+' 127.0.0.1:'+str(c['redisPort'])
 write(receiptfile(c),rec)
 return rec[name]
def terminate(c,name):
 rec=receipts(c)
 if name not in rec:return
 r=rec[name]
 if alive(r):
  os.kill(r['pid'],signal.SIGTERM)
  def exited():
   observed=process(r['pid'])
   # After the one authorized signal, never signal again. Exiting processes
   # may rewrite argv; disappearance or a different start proves this instance gone.
   return observed is None or observed.split(None,5)[:5]!=r['identity'].split(None,5)[:5]
  waitfor(exited,45)
 rec.pop(name);write(receiptfile(c),rec)
def containers(c):
 raw=call(['docker','ps','-aq','--filter','label=pan.issue='+c['namespace']],baseenv(c))
 if not raw:return []
 info=json.loads(call(['docker','inspect',*raw.splitlines()],baseenv(c)))
 return [x['Id'] for x in info if x['State']['Running']]
def ownprocesses(c):
 # Detect receipt loss and orphan Node before a conflicting start/backup.
 raw=call(['ps','-axo','pid=,command='])
 needles=[str(P(c['release'])/'bin/evidence-web'),str(P(c['release'])/'executor/main.mjs'),str(P(c['data'])/'pgdata'),str(P(c['data'])/'redis.conf'),c['redis']+' 127.0.0.1:'+str(c['redisPort'])]
 return [line.strip() for line in raw.splitlines() if any(n in line for n in needles) and int(line.split()[0])!=os.getpid()]
def state(c):
 r=receipts(c);running={n:alive(v) for n,v in r.items()}
 return {'processes':running,'containers':containers(c),'ownedProcesses':ownprocesses(c),'mode':c.get('provider','offline-faux'),'testMode':c['testMode']}
def stopped(c):
 s=state(c);require(not any(s['processes'].values()) and not s['containers'] and not s['ownedProcesses'],'stop unknown or owned execution remains; inspect private logs/receipts')
def ready(c):
 r=receipts(c);names=['pg','redis','api']+[f'worker{i}' for i in range(c['workers'])]
 if not all(n in r and alive(r[n]) for n in names):return False
 try:
  if sql(c,'SELECT 1')!='1':return False
  ids=','.join(str(r[f'worker{i}']['pid']) for i in range(c['workers']))
  if sql(c,f"SELECT count(*) FROM ew_owners WHERE pid IN ({ids}) AND revoked_at IS NULL AND heartbeat>clock_timestamp()-interval '10 seconds'")!=str(c['workers']):return False
  with urllib.request.urlopen(f"http://127.0.0.1:{c['httpPort']}/",timeout=2) as x:
   if x.status!=200:return False
  with socket.create_connection(('127.0.0.1',c['redisPort']),2) as s:
   s.sendall(b'*1\r\n$4\r\nPING\r\n');return s.recv(64)==b'+PONG\r\n'
 except (OSError,RuntimeError):return False
def start(c):
 environment(c);dependencies(c)
 live=c.get('provider')=='kimi'
 key=os.environ.get('KIMI_API_KEY','') if live else ''
 require(not live or key.strip(),'KIMI_API_KEY must be provided to this start process; no fallback')
 r=receipts(c)
 if any(alive(v) for v in r.values()):
  require(ready(c),'partial deployment running; stop/inspect before start');print('already ready');return
 stopped(c)
 for p in [c['httpPort'],c['pgPort'],c['redisPort']]:freeport(p)
 call(['docker','image','inspect',IMAGE],baseenv(c))
 d=P(c['data']);env=environment(c)
 spawn(c,'pg',[P(c['pgBin'])/'postgres','-D',d/'pgdata'],baseenv(c))
 def pgready():
  try:return sql(c,'SELECT 1')=='1'
  except RuntimeError:return False
 waitfor(pgready)
 spawn(c,'redis',[c['redis'],d/'redis.conf'],baseenv(c))
 spawn(c,'api',[P(c['release'])/'bin/evidence-web'],env)
 # Migration completes before Workers acquire their shared lock.
 def apiready():
  try:
   with urllib.request.urlopen(env['APP_ORIGIN'],timeout=1) as x:return x.status==200
  except OSError:return False
 waitfor(apiready)
 worker_env=dict(env)
 if live:worker_env['KIMI_API_KEY']=key
 for i in range(c['workers']):spawn(c,f'worker{i}',[P(c['release'])/'bin/evidence-web','worker'],worker_env)
 waitfor(lambda:ready(c));print('ready '+env['APP_ORIGIN']+' — '+c.get('provider','offline-faux'))
def stop(c):
 for name in list(receipts(c)):
  if name.startswith('worker'):terminate(c,name)
 # Keep API/PG available until interrupted Node/container cleanup has settled.
 r=receipts(c)
 if 'api' in r and alive(r['api']) and 'pg' in r and alive(r['pg']):
  waitfor(lambda:sql(c,"SELECT count(*) FROM ew_tasks WHERE node_pid IS NOT NULL AND NOT cleanup_confirmed")=='0',45)
 terminate(c,'api');require(not containers(c),'analysis container stop unknown; PG retained')
 terminate(c,'redis')
 # postgres SIGTERM is smart shutdown; all owned clients must already have exited.
 terminate(c,'pg');stopped(c);print('all owned services/executions stopped')
def load(data):
 d=P(data).resolve();c=json.loads((d/'config.json').read_text());require(c['data']==str(d),'data path binding mismatch')
 require((d/'config.json').stat().st_mode&0o077==0 and d.stat().st_mode&0o077==0,'private directory/config permissions required')
 require(c['workers'] in [1,2] and len({c['httpPort'],c['pgPort'],c['redisPort']})==3 and all(type(c[k]) is int and 1024<=c[k]<=65535 for k in ['httpPort','pgPort','redisPort']),'invalid ports/workers')
 require(c['namespace'].startswith('dep-') and all(x.isalnum() or x=='-' for x in c['namespace']),'invalid namespace')
 require(c['release']==str(HERE.parent),'use this deployment installed operator')
 require(c['testMode'] in [True,False],'invalid test mode')
 return c
@contextlib.contextmanager
def lock(data):
 d=P(data);require(d.exists(),'initialize first')
 with (d/'.operator.lock').open('a') as f:
  try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise RuntimeError('another deployment operation is active')
  yield

def init(a):
 release=HERE.parent;require((release/'manifest.json').exists(),'init requires installed package')
 d=P(a.data).resolve();require(not d.is_relative_to(release) and not release.is_relative_to(d),'program and data directories must be separate');require(not d.exists() or not any(d.iterdir()),'init requires empty data directory')
 require(len({a.port,a.pg_port,a.redis_port})==3,'ports must differ')
 require(all(1024<=p<=65535 for p in [a.port,a.pg_port,a.redis_port]),'invalid port')
 for p in [a.port,a.pg_port,a.redis_port]:freeport(p)
 pg=P(a.pg_bin).resolve();node=P(shutil.which('node')).resolve();docker=P(shutil.which('docker')).resolve()
 deps={str(p):digest(p) for p in [node,docker,*[pg/n for n in ['postgres','initdb','psql','createdb']]]}
 d.mkdir(parents=True,exist_ok=True);d.chmod(0o700)
 with (d/'.init-claim').open('x') as f:f.write('initialization owns this directory; retain on failure\n')
 for n in ['logs','tasks','tmp','docker']: (d/n).mkdir(mode=0o700)
 c={'version':1,'provider':a.provider,'release':str(release),'data':str(d),'pgBin':str(pg),'redis':str(release/'bin/redis-server'),'dependencies':deps,'path':str(node.parent)+':'+str(docker.parent)+':/usr/bin:/bin:/usr/sbin:/sbin','dockerHost':call(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}']),'namespace':'dep-'+secrets.token_hex(8),'httpPort':a.port,'pgPort':a.pg_port,'redisPort':a.redis_port,'workers':a.workers,'testMode':a.test_mode,'faults':{},'dbPassword':secrets.token_hex(24),'accounts':{who:{'email':who+'@pan.local','password':secrets.token_hex(18)} for who in ['a','b']}}
 c['dependencies'][c['redis']]=digest(c['redis']);write(d/'config.json',c)
 pw=d/'db-password';pw.write_text(c['dbPassword']+'\n');pw.chmod(0o600)
 env=baseenv(c)
 q=subprocess.run([str(pg/'initdb'),'-D',str(d/'pgdata'),'-U','panweb','--auth=scram-sha-256','--pwfile='+str(pw)],env=env,capture_output=True,text=True)
 (d/'logs/init.log').write_text(q.stdout+q.stderr);require(q.returncode==0,'initdb failed; inspect private init log')
 with (d/'pgdata/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses='127.0.0.1'\nport={a.pg_port}\nunix_socket_directories=''\nshared_buffers='64MB'\nmax_connections=32\n")
 (d/'redis.conf').write_text(f'bind 127.0.0.1\nprotected-mode yes\nport {a.redis_port}\nsave ""\nappendonly no\ndaemonize no\nlogfile ""\ndir {d}\n')
 with lock(d):
  spawn(c,'pg',[pg/'postgres','-D',d/'pgdata'],env)
  env['PGPASSWORD']=c['dbPassword']
  def pgready():
   try:return call([pg/'psql','-X','-h','127.0.0.1','-p',a.pg_port,'-U','panweb','-d','postgres','-Atc','SELECT 1'],env)=='1'
   except RuntimeError:return False
  waitfor(pgready)
  call([pg/'createdb','-h','127.0.0.1','-p',a.pg_port,'-U','panweb','panweb'],env)
  for account in c['accounts'].values():
   e=environment(c);e.update(ACCOUNT_EMAIL=account['email'],ACCOUNT_PASSWORD=account['password']);call([release/'bin/evidence-web','account'],e)
  terminate(c,'pg');stopped(c)
 print('initialized; invited account secrets are only in private config.json')
def install(a):
 src=P(a.package).resolve();dst=P(a.dest).resolve();require(not dst.is_relative_to(src) and not src.is_relative_to(dst),'package and install destination must be separate');require(not dst.exists(),'install destination already exists')
 manifest=json.loads((src/'manifest.json').read_text());actual=tree(src);actual.pop('manifest.json',None);require(actual==manifest['files'],'package inventory mismatch')
 dst.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(src,dst);print('installed '+str(dst))
def backup(c,target):
 stopped(c);out=P(target).resolve();require(not out.exists(),'backup destination exists');require(not out.is_relative_to(P(c['data'])),'backup must be outside data')
 out.mkdir(parents=True,mode=0o700);shutil.copytree(c['data'],out/'data',ignore=shutil.ignore_patterns('.operator.lock'))
 write(out/'manifest.json',{'dataPath':c['data'],'releasePath':c['release'],'files':tree(out/'data'),'kind':'stopped-physical-same-host-same-path','redis':'discardable-no-persistence'})
 print('stopped backup created '+str(out))
def restore(a):
 d=P(a.data).resolve();src=P(a.backup).resolve();m=json.loads((src/'manifest.json').read_text());require(str(d)==m['dataPath'] and str(HERE.parent)==m['releasePath'],'restore requires original data and program paths')
 require(not d.exists(),'preserve/move stopped original data before restore; destination must not exist');verify(src/'data',m['files'])
 backupcfg=json.loads((src/'data/config.json').read_text());stopped(backupcfg)
 for p in [backupcfg['httpPort'],backupcfg['pgPort'],backupcfg['redisPort']]:freeport(p)
 shutil.copytree(src/'data',d);print('restored stopped checkpoint; start explicitly; no PID/process revival')
def main():
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
 i=sub.add_parser('install');i.add_argument('--package',required=True);i.add_argument('--dest',required=True)
 i=sub.add_parser('init');i.add_argument('--data',required=True);i.add_argument('--pg-bin',required=True);i.add_argument('--port',type=int,default=8114);i.add_argument('--pg-port',type=int,default=54114);i.add_argument('--redis-port',type=int,default=63114);i.add_argument('--workers',type=int,choices=[1,2],default=1);i.add_argument('--test-mode',action='store_true');i.add_argument('--provider',choices=['offline-faux','kimi'],default='offline-faux')
 for cmd in ['start','stop','restart','status','backup','restore']:
  i=sub.add_parser(cmd);i.add_argument('--data',required=True)
  if cmd in ['backup','restore']:i.add_argument('--backup',required=True)
 a=p.parse_args();os.umask(0o077)
 if a.command=='install':return install(a)
 if a.command=='init':return init(a)
 if a.command=='restore':return restore(a)
 with lock(a.data):
  c=load(a.data)
  if a.command=='start':start(c)
  elif a.command=='stop':stop(c)
  elif a.command=='restart':stop(c);start(c)
  elif a.command=='backup':backup(c,a.backup)
  else:
   s=state(c);s['ready']=ready(c);print(json.dumps(s,indent=2));require(s['ready'] or not s['ownedProcesses'] and not s['containers'],'partial/unknown deployment')
if __name__=='__main__':
 try:main()
 except (RuntimeError,OSError,ValueError,subprocess.SubprocessError) as e:print('deployment error: '+str(e),file=sys.stderr);sys.exit(1)
