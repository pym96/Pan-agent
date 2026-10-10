import pathlib,os,json,subprocess
source=pathlib.Path(__file__).with_name('check112-faults.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check112-faults.py')),'exec'))
try:
 app=start('app');ready();a=client();login(a,'a');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 cid=conversation(a,bid);_,t=append(a,cid,'browser first');worker=start('worker',barrier=True);held=wait(t['id'],predicate=lambda t:any(e.get('type')=='fixture.waiting' for e in t['events']));oldowner=held['ownership']
 cid2=conversation(a,bid);_,t2=append(a,cid2,'browser second');coordinator=start('worker',barrier=True);held2=wait(t2['id'],predicate=lambda t:any(e.get('type')=='fixture.waiting' for e in t['events']));check(held2['ownership']['workerId']!=oldowner['workerId'],'distinct Worker processes claim independent conversations');check(task(t['id'])['state']=='running' and task(t['id'])['ownership']==oldowner,'second startup leaves healthy first owner intact')
 save('fixture.json',{'bundleId':bid,'tasks':[{'cid':cid,'tid':t['id']},{'cid':cid2,'tid':t2['id']}]});env['PREVIOUS_RESULT']=str(OUT/'fixture.json');subprocess.run(['node','scripts/browser112.mjs'],cwd=ROOT,env=env,check=True)
 before=[task(t['id']),task(t2['id'])];stop(worker);worker=None;stop(coordinator);coordinator=None;stop(app);app=start('app');ready();login(a,'a');check([task(t['id']),task(t2['id'])]==before,'API restart preserves exact histories');save('results.json',before);save('result.json',{'passed':True,'checks':checks})
finally:
 stop(worker);stop(coordinator);stop(app)
 for f in logs:f.close()
