#!/usr/bin/env python3
"""Late completed artifacts survive unconfirmed stop and stop-only recovery."""
import pathlib
p=pathlib.Path(__file__).with_name('check109.py');exec(compile(p.read_text().split('\ntry:\n app=start')[0],str(p),'exec'))
try:
 app=start('app');ready();a=client();login(a,'a');bid=json.loads(pathlib.Path(os.environ['PREVIOUS_RESULT']).read_text())['bundleId'];cid=conversation(a,bid);_,t=append(a,cid,'retained late result');worker=start('worker',result=True)
 wait(t['id'],predicate=lambda t:any(e.get('type')=='fixture.result_waiting' for e in t['events']));marker(t['id'],'stop-unconfirmed');s,response=control(a,cid,t['id'],'replace','retained-replace','new result');new=response['replacementId']
 c1=control(a,cid,t['id'],'cancel','repeat-cancel');c2=control(a,cid,t['id'],'cancel','repeat-cancel');check(c1==c2 and c1[1]['decision']=='cancelling','repeat cancelling request idempotent');marker(t['id'],'result-release');worker.wait(timeout=30);worker=None;pending=task(t['id']);check(pending['state']=='cancelling' and pending['attemptResult']['result']['status']=='completed' and pending['result'] is None,'late known attempt retained during unknown stop');check(req(a,f'/api/tasks/{t["id"]}/files/details.csv')[0]==404,'unconfirmed artifact not downloadable');save('unconfirmed.json',pending)
 (R/'tasks'/t['id']/'stop-unconfirmed').unlink();worker=start('worker');complete=wait(new);old=task(t['id']);check(complete['state']=='completed' and old['state']=='cancelled','new task after stop-only recovery');raw=csvcheck(a,t['id'],(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes());check(old['attemptResult']['result']['usage']['status']=='reported' and len(raw)>0,'old CSV and known usage accessible after recovery');check(control(a,cid,t['id'],'cancel','repeat-terminal')==control(a,cid,t['id'],'cancel','repeat-terminal'),'repeat terminal cancel idempotent');save('recovered.json',old);save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
