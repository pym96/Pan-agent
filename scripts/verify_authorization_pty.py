#!/usr/bin/env python3
"""#49 Criteria 1.1 installed Faux PTY, actual input, raw capture and guard meters."""
import argparse,fcntl,hashlib,importlib.util,json,os,pty,select,shutil,signal,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--package',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
repo=Path(__file__).resolve().parents[1];d=a.output;d.mkdir(parents=True,exist_ok=False);workspace=d/'workspace';workspace.mkdir();memory=d/'memory';consumer=a.package.parent.parent
subprocess.run(['/usr/bin/git','init','-q',str(workspace)],check=True)
for source,target in [('fixtures/authorization-driver.mjs','driver.mjs'),('wo35-consumer-guard.mjs','base-guard.mjs'),('wo49-consumer-guard.mjs','guard.mjs')]:shutil.copy2(repo/'scripts'/source,d/target)
(d/'guard.json').write_text(json.dumps({'phase':'authorization-pty','consumer':str(consumer),'allowed':[str(consumer),str(d)],'denied':[str(repo)],'report':str(d/'guard-report')}))
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
  assert time.monotonic()<deadline,('timeout',state(),bytes(raw)[-1000:])
  pump()
def send(text):os.write(master,text.encode());pump(.08)
def capture(name):
 pump();screen=screenmod.Screen(columns,rows);screen.feed(bytes(raw));text='\n'.join(screen.lines());(d/(name+'.screen.txt')).write_text(text);(d/(name+'.state.json')).write_text(json.dumps(state(),indent=2));(d/(name+'.pty')).write_bytes(bytes(raw));return text
def resize(c,r):
 global columns,rows
 columns,rows=c,r;fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',r,c,0,0));os.kill(child.pid,signal.SIGWINCH);pump(.2)
def task(name):
 send('\x07');send('\x15');send(name+'\n')
def idle():wait(lambda s:s.get('phase')=='idle' and not s.get('approval'))
def pending():wait(lambda s:s.get('approval') is not None)
def choose(n):
 for _ in range(n):send('\x1b[B')
 send('\r');idle()
def archive_hash():return {str(f.relative_to(memory)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(memory.rglob('*')) if f.is_file()}
try:
 idle();assert state()['exchanges']==0;initial=capture('idle-120');assert 'Confirm provider' not in initial
 task('ordinary');wait(lambda s:s.get('runs')==1 and s.get('phase')=='idle');assert (workspace/'ordinary.txt').read_text()=='EDITED';capture('ordinary-120')
 task('protected');pending();assert state()['approval']['choice']==0;screen=capture('protected-120');assert 'Approval required' in screen and 'Selected: Deny' in screen;assert 'SYNTHETIC_FILE_BODY_CANARY' not in screen;choose(1);assert (workspace/'.git/authorized-demo.txt').read_text()=='SYNTHETIC_FILE_BODY_CANARY'
 task('deny');pending();choose(0);assert not (workspace/'.git/denied-demo.txt').exists();capture('denied-120')
 task('shell');pending();capture('shell-120');choose(1)
 task('trust');pending();choose(2)
 task('again');wait(lambda s:s.get('runs')==6 and s.get('phase')=='idle');assert not state()['approval'];capture('trusted-120')
 task(':trust off');wait(lambda s:s.get('overlay') is not None);send('\x07');task('shell');pending();capture('revoked-120');choose(0)
 task('cancel');send('retained draft');pending();assert state()['draft']=='retained draft';capture('cancel-pending');send('\x03');idle();assert state()['draft']=='retained draft';assert not (workspace/'cancelled-marker.txt').exists();capture('cancelled-120')
 task('long');pending();screen=capture('long-120');assert '\\u202e' in '\n'.join(state()['overlay']['lines']);send('\x1b[200~\x1b[B\r\x1b[201~');assert state()['approval']['choice']==0
 resize(40,12);capture('long-40');send('\x1b[6~');capture('long-40-scrolled');send('\x07');idle();resize(120,40)
 task('ordinary');wait(lambda s:s.get('runs')==10 and s.get('phase')=='idle');send('\t');send('\r');wait(lambda s:s.get('overlay',{}).get('title')=='Tool activity · view only');capture('activity-120');send('\x07');send('\x07')
 before=archive_hash();exchanges=state()['exchanges'];task(':replay '+state()['runId']);wait(lambda s:s.get('overlay') is not None);capture('replay-120');assert archive_hash()==before and state()['exchanges']==exchanges
 task(':exit')
 deadline=time.monotonic()+10
 while child.poll() is None and time.monotonic()<deadline:pump()
 assert child.wait(timeout=1)==0
 reports=list(d.glob('guard-report.*.json'));assert reports
 for path in reports:
  report=json.loads(path.read_text());assert all(report[k]==0 for k in ['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny']),report
 summary={'criteria':'1.1','result':'PASS','runs':10,'external_meters':'all zero','archive_before_after':before,'raw_sha256':hashlib.sha256(bytes(raw)).hexdigest(),'human_answers':'PENDING'}
 (d/'summary.json').write_text(json.dumps(summary,indent=2));print('PASS #49 installed authorization, default Deny, allow/trust/revoke/cancel, narrow/long/paste, replay and zero meters')
finally:
 if child.poll() is None:child.kill();child.wait()
 (d/'raw.pty').write_bytes(bytes(raw));os.close(master);os.close(slave)
