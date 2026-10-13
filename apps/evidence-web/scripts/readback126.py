"""Read existing completed tasks only; never creates a model task."""
import argparse,pathlib,json,urllib.request,urllib.error,http.cookiejar,hashlib
p=argparse.ArgumentParser();p.add_argument('--mirror',required=True);p.add_argument('--journey',required=True);p.add_argument('--out',required=True);p.add_argument('--compare');a=p.parse_args()
c=json.loads((pathlib.Path(a.mirror)/'config.json').read_text());j=json.loads((pathlib.Path(a.journey)/'journey.json').read_text());assert j['completed']
out=pathlib.Path(a.out);out.mkdir(exist_ok=False);origin=f"http://127.0.0.1:{c['httpPort']}"
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(path,body=None):
 r=urllib.request.Request(origin+'/api'+path,data=None if body is None else json.dumps(body).encode(),headers={'Origin':origin,'Content-Type':'application/json'})
 with client.open(r,timeout=15) as response:assert response.status==200;return response.read()
req('/login',c['accounts']['a']);result={}
for t in j['tasks']:
 tid=t['id'];v=json.loads(req('/tasks/'+tid));assert v['state']=='completed' and v['cleanupConfirmed']
 for name in ['analysis.json','details.csv']:
  raw=req('/tasks/'+tid+'/files/'+name);assert hashlib.sha256(raw).hexdigest()==v['result']['artifacts'][name]['sha256'];(out/(tid+'-'+name)).write_bytes(raw)
 result[tid]={k:v[k] for k in ['id','state','result','contextText','contextSHA256','cleanupConfirmed','events']}
result['history']=json.loads(req('/conversations/'+j['conversationId']))
if a.compare:assert result==json.loads(pathlib.Path(a.compare).read_text()),'persisted records changed'
(out/'records.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
(out/'checks.json').write_text(json.dumps({'completedTasks':len(j['tasks']),'artifactsHashMatched':True,'recordsEqual':bool(a.compare),'newTaskSubmissions':0}))
print('readback passed; no submissions')
