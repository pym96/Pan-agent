#!/usr/bin/env python3
"""Real local PTY capture of installed Pan + SSH Harbor lifecycle. No model implementation."""
import os,sys,pathlib,json,pty,fcntl,termios,struct,subprocess,time,select,codecs,re
import pyte
config_path=pathlib.Path(sys.argv[1]).resolve();activation=pathlib.Path(sys.argv[2]).resolve();out=pathlib.Path(sys.argv[3]).resolve();out.mkdir();cfg=json.loads(config_path.read_text())
m,s=pty.openpty();fcntl.ioctl(s,termios.TIOCSWINSZ,struct.pack('HHHH',38,120,0,0));screen=pyte.Screen(120,38);stream=pyte.Stream(screen);decoder=codecs.getincrementaldecoder('utf8')('replace');env=os.environ.copy();env.update(TERM='xterm-256color',LANG='en_US.UTF-8')
p=subprocess.Popen(['node',str(pathlib.Path(__file__).with_name('launcher.mjs')),str(config_path),str(activation)],stdin=s,stdout=s,stderr=s,env=env);os.close(s);start=time.monotonic();raw=(out/'terminal.raw').open('wb');cast=(out/'terminal.cast').open('w');cast.write(json.dumps({'version':2,'width':120,'height':38,'title':'Pan + Harbor / original db-wal-recovery'})+'\n');actions=[];sent=False;exited_tui=False;seen=set()
def send(text,label):os.write(m,text.encode());actions.append({'time':time.monotonic()-start,'label':label,'input':text})
while p.poll() is None:
 if select.select([m],[],[],.1)[0]:
  try:b=os.read(m,65536)
  except OSError:break
  if not b:break
  raw.write(b);raw.flush();text=decoder.decode(b);stream.feed(text);cast.write(json.dumps([round(time.monotonic()-start,3),'o',text],ensure_ascii=False)+'\n');cast.flush()
 txt='\n'.join(screen.display);(out/'screen.txt').write_text(txt)
 instruction=pathlib.Path(cfg['output'])/'instruction.txt'
 if not sent and instruction.exists() and 'Write a task' in txt:
  send('\x1b[200~'+instruction.read_text().strip()+'\x1b[201~','original instruction');time.sleep(.5);send('\r','submit original task');sent=True
 if 'Approval required' in txt and 'Selected: Deny' in txt:
  match=re.search(r'Request: ([A-Za-z0-9_-]+)',txt)
  if match:
   ident=match.group(1);(out/'approval-pending.json').write_text(json.dumps({'id':ident,'screen':txt},indent=2))
   if (out/('approve-'+ident)).exists() and ident not in seen:
    seen.add(ident);send('\x1b[B','select Allow once');time.sleep(.3);send('\r','approve once')
 archives=pathlib.Path(cfg['archives'])/'runs'
 if sent and not exited_tui and archives.exists():
  manifests=list(archives.glob('*/manifest.json'))
  if manifests:
   try:state=json.loads(manifests[0].read_text()).get('settled_state')
   except Exception:state=None
   if state in ['terminal','failed','cancelled','interrupted']:
    time.sleep(5);send(':exit\r','close settled TUI; hand off to original verifier');exited_tui=True
 (out/'status.json').write_text(json.dumps({'pid':p.pid,'elapsed':time.monotonic()-start,'submitted':sent,'tuiClosed':exited_tui,'approvals':len(seen)}))
raw.close();cast.close();code=p.wait();(out/'actions.json').write_text(json.dumps(actions,indent=2));(out/'report.json').write_text(json.dumps({'exitCode':code,'durationSeconds':time.monotonic()-start,'submitted':sent,'tuiClosed':exited_tui,'approvals':len(seen)},indent=2));print('Capture complete:',code)
