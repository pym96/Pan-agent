#!/usr/bin/env python3
"""Freeze inputs, then exactly one 200-query round per configuration. No retries."""
import pathlib,os,json,time,hashlib,math,platform,subprocess,concurrent.futures,urllib.request,urllib.error,http.cookiejar,threading,re
ROOT=pathlib.Path(__file__).resolve().parents[1];R=pathlib.Path(os.environ['WEB108_RUNTIME']);OUT=pathlib.Path(os.environ['EVIDENCE_DIR']);OUT.mkdir(parents=True,exist_ok=False)
assert json.loads((R/'web113-owner.json').read_text())['issue']==113
cfg=json.loads((R/'config.json').read_text());origin=cfg['APP_ORIGIN'];redis=R.parent/'redis-7.2.5/src/redis-cli';server=R.parent/'redis-7.2.5/src/redis-server'
seed=json.loads(pathlib.Path(os.environ['WEB113_SEED']).read_text());logs=[];app=None
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(n,v):(OUT/n).write_text(json.dumps(v,ensure_ascii=False,indent=2))
def rc(*args):return subprocess.check_output([str(redis),'-p','63113',*args],text=True)
def start(mode):
 global app
 env={**os.environ,**cfg,'WEB_ISSUE':'web113','WEB_DIR':str(ROOT/'web/dist'),'WEB_CACHE':'0' if mode=='off' else '1','WEB_REDIS_ADDR':'127.0.0.1:63113','WEB_CACHE_NAMESPACE':'web113-experiment'}
 f=(OUT/(mode+'-api.log')).open('w');logs.append(f);app=subprocess.Popen([str(R/'evidence-web')],env=env,cwd=ROOT,stdout=f,stderr=f)
 for _ in range(100):
  try:
   urllib.request.urlopen(origin,timeout=1).close();return
  except OSError:time.sleep(.05)
 raise RuntimeError('API not ready')
def stop():
 global app
 if app and app.poll() is None:app.terminate();app.wait(timeout=15)
 app=None
clients=[]
def query(item,phase,index):
 who,path=item
 # Cookie is immutable within experiment; fresh opener avoids shared mutable jars.
 opener=urllib.request.build_opener();r=urllib.request.Request(origin+path,headers={'Cookie':cookies[who]});begin=time.monotonic_ns();status=None;body=b'';headers={};error=None
 try:
  with opener.open(r,timeout=5) as x:status=x.status;headers=dict(x.headers);body=x.read()
 except urllib.error.HTTPError as e:status=e.code;headers=dict(e.headers);body=e.read()
 except Exception as e:error=type(e).__name__
 end=time.monotonic_ns();return {'index':index,'phase':phase,'who':who,'path':path,'startNs':begin,'endNs':end,'latencyNs':end-begin,'status':status,'error':error,'cache':headers.get('X-View-Cache'),'ageMs':headers.get('X-View-Age-Ms'),'bodySHA256':hashlib.sha256(body).hexdigest()}
def login(who):
 jar=http.cookiejar.CookieJar();c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));r=urllib.request.Request(origin+'/api/login',data=json.dumps({'email':who+'@web106.test','password':cfg['ACCOUNT_'+who.upper()+'_PASSWORD']}).encode(),headers={'Origin':origin,'Content-Type':'application/json'})
 with c.open(r) as x:assert x.status==200
 return '; '.join(v.name+'='+v.value for v in jar)
unique=[]
for who in ['a','b']:
 tasks=[d for d in seed if d['who']==who];unique.append([who,'/api/bundles/'+tasks[0]['bundleId']+'/tasks']);unique.extend([[who,'/api/tasks/'+d['id']] for d in tasks])
sequence=[unique[i%len(unique)] for i in range(200)]
manifest={'version':1,'baseSHA':'b2e0f6ecff00f97eb05c5c115b7115636ac07ddb','utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceFiles':{str(p.relative_to(ROOT)):sha(p) for p in sorted(ROOT.rglob('*')) if p.is_file() and not any(x in p.parts for x in ['node_modules','dist','.git'])},'binarySHA256':sha(R/'evidence-web'),'packageSHA256':sha(R.parent/'pan-agent-0.1.0.tgz'),'redisTarSHA256':sha(R.parent/'redis-7.2.5.tar.gz'),'redisBinarySHA256':sha(R.parent/'redis-7.2.5/src/redis-server'),'redisVersion':subprocess.check_output([str(server),'--version'],text=True).strip(),'redisConfig':(R.parent/'redis/redis.conf').read_text(),'inputSHA256':sha(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json'),'dataset':seed,'sequence':sequence,'clients':8,'queriesPerRound':200,'rounds':['off','cold','warm','outage'],'warmup':unique,'ttlMs':5000,'redisTimeoutMs':100,'projectionTimeoutMs':2000,'projectionSlots':4,'apiPoolMax':8,'workerPoolMax':4,'pgServerMaxConnections':16,'requestTimeoutSeconds':30,'authTimeoutSeconds':2,'ownershipTimeoutSeconds':2,'clock':'client time.monotonic_ns; API process-local Go monotonic + wall drift guard; no reuse across API epoch','hardware':subprocess.check_output(['sysctl','hw.ncpu','hw.memsize'],text=True),'host':platform.platform(),'providerCalls':0,'codingTokens':'unknown'}
with (OUT/'manifest.json').open('x') as f:json.dump(manifest,f,ensure_ascii=False,indent=2)
allrecords=[]
try:
 for mode in manifest['rounds']:
  if mode=='outage':rc('SHUTDOWN','NOSAVE')
  start(mode);cookies={who:login(who) for who in ['a','b']}
  if mode=='warm':
   pre=[query(item,'warmup',i) for i,item in enumerate(unique)];save('warmup.json',pre)
  # Log byte boundary excludes login/warmup costs from the 200-query round;
  # original log retains them and separate warmup counters are reported.
  logs[-1].flush();offset=(OUT/(mode+'-api.log')).stat().st_size
  redisBefore=None if mode=='outage' else rc('INFO','stats');save(mode+'-redis-before.json',redisBefore)
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:records=list(pool.map(lambda p:query(p[1],mode,p[0]),enumerate(sequence)))
  allrecords.extend(records);save(mode+'-requests.json',records)
  stop();log=(OUT/(mode+'-api.log')).read_bytes();save(mode+'-log-boundary.json',{'offset':offset,'end':len(log)})
  if mode!='outage':save(mode+'-redis-after.json',rc('INFO','stats'))
  save('progress.json',{'completed':mode,'queries':len(allrecords)})
finally:
 stop()
 for f in logs:f.close()
 # Restore only the dedicated Redis; no shared flush or process discovery.
 subprocess.run([str(server),str(R.parent/'redis/redis.conf')],check=True)
