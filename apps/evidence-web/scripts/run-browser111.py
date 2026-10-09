import pathlib,os,json,subprocess
source=pathlib.Path(__file__).with_name('check111.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check111.py')),'exec'))
sentinel=None;sentinelName=None
try:
 app=start('app');ready();a=client();login(a,'a');source=(ROOT.parents[1]/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes();bid=upload(a,source);cid=conversation(a,bid);_,q=append(a,cid,'browser confirmed recovery');sentinel=subprocess.Popen(['sleep','300']);sentinelName='web111-control-'+uuid.uuid4().hex[:12];subprocess.run(['docker','run','-d','--name',sentinelName,'--label','pan.issue=web111-control','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','16','--cpus','.1','--memory','32m',env['PAN_IMAGE'],'python','-c','import time; time.sleep(300)'],env=env,check=True,stdout=subprocess.DEVNULL);env['WEB_OPERATION_FAULT']='after-receipt';worker=start('worker');kill(q['id']);save('fixture.json',{'bundleId':bid,'conversationId':cid,'taskId':q['id']});env['PREVIOUS_RESULT']=str(OUT/'fixture.json');env['WEB_OPERATION_FAULT']='';worker=start('worker');subprocess.run(['node','scripts/browser111.mjs'],cwd=ROOT,env=env,check=True);check(sentinel.poll() is None and subprocess.check_output(['docker','inspect','--format','{{.State.Running}}',sentinelName],env=env).strip()==b'true','unrelated owned process/container preserved through actual resume');save('sentinel.json',{'passed':True,'pid':sentinel.pid,'container':sentinelName})
finally:
 stop(worker);stop(app)
 if sentinel:sentinel.terminate();sentinel.wait()
 if sentinelName:subprocess.run(['docker','rm','-f',sentinelName],env=env,check=True,stdout=subprocess.DEVNULL)
 for f in logs:f.close()
