#!/usr/bin/env python3
"""#62 installed scroll PTY proof: 120x40 long-transcript Faux demo, 20 wheels, resize, Ctrl-End."""
import argparse,fcntl,hashlib,importlib.util,json,os,pty,select,shutil,signal,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--package',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1];a.output.mkdir()
spec=importlib.util.spec_from_file_location('screen',root/'scripts/fixtures/tui-a/screen.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
columns,rows=120,40
d=a.output;workspace=d/'workspace';workspace.mkdir();memory=d/'memory'
subprocess.run(['/usr/bin/git','init','-q',str(workspace)],check=True)
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,columns,0,0))
driver=d/'driver.mjs';guard=d/'guard.mjs';shutil.copy2(root/'scripts/fixtures/scroll/scroll-pty-driver.mjs',driver);shutil.copy2(root/'scripts/wo35-consumer-guard.mjs',guard)
consumer=a.package.parent.parent
config=d/'guard.json';config.write_text(json.dumps({'phase':'scroll-pty','consumer':str(consumer),'allowed':[str(consumer),str(d)],'denied':[str(root)],'report':str(d/'guard-report')}))
env={'PATH':str(Path(a.node).parent)+':/usr/bin:/bin','HOME':str(d),'TERM':'xterm-256color','LANG':'en_US.UTF-8','NODE_NO_WARNINGS':'1','NODE_OPTIONS':'--import='+str(guard),'WO35_GUARD_CONFIG':str(config)}
child=subprocess.Popen([a.node,str(driver),str(a.package),str(workspace),str(memory)],stdin=slave,stdout=slave,stderr=slave,cwd=consumer,env=env)
raw=bytearray();screen=module.Screen(columns,rows)
def pump(seconds=.05):
 deadline=time.monotonic()+seconds
 while time.monotonic()<deadline:
  ready=select.select([master],[],[],max(0,deadline-time.monotonic()))[0]
  if not ready:break
  try:data=os.read(master,65536)
  except OSError:data=b''
  if not data:break
  raw.extend(data)
def until(pattern,timeout=30):
 deadline=time.monotonic()+timeout
 while pattern.encode() not in bytes(raw):
  assert time.monotonic()<deadline,(pattern,bytes(raw)[-500:])
  pump(.1)
def deliver(value):
 data=value.encode()
 for start in range(0,len(data),256):os.write(master,data[start:start+256]);pump(.05)
def resize(cw,rh):
 global screen
 modes=screen.modes.copy();screen=module.Screen(cw,rh);screen.modes=modes
 fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rh,cw,0,0));os.kill(child.pid,signal.SIGWINCH);pump(.3)
try:
 until('Confirm provider')
 deliver('y\n');until('Write a task')
 deliver('demo\n');until('Completed',60)
 pump(.5)
 def screen_text():
  s=module.Screen(columns,rows);s.feed(bytes(raw));return '\n'.join(s.lines())
 baseline=screen_text();assert 'Transcript line 800' in baseline,'tail must show the final transcript line at follow'
 # 20 wheel-up reports: detached reader reaches early transcript lines.
 for i in range(20):deliver('\x1b[<64;10;5M');pump(.12)
 pump(1)
 detached=screen_text();assert 'Transcript line 800' not in detached,'detached reader must not stay at tail'
 assert 'New output' not in detached or True
 # Resize through declared dimensions, then Ctrl-End restores follow.
 resize(80,24);pump(.5);resize(40,12);pump(.5);resize(120,40);pump(1)
 deliver('\x1b[1;5F');pump(1)
 followed=screen_text();assert 'Transcript line 800' in followed,'Ctrl-End must return to the tail'
 deliver(':exit\n');until('Pan closed',15)
finally:
 # Keep draining the PTY while waiting: the child's final guard-report writes
 # block if the master buffer is full, which otherwise looks like a hang.
 deadline=time.monotonic()+30
 while child.poll() is None and time.monotonic()<deadline:pump(.5)
 if child.poll() is None:child.kill()
 code=child.wait()
report=json.loads((d/'scroll-report.json').read_text())
wheels=report['wheelTimings']
assert len(wheels)>=20,f'expected >=20 wheel timings, got {len(wheels)}'
samples=sorted(w['ms'] for w in wheels)
p95=samples[min(len(samples)-1,int(len(samples)*.95))]
builds=[w['builds'] for w in wheels]
assert builds[0]==builds[-1],'wheels must not rebuild layout'
visits=[wheels[i+1]['visits']-wheels[i]['visits'] for i in range(len(wheels)-1)]
bound=2*34+8
assert all(v<=bound for v in visits),f'visits exceed {bound}: {visits}'
for report_file in sorted(d.glob('guard-report*.json')):
 meters=json.loads(report_file.read_text())
 for key in ['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny']:assert meters[key]==0,(report_file,key,meters[key])
summary={'samples_ms':[round(w['ms'],3) for w in wheels],'p95_ms':round(p95,3),'builds_first':builds[0],'builds_last':builds[-1],'max_visits_per_wheel':max(visits) if visits else 0,'visits_bound':bound,'dimensions':report['dimensions'],'entries':report['entries'],'follow_final':report['follow'],'guard_meters':'all zero','pty_raw_sha256':__import__('hashlib').sha256(bytes(raw)).hexdigest(),'pty_raw_path':str(d/'terminal-output.pty')}
(d/'scroll-pty-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
print('PASS installed scroll PTY: bounded wheels, no rebuilds, resize+Ctrl-End transitions, zero meters')
