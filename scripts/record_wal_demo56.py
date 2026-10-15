#!/usr/bin/env python3
"""Real PTY recorder, operator approvals, installed Pan only. Requires pyte for screen observation."""
import os,sys,json,pathlib,pty,fcntl,termios,struct,subprocess,time,select,codecs,hashlib,re
import pyte
r=pathlib.Path(sys.argv[1]).resolve(); mode=sys.argv[2] if len(sys.argv)>2 else 'live';out=r/('capture-'+mode);out.mkdir()
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',38,120,0,0));screen=pyte.Screen(120,38);stream=pyte.Stream(screen);decoder=codecs.getincrementaldecoder('utf8')('replace')
env=os.environ.copy();env.update(HOME=str(r/'home'),TERM='xterm-256color',LANG='en_US.UTF-8')
if mode!='live':
 for k in list(env):
  if any(w in k.upper() for w in ['API_KEY','TOKEN','PASSWORD','SECRET']):env.pop(k)
args=[str(r/'consumer/node_modules/.bin/pan-agent'),'--kernel','native','--workspace',str(r/'workspace'),'--memory-root',str(r/'archives')]
proc=subprocess.Popen(args,stdin=slave,stdout=slave,stderr=slave,env=env,close_fds=True);os.close(slave);start=time.monotonic();raw=open(out/'terminal.raw','wb');cast=open(out/'terminal.cast','w');cast.write(json.dumps({'version':2,'width':120,'height':38,'title':'Pan Agent | '+mode+' | WAL recovery','env':{'TERM':'xterm-256color'}})+'\n');cast.flush();actions=[];seen=set()
def pump(sec):
 end=time.monotonic()+sec
 while time.monotonic()<end:
  if select.select([master],[],[],.1)[0]:
   try:b=os.read(master,65536)
   except OSError:return
   if not b:return
   raw.write(b);raw.flush();text=decoder.decode(b);stream.feed(text);cast.write(json.dumps([round(time.monotonic()-start,3),'o',text],ensure_ascii=False)+'\n');cast.flush()
def snapshot():return '\n'.join(screen.display)
def send(s,label='input'):
 actions.append({'time':round(time.monotonic()-start,3),'label':label,'input':s})
 try:os.write(master,s.encode())
 except OSError:return
 pump(.3)
def digest():return {str(p.relative_to(r/'archives')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (r/'archives').rglob('*') if p.is_file()}
pump(2)
if mode=='live':
 prompt=(r/'prompt.txt').read_text().strip();send('\x1b[200~'+prompt+'\x1b[201~','task draft');pump(2);send('\r','submit task')
# Keep recording while operator independently inspects each approval. No model or tool implementation here.
settled=False;deadline=time.monotonic()+2700
if mode=='live':
 while proc.poll() is None and time.monotonic()<deadline:
  pump(.3);text=snapshot();(out/'screen.txt').write_text(text)
  manifests=list((r/'archives/runs').glob('*/manifest.json'))
  if manifests:
   try:
    if json.loads(manifests[0].read_text()).get('settled_state') in ['terminal','failed','cancelled','interrupted']:settled=True;break
   except Exception:pass
  if 'Approval required' in text and 'Selected: Deny' in text:
   match=re.search(r'Request: ([A-Za-z0-9_-]+)',text);identity=match.group(1) if match else hashlib.sha256(text.encode()).hexdigest()[:16]
   pending=out/'approval-pending.json';pending.write_text(json.dumps({'id':identity,'screen':text,'time':round(time.monotonic()-start,3)},indent=2))
   decision=out/('approve-'+identity)
   if decision.exists() and identity not in seen:
    seen.add(identity);send('\x1b[B','allow-once selection');pump(.4);send('\r','allow-once confirmation')
  (out/'status.json').write_text(json.dumps({'pid':proc.pid,'mode':mode,'elapsed':time.monotonic()-start,'settled':settled,'approvals':len(seen)}))
 if not settled and proc.poll() is None:send('\x03','deadline cancellation');pump(20)
pump(3);runs=list((r/'archives/runs').glob('*'));run_id=runs[0].name if runs else None;before=digest()
if settled or mode!='live':
 send(':runs');send('\r');pump(6);send('\x07')
 if run_id:send(':replay '+run_id);send('\r');pump(10);send('\x07')
if mode.startswith('details'):
 send(':details');send('\r');pump(3);pages=[];last=None
 for page in range(100):
  text=snapshot();pages.append({'page':page,'time':round(time.monotonic()-start,3),'screen':text})
  if text==last:break
  last=text;pump(10 if mode=='details3' and page in [0,8,9,10,13,17] else 2);send('\x1b[6~'*6,'details page down x6');pump(.5)
 (out/'detail-pages.json').write_text(json.dumps(pages,indent=2));send('\x07')
after=digest();send(':exit');send('\r');pump(2)
if proc.poll() is None:send('\x04','exit');pump(2)
if proc.poll() is None:proc.terminate()
try:code=proc.wait(timeout=5)
except subprocess.TimeoutExpired:proc.kill();code=proc.wait()
raw.close();cast.close();(out/'actions.json').write_text(json.dumps(actions,indent=2));(out/'report.json').write_text(json.dumps({'mode':mode,'exitCode':code,'runId':run_id,'settled':settled,'durationSeconds':time.monotonic()-start,'replayUnchangedArchives':before==after,'beforeReplay':before,'afterReplay':after,'command':args,'node':subprocess.check_output(['node','--version'],text=True).strip(),'platform':sys.platform,'terminal':'xterm-256color','columns':120,'rows':38},indent=2));print(json.dumps({'mode':mode,'runId':run_id,'settled':settled,'exitCode':code}))
