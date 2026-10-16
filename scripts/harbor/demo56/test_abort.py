"""Preparation-only broker cancellation: no model, task solving or verifier."""
import subprocess,sys,pathlib,json,time,uuid,signal
r=pathlib.Path(sys.argv[1]);project='demo56abort'+uuid.uuid4().hex[:8];out=r/'preparation'/project
cfg={'output':str(out),'taskRoot':str(r/'task'),'image':'alexgshaw/db-wal-recovery@sha256:0e33ea5ec823975d1bd6c3778395c9f94251dd88f571146057bff6adb7e4594e','imageId':'sha256:0ff6d2977f94533d8a7a0cdc5a16efd42cb3ccfeb2f5684cdc8db0836b43b9e3','project':project,'remoteBoundFiles':[]}
p=subprocess.Popen([str(r/'venv/bin/python'),str(r/'demo56/broker.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(r/'preparation/abort.stderr').open('w'),text=True)
p.stdin.write(json.dumps(cfg)+'\n');p.stdin.flush();ready=json.loads(p.stdout.readline());assert ready['ready']
p.stdin.write(json.dumps({'id':1,'method':'begin'})+'\n');p.stdin.flush();assert json.loads(p.stdout.readline())['result']['started']
p.stdin.write(json.dumps({'id':2,'method':'tool','tool':'bash','arguments':{'command':'sleep 20','timeout':30}})+'\n');p.stdin.flush();time.sleep(.5);p.send_signal(signal.SIGTERM);p.stdin.close();p.wait(timeout=45)
assert json.loads((out/'stop.json').read_text())['confirmed'];left=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).strip();assert not left
report={'passed':True,'mode':'zero-model cancellation probe','project':project,'exitCode':p.returncode,'stopConfirmed':True,'residualContainers':0};(r/'preparation/abort-test.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
