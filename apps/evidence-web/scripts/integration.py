#!/usr/bin/env python3
"""Real HTTP/PostgreSQL/browser + app/database restart checks, against own test cluster."""
import os,json,pathlib,subprocess,time,urllib.request,urllib.error,http.cookiejar,hashlib,uuid,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ['EVIDENCE_DIR']);OUT.mkdir(parents=True,exist_ok=True)
ORIGIN=os.environ.get('APP_ORIGIN','http://127.0.0.1:8106');binary=os.environ['APP_BINARY']
checks=[];process=None;log=(OUT/'server.log').open('a')
def client():return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(c,path,data=None,headers=None):
 h={'Origin':ORIGIN};h.update(headers or {});req=urllib.request.Request(ORIGIN+path,data=data,headers=h)
 try:
  with c.open(req,timeout=20) as r:return r.status,r.read(),dict(r.headers)
 except urllib.error.HTTPError as e:return e.code,e.read(),dict(e.headers)
def expect(ok,name):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def login(c,who):
 s,b,_=request(c,'/api/login',json.dumps({'email':who+'@web106.test','password':os.environ['ACCOUNT_'+who.upper()+'_PASSWORD']}).encode(),{'Content-Type':'application/json'});assert s==200,(s,b)
def start():
 global process
 process=subprocess.Popen([binary],cwd=ROOT,stdout=log,stderr=log,env=os.environ.copy())
 for _ in range(100):
  if process.poll() is not None:raise RuntimeError('application exited; see server.log')
  try:
   if request(client(),'/')[0]==200:return
  except OSError:pass
  time.sleep(.1)
 raise RuntimeError('startup timeout')
def stop():
 global process
 if process is not None:
  process.terminate();process.wait(timeout=15);process=None
def multipart(files):
 boundary='web106-'+uuid.uuid4().hex;parts=[]
 for name,data in files:
  parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="files"; filename="'+name+'"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+data+b'\r\n')
 return b''.join(parts)+('--'+boundary+'--\r\n').encode(),{'Content-Type':'multipart/form-data; boundary='+boundary}
def upload(c,manifest,files):return request(c,'/api/bundles',*multipart([('manifest.json',manifest)]+list(files.items())))
source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes()
sha=lambda b:hashlib.sha256(b).hexdigest()
def manifest(files,title='API import'):
 return json.dumps({'version':1,'title':title,'summary':'summary.json','files':{n:sha(b) for n,b in files.items()}}).encode()
