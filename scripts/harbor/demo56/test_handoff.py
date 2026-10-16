"""Zero-model lifecycle probe. Original verifier runs on unrecovered fixture, never a task attempt claim."""
import pathlib,json,subprocess,sys,uuid,time
root=pathlib.Path(sys.argv[1]);project='demo56handoff'+uuid.uuid4().hex[:8];out=root/'preparation'/project
cfg={'output':str(out),'taskRoot':str(root/'task'),'image':'alexgshaw/db-wal-recovery@sha256:0e33ea5ec823975d1bd6c3778395c9f94251dd88f571146057bff6adb7e4594e','imageId':'sha256:0ff6d2977f94533d8a7a0cdc5a16efd42cb3ccfeb2f5684cdc8db0836b43b9e3','project':project,'remoteBoundFiles':[],'verifierProxyPort':17890}
p=subprocess.Popen([str(root/'venv/bin/python'),str(root/'demo56/broker.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(root/'preparation/handoff.stderr').open('w'),text=True)
def send(x):p.stdin.write(json.dumps(x)+'\n');p.stdin.flush();line=p.stdout.readline();assert line,'broker closed';return json.loads(line)
r=send(cfg);assert r['ready'];assert send({'id':1,'method':'begin'})['result']['started']
r=send({'id':2,'method':'tool','tool':'bash','arguments':{'command':'echo retained > /app/offline-marker; sleep 3; touch /app/late-write','timeout':.2}});assert r['result']['isError']
r=send({'id':3,'method':'agent_stop','reason':'offline_simulated_agent_timeout'});assert r['result']['confirmed'] and r['result']['containerRetained']
assert send({'id':4,'method':'tool','tool':'bash','arguments':{'command':'touch /app/after-stop'}})['error']
cid=json.loads((out/'container-inspect.json').read_text())['Id']
subprocess.run(['docker','exec',cid,'bash','-c','test "$(cat /app/offline-marker)" = retained && test ! -e /app/late-write && test ! -e /app/after-stop'],check=True)
r=send({'id':5,'method':'verify'});assert 'result' in r,r
v=r['result'];assert v['result']['rewards']['reward']==0,v
assert send({'id':6,'method':'verify'})['error'];p.stdin.close();assert p.wait(timeout=45)==0
assert json.loads((out/'stop.json').read_text())['confirmed']
assert not subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).strip()
events=[json.loads(l)['type'] for l in (out/'lifecycle.jsonl').read_text().splitlines()];assert events.count('verifier_start')==1;assert events.index('agent_stop_confirmed')<events.index('verifier_start')<events.index('container_stopped')
report={'passed':True,'mode':'zero-model original-verifier negative probe, unrecovered original fixture','project':project,'reward':0,'lateWriteAbsent':True,'stateRetained':True,'postStopDispatchRejected':True,'verifierExactlyOnce':True,'cleanupConfirmed':True,'evidenceDirectory':str(out)}
(root/'preparation/handoff-test.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
