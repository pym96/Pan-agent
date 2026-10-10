#!/usr/bin/env python3
import pathlib,os,json,time
source=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue==112
env.update(WEB_CHECKPOINT_MODE='1',WEB_OPERATION_MODE='1',ANALYSIS_CPUS='1',ANALYSIS_MEMORY_GIB='1')
w2=None
try:
 app=start('app');ready();a=client();login(a,'a');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 c1,c2=conversation(a,bid),conversation(a,bid)
 _,t1=append(a,c1,'first');_,t2=append(a,c2,'second');_,t3=append(a,c1,'followup')
 worker=start('worker');w2=start('worker')
 one,two,three=wait(t1['id']),wait(t2['id']),wait(t3['id'])
 for i,t in enumerate([one,two,three]):save(str(i)+'.json',t);check(t['state']=='completed','task completed '+str(i));csvcheck(a,t['id'],source,True)
 check(len(json.loads(three['contextText'])['turns'])==1,'followup original context')
 save('result.json',{'passed':True,'checks':checks})
finally:
 stop(worker);stop(w2);stop(app)
 for f in logs:f.close()
