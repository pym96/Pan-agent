#!/usr/bin/env python3
"""Actual installed or source CLI: first visible prefix precedes source release and settlement."""
import argparse,fcntl,json,os,pty,re,select,struct,subprocess,termios,time,unicodedata
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--package',type=Path);p.add_argument('--guard',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[1];a.output.mkdir();reports=[]
class Screen:
 def __init__(self,columns):self.columns=columns;self.lines=[[]];self.row=0;self.col=0
 def feed(self,text):
  for token in re.findall(r'\x1b\[[0-9;]*[A-Za-z]|.',text,re.S):
   if token.startswith('\x1b['):
    n=int(token[2:-1] or 0);op=token[-1]
    if op=='A':self.row=max(0,self.row-(n or 1))
    elif op=='C':self.col+=n or 1
    elif op=='J':self.lines=self.lines[:self.row+1];self.lines[self.row]=self.lines[self.row][:self.col]
    else:raise AssertionError(token)
   elif token=='\r':self.col=0
   elif token=='\n':self.row+=1;self.col=0
   else:
    size=0 if unicodedata.combining(token) else 2 if unicodedata.east_asian_width(token) in 'WF' else 1
    if self.col+size>self.columns:self.row+=1;self.col=0
    while len(self.lines)<=self.row:self.lines.append([])
    line=self.lines[self.row]
    while len(line)<self.col+size:line.append(' ')
    if size:line[self.col]=token
    if size==2:line[self.col+1]=''
    self.col+=size
   while len(self.lines)<=self.row:self.lines.append([])
 def text(self):return '\n'.join(''.join(line) for line in self.lines)
cases=[]
for columns,rows in [(80,24),(40,12),(0,0)]:
 for provider in ['deepseek','faux']:
  for mode in ['normal','cancel','broken','observer','safety','busy','toolcancel']:
   cases.append((columns,rows,provider,mode,'byte' if mode in ['normal','safety'] else 'grouped'))
  if provider=='deepseek':
   for mode in ['malformed','identity','length']:cases.append((columns,rows,provider,mode,'utf8'))
   for part in ['utf8','grouped']:cases.append((columns,rows,provider,'normal',part))
