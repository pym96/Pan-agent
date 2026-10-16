"""Harmless, zero-model integration on a disposable prep container, no verifier."""
import pathlib,json,subprocess,sys,uuid,hashlib
root=pathlib.Path(sys.argv[1]);project='demo56prep'+uuid.uuid4().hex[:8];out=root/'preparation'/project
image='alexgshaw/db-wal-recovery@sha256:0e33ea5ec823975d1bd6c3778395c9f94251dd88f571146057bff6adb7e4594e'
cfg={'output':str(out),'taskRoot':str(root/'task'),'image':image,'imageId':'sha256:0ff6d2977f94533d8a7a0cdc5a16efd42cb3ccfeb2f5684cdc8db0836b43b9e3','project':project,'remoteBoundFiles':[]}
proc=subprocess.Popen([str(root/'venv/bin/python'),str(root/'demo56/broker.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(root/'preparation/broker-test.stderr').open('w'),text=True)
def send(x):proc.stdin.write(json.dumps(x)+'\n');proc.stdin.flush();line=proc.stdout.readline();assert line, 'broker closed';return json.loads(line)
ready=send(cfg);assert ready['ready'];assert send({'id':1,'method':'begin'})['result']['started']
def tool(i,name,args):return send({'id':i,'method':'tool','tool':name,'arguments':args})
assert not tool(2,'write',{'path':'/app/demo56-offline.txt','content':'alpha'})['result']['isError']
assert not tool(3,'edit',{'path':'/app/demo56-offline.txt','edits':[{'oldText':'alpha','newText':'beta'}]})['result']['isError']
assert 'beta' in tool(4,'read',{'path':'/app/demo56-offline.txt'})['result']['content'][0]['text']
assert tool(5,'read',{'path':'/etc/passwd'})['result']['isError']
assert not tool(6,'bash',{'command':'touch /tmp/demo56-container-only; ln -s /etc/passwd /app/demo56-link','timeout':5})['result']['isError']
assert tool(7,'read',{'path':'/app/demo56-link'})['result']['isError']
assert not pathlib.Path('/tmp/demo56-container-only').exists()
assert tool(8,'bash',{'command':'sleep 4','timeout':.1})['result']['isError']
assert send({'id':9,'method':'unknown'})['error']
assert send({'id':10,'method':'stop'})['result']['closing'];proc.stdin.close();assert proc.wait(timeout=45)==0
assert json.loads((out/'stop.json').read_text())['confirmed']
left=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project],text=True).strip();assert not left
report={'passed':True,'mode':'preparation-only, no model or original verifier','project':project,'containerId':ready['containerId'],'toolsRoundtrip':4,'outsidePathDenied':True,'symlinkEscapeDenied':True,'timeoutReturnedError':True,'hostCanaryAbsent':True,'cleanupConfirmed':True,'residualContainers':0,'evidenceDirectory':str(out)}
(root/'preparation/broker-test.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
