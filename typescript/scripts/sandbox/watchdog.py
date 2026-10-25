"""Bounded CPU probe supervisor. Stops only exact token-labelled containers in this fresh evidence root."""
import argparse,json,pathlib,subprocess,time,signal,os,hashlib,shutil
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args();root=pathlib.Path(a.root)
root.mkdir(parents=True,exist_ok=False)
source=pathlib.Path('typescript');rows=[]
for path in sorted(source.rglob('*')):
 if path.is_file() and not any(x in path.parts for x in ['node_modules','dist','.git']):
  dest=root/'source'/path;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,dest);rows.append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(root/'source-manifest.json').write_text(json.dumps(rows,indent=2))
start=time.time();child=None;records=[];code=1
try:
 child=subprocess.Popen(a.command,start_new_session=True)
 try:code=child.wait(timeout=105)
 except subprocess.TimeoutExpired:
  records.append({'deadline':True});os.killpg(child.pid,signal.SIGKILL);child.wait();code=124
finally:
 if child and child.poll() is None:os.killpg(child.pid,signal.SIGKILL);child.wait()
 for statepath in root.rglob('state.json'):
  s=json.loads(statepath.read_text())
  for name in [s.get('containerId',s['name']),s.get('verifierId',s.get('verifierName'))]+[v.get('id',v['name']) for v in s.get('verifiers',[])]+[e['detail'].get('id') for e in s.get('events',[]) if e['kind']=='verifier_created']:
   if not name:continue
   found=subprocess.run(['docker','inspect',name],capture_output=True,text=True,timeout=2)
   if found.returncode:continue
   c=json.loads(found.stdout)[0];labels=c['Config'].get('Labels',{})
   if labels.get('pan.sandbox')!=s['token'] or labels.get('pan.run')!=s['runId']:raise RuntimeError('ownership mismatch')
   if c['State']['Running']:subprocess.run(['docker','stop','--time','1',c['Id']],check=True,timeout=3)
   after=json.loads(subprocess.check_output(['docker','inspect',c['Id']],timeout=2))[0]
   records.append({'id':c['Id'],'running':after['State']['Running'],'volume_preserved':s['volume']})
 (root/'watchdog-receipt.json').write_text(json.dumps({'started':start,'ended':time.time(),'exit_code':code,'resources':records},indent=2))
raise SystemExit(code)
