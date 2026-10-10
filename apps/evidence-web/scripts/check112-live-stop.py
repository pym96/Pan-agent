#!/usr/bin/env python3
"""An expired owner with an actually running Docker process retains its slot."""
import pathlib,os,json,time,signal,subprocess
src=pathlib.Path(__file__).with_name('check112-faults.py').read_text();exec(compile(src.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check112-faults.py')),'exec'))
marker=None
try:
 app=start('app');ready();a=client();login(a,'a');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid=conversation(a,bid);_,t=append(a,cid,'owned live container');tid=t['id'];env['WEB_TOOL_BARRIER']=tid;worker=start('worker');exists(R/'tasks'/tid/'output/tool-ready');held=task(tid);save('live.json',held);name='web112-'+tid
 inspect=lambda:json.loads(subprocess.check_output(['docker','inspect',name],env=env))[0]
 check(inspect()['State']['Running'],'old container actually running');save('running-container.json',inspect())
 marker=R/'tasks'/tid/'stop-unconfirmed';marker.write_text('owned controlled stop uncertainty; preserve slot')
 os.kill(worker.pid,signal.SIGSTOP);time.sleep(11);revoked=task(tid);check(revoked['state']=='interrupted' and not revoked['cleanupConfirmed'],'lease expiration retains stop uncertainty');check(inspect()['State']['Running'],'expiration does not imply container stopped')
 other=conversation(a,bid);_,nextTask=append(a,other,'independent after stop');env['WEB_TOOL_BARRIER']='';coordinator=start('worker');os.kill(worker.pid,signal.SIGCONT);worker.wait(timeout=40);worker=None
 time.sleep(3);check(task(nextTask['id'])['state']=='queued' and not admissions(nextTask['id']),'unconfirmed old execution blocks new claims');check(inspect()['State']['Running'],'live old container retained in occupied slot');save('before-stop.json',{'old':task(tid),'next':task(nextTask['id']),'container':inspect()})
 marker.rename(OUT/'stop-unconfirmed-original.txt');marker=None
 old=until(lambda:(v if (v:=task(tid))['cleanupConfirmed'] else None));check(subprocess.check_output(['docker','ps','-aq','--filter','name=^/'+name+'$'],env=env).strip()==b'','exact old container absent before slot release');check(resume(cid,tid,old['recovery']['checkpointId'])[0]==409,'unreceipted live effect remains unresolved after stop')
 done=wait(nextTask['id']);check(done['state']=='completed','independent conversation proceeds after verified stop');save('after-stop.json',{'old':task(tid),'next':done});save('result.json',{'passed':True,'checks':checks,'providerSends':0})
finally:
 if worker and worker.poll() is None:os.kill(worker.pid,signal.SIGCONT)
 stop(worker);stop(coordinator);stop(app)
 for f in logs:f.close()
