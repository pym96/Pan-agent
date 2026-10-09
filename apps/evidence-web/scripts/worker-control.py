#!/usr/bin/env python3
"""Start/stop only this web107 runtime's single worker. Requires explicit operator config."""
import argparse,json,os,pathlib,subprocess,signal,time
p=argparse.ArgumentParser();p.add_argument('command',choices=['configure','start','stop']);p.add_argument('--runtime',required=True);p.add_argument('--pan-entry');p.add_argument('--image');a=p.parse_args()
r=pathlib.Path(a.runtime).resolve();root=pathlib.Path(__file__).resolve().parents[1]
issue=109 if (r/'web109-owner.json').exists() else 108 if (r/'web108-owner.json').exists() else 107
if json.loads((r/f'web{issue}-owner.json').read_text())!={'issue':issue,'runtime':str(r)}:raise SystemExit('not an owned runtime')
config=r/'worker.json';pidfile=r/'worker.pid'
if a.command=='configure':
 if not a.pan_entry or not a.image:raise SystemExit('--pan-entry and --image required')
 pan=pathlib.Path(a.pan_entry).resolve();assert pan.is_file();image=subprocess.check_output(['docker','image','inspect',a.image,'--format','{{.Id}}'],text=True).strip();assert image.startswith('sha256:')
 host=subprocess.check_output(['docker','context','inspect','--format','{{.Endpoints.docker.Host}}'],text=True).strip();(r/'empty-docker').mkdir(exist_ok=True)
 config.write_text(json.dumps({'WEB_ISSUE':f'web{issue}','PAN_ENTRY':str(pan),'PAN_IMAGE':image,'WEB107_EXECUTOR':str(root/'executor/main.mjs'),'WEB107_TASK_ROOT':str(r/'tasks'),'DOCKER_HOST':host,'DOCKER_CONFIG':str(r/'empty-docker'),'ANALYSIS_CPUS':'2','ANALYSIS_MEMORY_GIB':'4'},indent=2));config.chmod(0o600);print('Pinned worker image and public Pan entry; no provider credentials');raise SystemExit(0)
if a.command=='stop':
 if not pidfile.exists():raise SystemExit('no owned worker PID receipt; inspect before signalling')
 pid=int(pidfile.read_text());cmd=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True)
 if cmd.returncode==0:
  if cmd.stdout.strip()!=str(r/'evidence-web')+' worker':raise SystemExit('PID ownership uncertain; no signal sent')
  os.kill(pid,signal.SIGTERM)
  for _ in range(150):
   if subprocess.run(['ps','-p',str(pid)],stdout=subprocess.DEVNULL).returncode!=0:break
   time.sleep(.1)
  else:raise SystemExit('worker stop unconfirmed; retain PID and inspect before restarting')
 pidfile.unlink();print('worker process stopped; inspect task cleanupConfirmed separately');raise SystemExit(0)
if pidfile.exists():raise SystemExit('worker PID receipt exists; inspect/stop before new start')
env=os.environ.copy();env.update(json.loads((r/'config.json').read_text()));env.update(json.loads(config.read_text()))
with (r/'worker.log').open('a') as f:proc=subprocess.Popen([str(r/'evidence-web'),'worker'],cwd=root,env=env,stdout=f,stderr=f,start_new_session=True)
time.sleep(.5)
if proc.poll() is not None:raise SystemExit('worker refused startup; inspect private worker.log')
pidfile.write_text(str(proc.pid));print('web107 worker started; offline-faux only')
