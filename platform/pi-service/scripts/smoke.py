#!/usr/bin/env python3
"""Actual HTTP + Pi synthetic model, no credentials. A fresh session namespace per invocation."""
import json,urllib.request,urllib.error,time,uuid,sys
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18142'
session='probe-'+uuid.uuid4().hex[:12]
def request(path,body=None):
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,e.read().decode()
path='/sessions/'+session+'/tasks'
status,first=request(path,{'key':'one','prompt':'hello'});assert status==202,(status,first)
status,duplicate=request(path,{'key':'one','prompt':'hello'});assert status==200 and first['id']==duplicate['id']
assert request(path,{'key':'one','prompt':'different'})[0]==409
for _ in range(200):
 tasks=request(path)[1]
 if tasks[0]['status']=='completed':break
 time.sleep(.05)
assert tasks[0]['status']=='completed',tasks
request(path,{'key':'two','prompt':'second turn'})
for _ in range(200):
 tasks=request(path)[1]
 if len(tasks)==2 and tasks[1]['status']=='completed':break
 time.sleep(.05)
assert len(tasks)==2 and tasks[1]['status']=='completed',tasks
# Read retained committed data until the second completion; close then replay using Last-Event-ID.
url=base+'/sessions/'+session+'/events'
ids=[];events=[]
with urllib.request.urlopen(url,timeout=10) as r:
 for raw in r:
  line=raw.decode().strip()
  if line.startswith('data: '):
   event=json.loads(line[6:]);ids.append(event['id']);events.append(event)
   if sum(x['kind']=='completed' for x in events)==2:break
assert ids==sorted(set(ids)),ids
results=[e for e in events if e['kind']=='result'];assert len(results)==2 and 'reply 2:' in results[1]['data']['text'],results
cursor=ids[len(ids)//2]
replayed=[]
with urllib.request.urlopen(urllib.request.Request(url,headers={'Last-Event-ID':str(cursor)}),timeout=10) as r:
 for raw in r:
  if raw.startswith(b'data: '):
   e=json.loads(raw[6:]);replayed.append(e['id'])
   if e['id']==ids[-1]:break
assert replayed==[i for i in ids if i>cursor],(ids,replayed)
fault='fault-'+uuid.uuid4().hex[:12];p='/sessions/'+fault+'/tasks';assert request(p,{'key':'fault','prompt':'FAIL_MODEL'})[0]==202
for _ in range(100):
 ft=request(p)[1]
 if ft[0]['status']=='interrupted':break
 time.sleep(.1)
assert ft[0]['status']=='interrupted',ft
assert request(p,{'key':'next','prompt':'hello'})[0]==429
print(json.dumps({'session':session,'tasks':tasks,'events':events,'replayIds':replayed,'faultSession':fault,'faultTasks':ft,'duplicateIdempotency':True,'conflictingKey409':True,'interruptedSessionBlocksNewWork':True,'model':'synthetic endpoint through actual Pi'},indent=2))
