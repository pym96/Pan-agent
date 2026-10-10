#!/usr/bin/env python3
"""Only reads preserved raw records, independent of the running application."""
import json,math,sys,pathlib,datetime
root=pathlib.Path(sys.argv[1]);rounds=json.loads((root/'rounds.json').read_text());out=[]
def stamp(s):
 base,frac=s.rstrip('Z').split('.');return int(datetime.datetime.fromisoformat(base).replace(tzinfo=datetime.timezone.utc).timestamp())*10**9+int(frac.ljust(9,'0'))
def percentile(xs,p):return sorted(xs)[math.ceil(len(xs)*p)-1] if xs else None
for r in rounds:
 ts=r['tasks'];assert len(ts)==12
 completed=sum(t.get('state')=='completed' for t in ts);duration=(r['lastObservationNs']-min(t['submittedNs'] for t in ts))/1e9
 delays=[(t['firstAdmissionNs']-t['submittedNs'])/1e9 for t in ts if t.get('firstAdmissionNs') is not None]
 actual=[];known=unknown=tokens=tools=0
 for t in ts:
  v=json.loads((root/(str(r['workers'])+'-'+t['id']+'.json')).read_text());assert len(v['recovery']['attempts'])==1 and v['ownership']['generation']==1;assert len(json.loads(v['contextText'])['turns'])==v['sequence']-1;a=v['recovery']['accounting'];known+=a['known'];unknown+=a['unknown'];tokens+=a['totalTokens'];tools+=a['observedToolExecutions']
  # Docker's own StartedAt/FinishedAt describe actual execution, not task status.
  spans=[e for e in v['events'] if e.get('type')=='sandbox.execution']
  for e in spans:actual.append({'task':t['id'],'conversation':t['conversationId'],**e})
 overlap=[]
 for i,a in enumerate(actual):
  for b in actual[i+1:]:
   seconds=min(stamp(a['finishedAt']),stamp(b['finishedAt']))-max(stamp(a['startedAt']),stamp(b['startedAt']))
   if seconds>0:
    assert a['conversation']!=b['conversation'],'same conversation overlaps'
    overlap.append({'tasks':[a['task'],b['task']],'seconds':seconds/1e9})
 out.append({'workers':r['workers'],'completed':completed,'denominator':12,'completionRate':completed/12,'durationSeconds':duration,'throughputTasksPerSecond':completed/duration,'queueSamples':len(delays),'queueP50Seconds':percentile(delays,.5),'queueP95Seconds':percentile(delays,.95),'neverAdmitted':[t['id'] for t in ts if t.get('firstAdmissionNs') is None],'unfinished':r['unfinished'],'failures':[t for t in ts if t.get('state')!='completed'],'knownSyntheticExchanges':known,'unknownExchanges':unknown,'syntheticTokens':tokens,'observedToolExecutions':tools,'actualOverlap':overlap,'maxConcurrentAnalysisCpu':r['workers'],'maxConcurrentAnalysisMemoryGiB':r['workers']})
print(json.dumps(out,ensure_ascii=False,indent=2))
