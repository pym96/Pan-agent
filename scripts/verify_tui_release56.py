#!/usr/bin/env python3
"""Record installed TUI output through a real PTY. No UI/Agent implementation here."""
import argparse, codecs, os, pty, fcntl, termios, struct, subprocess, time, select, json, pathlib, hashlib
p=argparse.ArgumentParser();p.add_argument('executable');p.add_argument('directory');p.add_argument('--live',action='store_true');p.add_argument('--replay-of');a=p.parse_args()
root=pathlib.Path(a.directory).resolve();root.mkdir()
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',34,112,0,0))
env=os.environ.copy();env.update(TERM='xterm-256color',LANG='en_US.UTF-8',NO_COLOR='1')
if not a.live:
 for key in list(env):
  if any(s in key.upper() for s in ['API_KEY','TOKEN','PASSWORD','SECRET']):env.pop(key)
args=[str(pathlib.Path(a.executable).resolve()),'demo','--directory',str(root/'demo')]
if a.live:
 (root/'workspace').mkdir();(root/'home'/'.pan-agent').mkdir(parents=True)
 (root/'workspace'/'hello.js').write_text('// Ready for the demonstration.\n')
 (root/'home'/'.pan-agent'/'settings.json').write_text(json.dumps(dict(schemaVersion=1,provider='kimi-code',modelId='k3-256k',thinkingLevel='high',credentialSource='environment')))
 env['HOME']=str(root/'home');args=[str(pathlib.Path(a.executable).resolve()),'--kernel','native','--workspace',str(root/'workspace'),'--memory-root',str(root/'archives')]
if a.replay_of:
 source=pathlib.Path(a.replay_of).resolve();env['HOME']=str(source/'home');args=[str(pathlib.Path(a.executable).resolve()),'--kernel','native','--workspace',str(source/'workspace'),'--memory-root',str(source/'archives')]
proc=subprocess.Popen(args,stdin=slave,stdout=slave,stderr=slave,env=env,close_fds=True);os.close(slave)
start=time.monotonic();events=[];raw=bytearray();actions=[];decoder=codecs.getincrementaldecoder('utf8')('replace')
def pump(seconds):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  if select.select([master],[],[],.1)[0]:
   try:b=os.read(master,65536)
   except OSError:return
   if not b:return
   raw.extend(b);events.append([round(time.monotonic()-start,3),'o',decoder.decode(b)])
def send(s):
 actions.append(dict(time=round(time.monotonic()-start,3),input=s))
 try:os.write(master,s.encode())
 except OSError:return
 pump(.3)
pump(2)
prompt='Write hello.js with exactly console.log("PAN_LIVE_OK"); followed by a newline. Run node hello.js, then read hello.js to verify. Do not do anything else.' if a.live else 'Create hello.js, run it, and read it back.'
if not a.replay_of:send(prompt);pump(1);send('\r')
archive=pathlib.Path(a.replay_of)/'archives' if a.replay_of else (root/'archives' if a.live else root/'demo'/'archives')
# Approval remains actual TUI input. Only intended benign fixed workspace/task is used.
approvals=0;approved_at=0;completed=False
for _ in range(0 if a.replay_of else 1800):
 pump(.2)
 tail=bytes(raw[-18000:]).decode('utf8','replace')
 # Read persisted state to avoid mistaking a prior redraw for a new approval.
 files=list(archive.glob('runs/*/manifest.json'))
 if files:
  try:
   manifest=json.loads(files[0].read_text())
   if manifest.get('sealed') or manifest.get('settled_state') in ['terminal','failed','cancelled','sealed']:
    completed=True;break
  except Exception:pass
 if 'Allow once' in tail and time.monotonic()-approved_at>4:
  send('\x1b[B');send('\r');approvals+=1;approved_at=time.monotonic()
 if proc.poll() is not None:break
 # fallback identify settled via manifest contents inspected later
 if files and '"sealedAt"' in files[0].read_text():completed=True;break
 if time.monotonic()-start>360:break
pump(3)
run_dirs=list((archive/'runs').glob('*')) if (archive/'runs').exists() else []
run_id=run_dirs[0].name if run_dirs else None
before={str(f.relative_to(archive)):hashlib.sha256(f.read_bytes()).hexdigest() for f in archive.rglob('*') if f.is_file()} if archive.exists() else {}
send(':runs');send('\r');pump(3);send('\x07')
if run_id:send(':replay '+run_id);send('\r');pump(6);send('\x07')
after={str(f.relative_to(archive)):hashlib.sha256(f.read_bytes()).hexdigest() for f in archive.rglob('*') if f.is_file()} if archive.exists() else {}
send(':exit');send('\r');pump(2)
if proc.poll() is None:send('\x03');pump(2)
if proc.poll() is None:proc.terminate()
try:code=proc.wait(timeout=5)
except subprocess.TimeoutExpired:proc.kill();code=proc.wait()
(root/'terminal.cast').write_text(json.dumps(dict(version=2,width=112,height=34,env={'TERM':'xterm-256color'},title='Pan Agent '+('SAVED LIVE RUN / REPLAY ONLY' if a.replay_of else ('LIVE Kimi Code' if a.live else 'OFFLINE SCRIPTED MODEL'))))+'\n'+''.join(json.dumps(e,ensure_ascii=False)+'\n' for e in events))
(root/'terminal.raw').write_bytes(raw)
(root/'capture.json').write_text(json.dumps(dict(mode='replay-only' if a.replay_of else ('live-kimi' if a.live else 'offline-scripted'),command=args,node=subprocess.check_output(['node','--version'],text=True).strip(),platform=os.uname().sysname,architecture=os.uname().machine,terminal=env['TERM'],columns=112,rows=34,exitCode=code,runId=run_id,completedObserved=completed,approvals=approvals,actions=actions,archiveUnchangedByReplay=before==after,duration=time.monotonic()-start),indent=2))
print(json.dumps(dict(root=str(root),exitCode=code,runId=run_id,completedObserved=completed,archiveUnchangedByReplay=before==after)))
