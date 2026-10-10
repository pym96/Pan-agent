#!/usr/bin/env python3
"""Create 4x3 actual deterministic Faux/Pan/Docker states, two accounts, once."""
import pathlib,os,json
source=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
assert issue==113
env.update(WEB_CHECKPOINT_MODE='1',WEB_OPERATION_MODE='1',ANALYSIS_CPUS='1',ANALYSIS_MEMORY_GIB='1',WEB_CACHE='0')
w2=None;dataset=[]
try:
 app=start('app');ready();a=client();b=client();login(a,'a');login(b,'b');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes()
 for who,c in [('a',a),('b',b)]:
  bid=upload(c,source)
  for n in range(2):
   cid=conversation(c,bid)
   for step in range(3):
    s,v=append(c,cid,['first classification','ordered followup','ordered third'][step]);assert s==201;dataset.append({'who':who,'bundleId':bid,'conversationId':cid,'id':v['id']})
 save('seed.json',dataset);worker=start('worker');w2=start('worker')
 for d in dataset:
  c=a if d['who']=='a' else b;t=wait(d['id'],c);save(d['id']+'.json',t);check(t['state']=='completed','completed '+d['id']);csvcheck(c,d['id'],source,True)
 save('result.json',{'passed':True,'tasks':12,'checks':checks,'providerSends':0})
finally:
 stop(worker);stop(w2);stop(app)
 for f in logs:f.close()