try:
 start();a,b,anon=client(),client(),client();login(a,'a');login(b,'b')
 files={'summary.json':source,'notes.txt':b'<script>alert("raw text")</script>','unsupported.bin':b'\xff\x00','invalid.jsonl':b'{broken'}
 s,raw,_=upload(a,manifest(files),files);expect(s==201,'valid transactional import with optional warnings');bid=json.loads(raw)['id']
 s,raw,_=request(a,'/api/bundles/'+bid);detail=json.loads(raw);o=detail['overview']
 expect(o['counts']=={'success':18,'valid_failure':5,'unscored':20,'unknown_interrupted':20,'not_started':26} and o['total']==89 and o['validScored']==23,'exact top-level classification counts')
 expect(o['usage']=={'known':1,'unknown':1,'input':470,'output':161} and 'segment7Final' in o['usageScope'],'segment7 usage scope')
 expect(o['rows'][0]['validScore'] is None and len(o['warnings'])==2,'nulls and optional warnings preserved')
 for f in detail['files']:
  s,data,headers=request(a,f'/api/bundles/{bid}/files/'+f['name']);expected=manifest(files) if f['name']=='manifest.json' else files[f['name']]
  expect(s==200 and data==expected and sha(data)==f['sha256'],'exact immutable download '+f['name'])
 for row in o['rows']:
  import urllib.parse
  s,data,_=request(a,f'/api/bundles/{bid}/files/summary.json?pointer='+urllib.parse.quote(row['source']['pointer'],safe=''))
  v=json.loads(data);assert s==200 and v['value']==json.loads(source)['classifications'][int(row['source']['pointer'].split('/')[-1])]
 expect(True,'all89 JSON pointers resolve to immutable rows')
 s,data,_=request(a,f'/api/bundles/{bid}/files/summary.json?pointer=/segment7Final/tasks/0/accounting/usage');expect(json.loads(data)['value']['input']==470,'usage source pointer')
 for who,c in [('B',b),('anonymous',anon)]:
  for path in [f'/api/bundles/{bid}',f'/api/bundles/{bid}/files/summary.json',f'/api/bundles/{bid}/files/summary.json?pointer=/classifications/0',f'/api/bundles/{bid}/files/notes.txt?preview=1']:
   s,_,_=request(c,path);expect(s in [401,403,404],who+' denied '+path.split(bid)[-1])
 expect(all(x['id']!=bid for x in json.loads(request(b,'/api/bundles')[1])),'B cannot list A bundles')
 s,raw,_=upload(b,manifest({'summary.json':source},'B own report'),{'summary.json':source});expect(s==201,'B imports its own bundle');bid_b=json.loads(raw)['id']
 expect(request(b,'/api/bundles/'+bid_b)[0]==200 and request(a,'/api/bundles/'+bid_b)[0]==404,'B ownership readable only by B')
 bad=client();status,raw,_=request(bad,'/api/login',json.dumps({'email':'a@web106.test','password':'wrong-password'}).encode(),{'Content-Type':'application/json'});expect(status==401 and os.environ['ACCOUNT_A_PASSWORD'].encode() not in raw,'wrong password denied without secret reflection')
 before=len(json.loads(request(a,'/api/bundles')[1]))
 cases=[('bad summary JSON',manifest({'summary.json':b'{'}),{'summary.json':b'{'}),('missing summary',manifest({'summary.json':source}),{}),('hash mismatch',manifest({'summary.json':source}),{'summary.json':source+b' '}),('bad manifest JSON',b'{',{'summary.json':source}),('path traversal',manifest({'summary.json':source,'../escape.txt':b'x'}),{'summary.json':source,'../escape.txt':b'x'}),('duplicate JSON key',b'{"version":1,"version":2}',{'summary.json':source})]
 for name,m,f in cases:
  s,raw,_=upload(a,m,f);expect(s==400 and 'error' in json.loads(raw),name+' rejected')
 expect(len(json.loads(request(a,'/api/bundles')[1]))==before,'invalid imports leave no bundle')
 body,headers=multipart([('manifest.json',manifest({'summary.json':source})),('summary.json',source)]);headers['Origin']='https://foreign.invalid'
 expect(request(a,'/api/bundles',body,headers)[0]==403,'cross-origin mutation rejected')
 # Browser uploads a second bundle and checks real controls + XSS rendering.
 subprocess.run(['node','scripts/browser-test.mjs'],cwd=ROOT,env=os.environ.copy(),check=True,stdout=(OUT/'browser.log').open('w'),stderr=subprocess.STDOUT)
 checks.append('real browser flow passed')
 stop()
 # Optional own-cluster restart; never accept a shared/unscoped cluster directory.
 if os.environ.get('TEST_PGDATA'):
  pgdata=pathlib.Path(os.environ['TEST_PGDATA']).resolve();own=pathlib.Path(os.environ['TEST_RUNTIME_ROOT']).resolve();assert pgdata.parent==own and pgdata.name=='pgdata'
  pgctl=os.environ['PG_CTL'];subprocess.run([pgctl,'-D',str(pgdata),'-m','fast','stop'],check=True,stdout=log,stderr=log);subprocess.run([pgctl,'-D',str(pgdata),'-l',str(own/'postgres.log'),'start'],check=True,stdout=log,stderr=log)
 start();fresh=client();login(fresh,'a');s,raw,_=request(fresh,'/api/bundles/'+bid)
 expect(s==200 and json.loads(raw)==detail,'app/database restart retains bundle owner, overview and file hashes')
 s,data,_=request(fresh,f'/api/bundles/{bid}/files/summary.json');expect(data==source,'restart retains exact source bytes')
 freshb=client();login(freshb,'b');expect(request(freshb,'/api/bundles/'+bid)[0]==404,'restart retains account isolation')
 env=os.environ.copy();env['CHECK_BUNDLE_ID']=bid;subprocess.run(['node','scripts/browser-test.mjs'],cwd=ROOT,env=env,check=True,stdout=(OUT/'browser-after-restart.log').open('w'),stderr=subprocess.STDOUT)
 checks.append('real browser reads persisted bundle after app/database restart')
 (OUT/'integration.json').write_text(json.dumps({'passed':True,'checks':checks,'bundle':bid,'sourceSHA256':sha(source),'realModelCalls':0,'databaseRestart':bool(os.environ.get('TEST_PGDATA'))},indent=2))
finally:
 stop();log.close()
