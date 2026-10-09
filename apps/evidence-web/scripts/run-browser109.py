import os,json,pathlib,subprocess,time
root=pathlib.Path(__file__).resolve().parents[1];r=pathlib.Path(os.environ['WEB108_RUNTIME']);env=os.environ.copy();env.update(json.loads((r/'config.json').read_text()));env.update({'WEB_ISSUE':os.environ.get('WEB_ISSUE','web109'),'WEB_FAUX_BARRIER':'1','WEB_DIR':str(root/'web/dist'),'WEB107_TASK_ROOT':str(r/'tasks'),'WEB107_EXECUTOR':str(root/'executor/main.mjs'),'PAN_ENTRY':str(r.parent/'pan-source/dist/index.js'),'DOCKER_HOST':'unix://'+str(pathlib.Path.home()/'.docker/run/docker.sock'),'DOCKER_CONFIG':str(r/'empty-docker')});out=pathlib.Path(env['EVIDENCE_DIR']);out.mkdir(parents=True,exist_ok=True)
with (out/'services.log').open('w') as f:
 app=subprocess.Popen([str(r/'evidence-web')],env=env,cwd=root,stdout=f,stderr=f);worker=subprocess.Popen([str(r/'evidence-web'),'worker'],env=env,cwd=root,stdout=f,stderr=f)
 try:
  time.sleep(.6);subprocess.run(['node','scripts/browser109.mjs'],env=env,cwd=root,check=True)
 finally:
  for p in [worker,app]:
   if p.poll() is None:p.terminate();p.wait(timeout=15)
