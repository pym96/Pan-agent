#!/usr/bin/env python3
"""#61 Faux installed PTY: twelve real tool lifecycles, activity, resize, replay and zero-effect view probes."""
import argparse,fcntl,hashlib,importlib.util,json,os,pty,select,shutil,signal,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--package',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=Path(__file__).resolve().parents[1];d=a.output;d.mkdir(parents=True,exist_ok=False)
workspace=d/'workspace';workspace.mkdir();memory=d/'memory';consumer=a.package.parent.parent
subprocess.run(['/usr/bin/git','init','-q',str(workspace)],check=True)
for source,target in [('scripts/fixtures/activity-driver.mjs','driver.mjs'),('scripts/wo35-consumer-guard.mjs','guard.mjs')]:shutil.copy2(repo/source,d/target)
(d/'guard.json').write_text(json.dumps({'phase':'activity-pty','consumer':str(consumer),'allowed':[str(consumer),str(d)],'denied':[str(repo)],'report':str(d/'guard-report')}))
env={'PATH':str(Path(a.node).parent)+':/usr/bin:/bin','HOME':str(d),'TERM':'xterm-256color','LANG':'en_US.UTF-8','NODE_NO_WARNINGS':'1','NODE_OPTIONS':'--import='+str(d/'guard.mjs'),'WO35_GUARD_CONFIG':str(d/'guard.json')}
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0))
child=subprocess.Popen([a.node,str(d/'driver.mjs'),str(a.package),str(workspace),str(memory)],stdin=slave,stdout=slave,stderr=slave,cwd=consumer,env=env)
spec=importlib.util.spec_from_file_location('screen',repo/'scripts/fixtures/tui-a/screen.py');screenmod=importlib.util.module_from_spec(spec);spec.loader.exec_module(screenmod)
raw=bytearray();columns,rows=120,40
def pump(seconds=.1):
 deadline=time.monotonic()+seconds
 while time.monotonic()<deadline:
  if not select.select([master],[],[],max(0,deadline-time.monotonic()))[0]:break
  try:data=os.read(master,65536)
  except OSError:break
  if not data:break
  raw.extend(data)
def state():
 try:return json.loads((d/'state.json').read_text())
 except (FileNotFoundError,json.JSONDecodeError):return {}
def wait(predicate):
 deadline=time.monotonic()+30
 while not predicate(state()):
  assert time.monotonic()<deadline,('timeout',state())
  pump()
def send(text):os.write(master,text.encode());pump(.2)
def capture(name):
 pump(.2);s=screenmod.Screen(columns,rows);s.feed(bytes(raw));lines=s.lines()
 (d/(name+'.screen.txt')).write_text('\n'.join(lines));(d/(name+'.state.json')).write_text(json.dumps(state(),indent=2));(d/(name+'.pty')).write_bytes(bytes(raw));return '\n'.join(lines)
def resize(c,r):
 global columns,rows
 columns,rows=c,r;fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',r,c,0,0));os.kill(child.pid,signal.SIGWINCH);pump(.3)
def archive_hash():return {str(f.relative_to(memory)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(memory.rglob('*')) if f.is_file()}
try:
 wait(lambda s:s.get('phase')=='confirm');send('y\n');send('demo\n');wait(lambda s:s.get('phase')=='idle' and s.get('exchanges')==2)
 tail=capture('default-tail-120');assert 'Tools · Activity' in tail and '12 completed · 3 failed' in tail
 send('\x1b[5~');send('\x1b[5~');normal=capture('default-120')
 s=state();digests=[e for e in s['entries'] if e['role']=='Tool'];assert len(digests)==1 and digests[0]['status']=='Activity',digests
 assert digests[0]['text']=='12 completed · 3 failed · latest bash · View activity',digests
 assert len([e for e in s['observations'] if e['type']=='tool.started'])==12
 before=archive_hash();send('retained draft');send('\t');send('\r');wait(lambda s:s.get('overlay',{}).get('title')=='Tool activity · view only')
 overlay=capture('activity-120');assert len(state()['overlay']['lines'])==12
 assert all('Running' not in line for line in state()['overlay']['lines'])
 for forbidden in ['HIDDEN_DIRECTORY','HIDDEN_ID','HIDDEN_COMMAND','HIDDEN_RESULT','HIDDEN_REPLACEMENT']:assert forbidden not in normal+tail+overlay,forbidden
 send('\r');assert state()['focus']=='transcript' and state()['draft']=='retained draft'
 resize(40,12);capture('default-40');send('\r');capture('activity-40');send('\x07');assert state()['draft']=='retained draft'
 resize(120,40);send('\x07');send('\x15');send(':replay '+s['runId']+'\n');wait(lambda s:any('REPLAY' in line for line in s.get('overlay',{}).get('lines',[])))
 replay=capture('replay-120');assert '12 completed · 3 failed' in replay and 'ACTIVITY_FINAL_OK' in replay
 assert not any('HIDDEN_' in line for line in state()['overlay']['lines'])
 assert archive_hash()==before,'view operations changed archive files'
 assert state()['exchanges']==2,'view operations exchanged with model'
 send('\x07');send('\x15');send(':details\n');wait(lambda s:len(s.get('overlay',{}).get('lines',[]))>0)
 capture('explicit-details');assert 'HIDDEN_ID' in '\n'.join(state()['overlay']['lines']),'explicit diagnostic selection was lost'
 assert archive_hash()==before and state()['exchanges']==2
 send('\x07');send('\x15');send(':exit\n')
 deadline=time.monotonic()+10
 while child.poll() is None and time.monotonic()<deadline:pump()
 assert child.wait(timeout=1)==0
 guards=list(d.glob('guard-report.*.json'));assert guards
 keys=['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny']
 for path in guards:
  meter=json.loads(path.read_text());assert all(meter[k]==0 for k in keys),meter
 (d/'summary.json').write_text(json.dumps({'result':'PASS','tool_starts':12,'errors':3,'faux_exchanges':2,'view_exchanges':0,'archive_before_after':before,'meters':'all zero','raw_sha256':hashlib.sha256(bytes(raw)).hexdigest()},indent=2))
 print('PASS #61 installed activity: 12 calls, digest/overlay/replay, narrow resize, draft, archive identity, zero external meters')
finally:
 if child.poll() is None:child.kill();child.wait()
 (d/'raw.pty').write_bytes(bytes(raw));os.close(master);os.close(slave)
