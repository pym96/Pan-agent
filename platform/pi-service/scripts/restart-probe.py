#!/usr/bin/env python3
import urllib.request,json,time,uuid,subprocess
base='http://127.0.0.1:18142'
def req(path,body=None):
 r=urllib.request.Request(base+path,data=json.dumps(body).encode() if body else None,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(r,timeout=10) as x:return json.load(x)
def wait(path,predicate):
 for _ in range(200):
  try:
   v=req(path)
   if predicate(v):return v
  except Exception:pass
  time.sleep(.1)
 raise AssertionError(path)
name='restart-'+uuid.uuid4().hex[:12];path='/sessions/'+name+'/tasks'
first=req(path,{'key':'one','prompt':'SLOW_MODEL recovery probe'})
wait(path,lambda t:t[0]['status']=='running')
second=req(path,{'key':'two','prompt':'must not auto-execute after uncertainty'})
subprocess.run(['docker','kill','pan-pi-142-api-1'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['docker','start','pan-pi-142-api-1'],check=True,stdout=subprocess.DEVNULL)
after=wait(path,lambda t:len(t)==2 and t[0]['status']=='interrupted' and t[1]['status']=='cancelled')
time.sleep(8)
assert req(path)==after
# A completed old conversation survives restart, including its Pi-owned finalized context.
normal='history-'+uuid.uuid4().hex[:12];p='/sessions/'+normal+'/tasks';req(p,{'key':'one','prompt':'first'})
wait(p,lambda t:t[0]['status']=='completed')
subprocess.run(['docker','restart','pan-pi-142-api-1'],check=True,stdout=subprocess.DEVNULL)
wait(p,lambda t:t[0]['status']=='completed')
req(p,{'key':'two','prompt':'second'})
normalTasks=wait(p,lambda t:len(t)==2 and t[1]['status']=='completed')
print(json.dumps({'crashSession':name,'before':[first,second],'afterRestart':after,'stableAfter8s':True,'historySession':normal,'continuedAfterRestart':normalTasks},indent=2))