for columns,rows,provider,mode,part in cases:
 directory=a.output/f'{columns}x{rows}-{provider}-{mode}-{part}';directory.mkdir();(directory/'workspace').mkdir()
 control_r,control_w=os.pipe();event_r,event_w=os.pipe();env={'PATH':str(Path(a.node).resolve().parent)+':/usr/bin:/bin','HOME':str(directory),'LANG':'en_US.UTF-8','TERM':'xterm-256color'}
 driver=root/'scripts/fixtures/streaming-pty-driver.mjs'
 if a.package:
  # Verification fixtures copied beside the installed consumer; no source checkout read is needed by Node.
  import shutil
  verification=a.package.parent.parent/'verification';driver=verification/'streaming-pty-driver.mjs'
  for name in ['streaming-pty-driver.mjs','streaming-wire.mjs']:shutil.copy2(root/'scripts/fixtures'/name,verification/name)
 if a.guard:
  config=directory/'guard-config.json';config.write_text(json.dumps({'phase':directory.name,'consumer':str(a.package.parent.parent),'allowed':[str(a.package.parent.parent),str(directory)],'denied':[str(root)],'report':str(directory/'guard-report')}));env.update(NODE_OPTIONS='--import='+str(a.guard),WO35_GUARD_CONFIG=str(config))
 command=[a.node,*([] if a.package else ['--experimental-strip-types']),str(driver),str(a.package or root),str(directory/'workspace'),str(directory/'memory'),provider,mode,part,str(control_r),str(event_w)]
 if columns:
  master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,columns,0,0));child=subprocess.Popen(command,stdin=slave,stdout=slave,stderr=slave,env=env,cwd=a.package.parent.parent if a.package else root,pass_fds=(control_r,event_w));os.close(slave);read_fd=write_fd=master
 else:
  child=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env,cwd=a.package.parent.parent if a.package else root,pass_fds=(control_r,event_w));read_fd=child.stdout.fileno();write_fd=child.stdin.fileno()
 os.close(control_r);os.close(event_w);raw=bytearray();event_bytes=bytearray();events=[];order=[]
 def pump(predicate):
  deadline=time.monotonic()+15
  while not predicate():
   assert time.monotonic()<deadline,(directory.name,'deadlock guard (15s; not a latency threshold)',bytes(raw)[-2000:],events[-5:])
   ready,_,_=select.select([read_fd,event_r],[],[],.1)
   for fd in ready:
    try:data=os.read(fd,65536)
    except OSError:data=b''
    if fd==read_fd:raw.extend(data)
    else:
     event_bytes.extend(data)
     while b'\n' in event_bytes:
      line,_,rest=event_bytes.partition(b'\n');event_bytes[:]=rest;events.append(json.loads(line))
   if child.poll() is not None and not ready:assert predicate(),('early exit',events,bytes(raw))
 def has(text):return text.encode() in raw
 def send(text):os.write(write_fd,text.encode())
 def settled():return [e['settled'] for e in events if 'settled' in e]
 try:
  pump(lambda:has('[y/N]> '));assert has('host-user authority') and has('not containment or an OS sandbox');send('y\r' if columns else 'y\n');pump(lambda:has('You > '));send('first 中文\r' if columns else 'first 中文\n')
  pump(lambda:has('Hello, ') and any('parsedProgress' in e for e in events) and any(e.get('barrier')=='source' for e in events))
  assert not settled() and not any(e.get('exchange')=='settled' for e in events);assert not any(e.get('sourceRelease')=='remaining' for e in events)
  order.append({'reader':'actual PTY' if columns else 'actual stdout','visible':'Hello, ','source_barrier':'closed','exchange':'pending','raw_bytes':len(raw),'events_seen':len(events)})
  if mode in ['normal','busy']:send('草稿ab\x1b[D中' if columns else '草稿a中b')
  if mode=='busy':
   send('\r' if columns else '\n');pump(lambda:has('Busy — draft retained'));assert not settled()
  if mode=='cancel':
   send('\x03');pump(lambda:len(settled())==1);assert settled()[0]['status']=='cancelled';assert not any(e.get('sourceRelease')=='remaining' for e in events);pump(lambda:any('sourceCleanup' in e for e in events));order.append({'cancellation_settled':True,'source_barrier':'still closed','source_cleanup':True})
  os.write(control_w,b'source\n');order.append({'parent':'released source only after actual prefix read'})
  if mode=='toolcancel':
   pump(lambda:(directory/'workspace/started').exists());send('\x03')
  pump(lambda:len(settled())==1 and (mode!='cancel' or any(e.get('sourceRelease')=='remaining' for e in events)))
  status=settled()[0]['status'];expected='cancelled' if mode in ['cancel','toolcancel'] else 'model_error' if mode in ['broken','malformed','identity'] else 'incomplete' if mode=='length' else 'completed';assert status==expected,(status,expected)
  pump(lambda:raw.rfind(b'You > ')>raw.rfind(('('+status+')').encode()))
  first_end=len(raw)
  if mode in ['normal','busy'] and columns:
   screen=Screen(columns);screen.feed(raw.decode());assert 'You > 草稿a中b' in screen.text(),screen.text();(directory/'draft-screen.txt').write_text(screen.text());send('Z\r')
  elif mode in ['normal','busy']:send('Z\n')
  else:send('next task\r' if columns else 'next task\n')
  pump(lambda:len(settled())==2);assert settled()[1]['status']=='completed';pump(lambda:raw.rfind(b'You > ')>raw.rfind(b'(completed)'))
  before_views=len(raw);send(':details\r' if columns else ':details\n');pump(lambda:any(e.get('view')=='details' for e in events));send(':replay '+settled()[0]['runId']+('\r' if columns else '\n'));pump(lambda:any(e.get('view')=='replay' for e in events));pump(lambda:raw.rfind(b'You > ')>raw.rfind(b'Archived replay'))
  assert has('Transient previews are not recorded');assert has('Model calls unavailable (not recorded)')
  send(':exit\r' if columns else ':exit\n');pump(lambda:any('exit' in e for e in events));os.close(control_w);control_w=None;child.wait(timeout=5)
  report=json.loads((directory/'report.json').read_text());assert report['code']==0 and report['exchanges']==2 and report['terminals']==2
  assert all(report[key]==0 for key in ['afterTerminal','unhandled','networkAttempts'])
  assert report['effects']==report['toolStarts']==(1 if mode=='toolcancel' else 0)
  assert not (directory/'workspace/must-not-exist').exists()
  assert all(set(e)=={'type','text','runId','turn'} for e in report['progress'])
  task=report['observations'][next(i for i,e in enumerate(report['observations']) if e['type']=='run.started' and i>0)]['task'];assert task==('草稿a中Zb' if mode in ['normal','busy'] and columns else '草稿a中bZ' if mode in ['normal','busy'] else 'next task'),task
  first_progress=[e['text'] for e in report['progress'] if e['runId']==report['results'][0]['runId']];assert ''.join(first_progress).startswith('Hello, ')
  if mode in ['cancel','broken','malformed','identity']:assert 'Hello, ' not in report['archives'][0]
  text=raw.decode();assert 'HIDDEN_' not in text and 'LATE_AFTER_CANCEL' not in text;assert not re.search(r'\x1b\]|\x1b\[2J|[\x00-\x09\x0b-\x0c\x0e-\x1a\x1c-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u2028\u2029\ufffd]',text)
  if not columns:assert '\x1b' not in text and '\r' not in text
  if mode in ['normal','length']:
   assert ''.join(first_progress)=='Hello, 世界!\n'
   if columns:
    screen=Screen(columns);screen.feed(raw[:first_end].decode());logical=screen.text();(directory/'settled-screen.txt').write_text(logical)
   else:logical=raw[:first_end].decode()
   assert logical.count('Hello, 世界!')==1,(directory.name,logical)
  if mode in ['cancel','broken','malformed','identity','length']:assert 'Partial response — interrupted' in text
  if mode=='observer':assert 'Display error: progress observer failed; execution continues.' in text
  if mode=='safety':assert '正常中文🙂' in text and r'\u001b]52' in text and '│ Completed' in text
  if a.guard:
   guard_reports=list(directory.glob('guard-report*.json'));assert guard_reports
   for file in guard_reports:
    guard=json.loads(file.read_text());assert all(guard[k]==0 for k in ['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny']),guard
  (directory/'ordering.json').write_text(json.dumps(order,ensure_ascii=False,indent=2)+'\n');reports.append({'case':directory.name,'status':status,'exchanges':2,'source_cleanup':report['sourceCleanup'],'synthetic_credentials':report['syntheticCredentials'],'progress_fragments':report['progressCount'],'barrier_prefix_observed':True,'guard_timeout_seconds':15})
 finally:
  (directory/'transcript.bin').write_bytes(raw);(directory/'transcript.txt').write_text(raw.decode(errors='backslashreplace'));(directory/'events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
  if child.poll() is None:child.kill();child.wait()
  for fd in [read_fd if columns else None,event_r,control_w]:
   if fd is not None:os.close(fd)
# Fault/control compare first complete outcome and terminal; only generated Run identity is normalized.
for columns,rows in [(80,24),(40,12),(0,0)]:
 for provider in ['deepseek','faux']:
  normal=json.loads((a.output/f'{columns}x{rows}-{provider}-normal-byte/report.json').read_text())
  fault=json.loads((a.output/f'{columns}x{rows}-{provider}-observer-grouped/report.json').read_text())
  assert normal['outcomes'][0]==fault['outcomes'][0]
  strip=lambda r:{k:v for k,v in r.items() if k!='runId'}
  assert strip(normal['results'][0])==strip(fault['results'][0])
(a.output/'summary.json').write_text(json.dumps({'cases':reports,'real_provider_calls':0,'real_credential_reads':0,'balance_queries':0,'paid_formal_runs':0,'cost_cny':0},indent=2)+'\n')
print('PASS',len(reports),'actual CLI streaming source barriers, cancellation, failure, draft, encoding and replay cases')
