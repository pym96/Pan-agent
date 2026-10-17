#!/usr/bin/env python3
"""Recompute counts/percentiles from raw receipts and committed DB records. No inferred missing metrics."""
import json,glob,pathlib,sys,math
root=pathlib.Path(sys.argv[1]);out=[]
def quantile(values,q):
 values=sorted(float(v) for v in values if v is not None)
 return values[math.ceil(q*len(values))-1] if values else None
for path in sorted(root.glob('load-cache*-shards*.json')):
 if any(x in path.stem for x in ['before','after','container-inspect','task-times','committed-events']):continue
 d=json.loads(path.read_text());prefix=path.with_suffix('');evpath=path.with_name(path.stem+'-committed-events.json');taskpath=path.with_name(path.stem+'-task-times.json')
 events=json.loads(evpath.read_text()) if evpath.exists() else None
 tasks=json.loads(taskpath.read_text()) if taskpath.exists() else None
 ids={}
 for e in events or []:ids.setdefault(e['session'],[]).append(e['id'])
 gaps=0;tails=0;event_clients=0
 for c in d['connections']:
  actual=set(c['ids']);last=max(actual,default=0);expected=ids.get(c.get('session'),[])
  gaps+=len([i for i in expected if i<=last and i not in actual]);tails+=len([i for i in expected if i>last]);event_clients+=bool(actual)
 samples=d['taskCompletionPollLatencyMs'];observed=d.get('taskRecords',[])
 offered_keys={(r['session'],r['key']) for r in observed};db_matching=[t for t in tasks or [] if (t['session'],t['key']) in offered_keys]
 acknowledged=sum(r.get('httpStatus')==202 for r in observed)
 metrics=d['metrics'];first=metrics[0] if metrics else {};last=metrics[-1] if metrics else {}
 def delta(k):return last[k]-first[k] if k in first and k in last else None
 row={'file':path.name,'requested':d['requested'],'established':d['established'],'healthy':d['healthyAtEnd'],'subscribedSessions':d['uniqueSubscribedSessions'],'holdSeconds':d['holdSeconds'],'offered':d['taskAttempts'],'httpAcknowledged':acknowledged,'clientObservedCompleted':len(samples),'dbAdmittedAtSnapshot':len(db_matching) if tasks is not None else None,'dbCompletedAtSnapshot':sum(t['status']=='completed' for t in db_matching) if tasks is not None else None,'dbStatusesAtSnapshot':{status:sum(t['status']==status for t in db_matching) for status in {t['status'] for t in db_matching}},'taskErrors':d['taskErrors'],'latencySampleCount':len(samples),'pollP50Ms':quantile(samples,.5),'pollP95Ms':quantile(samples,.95),'pollP99Ms':quantile(samples,.99),'dbQueueP95Ms':quantile([t['queue_ms'] for t in db_matching],.95),'dbFirstTextP95Ms':quantile([t['first_text_ms'] for t in db_matching],.95),'dbTotalP95Ms':quantile([t['total_ms'] for t in db_matching],.95),'clientsWithEvents':event_clients,'internalCommittedEventGaps':gaps if events is not None else None,'unobservedTailAtPostRunSnapshot':tails if events is not None else None,'duplicateIDs':d['duplicates'],'regressions':d['regressions'],'reconnects':sum(c['reconnects'] for c in d['connections']),'readPoolAcquisitionsSampleDelta':delta('readPoolAcquireCount'),'readPoolWaitNsSampleDelta':delta('readPoolAcquireDurationNs'),'poolAcquisitionsSampleDelta':delta('pgAcquireCount'),'poolWaitNsSampleDelta':delta('pgAcquireDurationNs'),'eventQueriesSampleDelta':delta('eventQueries'),'eventQueryNsSampleDelta':delta('eventQueryNs'),'tailCache':last.get('tailCache')}
 out.append(row)
print(json.dumps({'quantiles':'nearest rank ceil(q*n)-1; samples never padded; pool wait cumulative across callers, not wall time','delivery':'internal gaps only compare committed IDs <= each observed high-water mark; tail at postrun snapshot may include commits after disconnect, not automatically loss','runs':out},indent=2))
