#!/usr/bin/env python3
"""Two actual overlapping Docker executions, independent Workers, same-conversation order."""
import pathlib,os,json,subprocess
src=pathlib.Path(__file__).with_name('check112-faults.py').read_text();exec(compile(src.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check112-faults.py')),'exec'))
try:
 app=start('app');ready();a=client();login(a,'a');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source)
 first=conversation(a,bid);other=conversation(a,bid);_,one=append(a,first,'overlap A');_,two=append(a,other,'overlap B');_,later=append(a,first,'same conversation later')
 env['WEB_TOOL_BARRIER']=one['id']+','+two['id'];worker=start('worker');coordinator=start('worker')
 for t in [one,two]:exists(R/'tasks'/t['id']/'output/tool-ready')
 both=[task(one['id']),task(two['id'])];check(both[0]['ownership']['workerId']!=both[1]['ownership']['workerId'],'distinct process owners')
 containers=[]
 for t in [one,two]:
  c=json.loads(subprocess.check_output(['docker','inspect',f'web{issue}-'+t['id']],env=env))[0];containers.append(c);check(c['State']['Running'],'actual analysis container running');check(c['HostConfig']['NanoCpus']==1000000000 and c['HostConfig']['Memory']==1073741824 and c['HostConfig']['NetworkMode']=='none','1 CPU / 1 GiB / offline per container')
 check(task(later['id'])['state']=='queued' and not task(later['id'])['events'],'same conversation has no premature execution');save('overlap.json',{'tasks':both,'containers':containers})
 # Release both independently observed live containers.
 for t in [one,two]:(R/'tasks'/t['id']/'output/tool-release').write_text('release actual overlapping containers')
 # The deliberate tool barrier is a protocol fixture, so these two may fail analysis;
 # they must settle without replay, and their dependent question must not invent success.
 terminal=[wait(one['id']),wait(two['id']),wait(later['id'])];save('terminal.json',terminal)
 check(all(t['state'] not in ['queued','running','cancelling'] for t in terminal),'both executions and ordered successor reach terminal state')
 check(terminal[2]['state']=='blocked' and not terminal[2]['events'],'failed fixture predecessor blocks successor without a new effect')
 save('result.json',{'passed':True,'checks':checks,'providerCalls':0,'note':'tool barrier intentionally emits no analysis result; terminal failures retained, successful real analyses covered separately'})
finally:
 stop(worker);stop(coordinator);stop(app)
 for f in logs:f.close()
