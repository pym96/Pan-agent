#!/usr/bin/env python3
"""Actual PTYs at the frozen dimensions; all progress schedules use pipe barriers."""
import argparse,fcntl,json,os,pty,re,select,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];a.output.mkdir()
reports=[]
# Minimal scrollback VT model for the renderer-owned CR/LF/CSI A/C/J subset.
class Screen:
 def __init__(self,columns):self.columns=columns;self.lines=[[]];self.row=0;self.col=0
 def feed(self,text):
  import unicodedata
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
for columns,rows in [(80,24),(40,12)]:
 for mode in ['busy','cancel','pre-confirm','idle-exit','safety']:
  directory=a.output/f'{columns}x{rows}-{mode}';directory.mkdir();(directory/'workspace').mkdir()
  master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,columns,0,0))
  control_r,control_w=os.pipe();event_r,event_w=os.pipe()
  env={'PATH':str(Path(a.node).resolve().parent)+':/usr/bin:/bin','HOME':str(directory),'LANG':'en_US.UTF-8','TERM':'xterm-256color'}
  child=subprocess.Popen([a.node,'--experimental-strip-types',str(root/'scripts/fixtures/tui-pty-driver.mjs'),str(root),str(directory/'workspace'),str(directory/'memory'),mode,str(control_r),str(event_w)],stdin=slave,stdout=slave,stderr=slave,env=env,pass_fds=(control_r,event_w))
  os.close(slave);os.close(control_r);os.close(event_w);raw=bytearray();event_bytes=bytearray();events=[]
  def pump(predicate):
   deadline=time.monotonic()+15
   while not predicate():
    assert time.monotonic()<deadline,(mode,'barrier timeout',bytes(raw)[-1200:],events)
    ready,_,_=select.select([master,event_r],[],[],.1)
    for fd in ready:
     try:data=os.read(fd,65536)
     except OSError:data=b''
     if fd==master:raw.extend(data)
     else:
      event_bytes.extend(data)
      while b'\n' in event_bytes:
       line,_,rest=event_bytes.partition(b'\n');event_bytes[:]=rest;events.append(json.loads(line))
    if child.poll() is not None and not ready:assert predicate(),('early exit',events,bytes(raw))
  def has(text):return text.encode() in raw
  def barrier(name):return any(e.get('barrier')==name for e in events)
  def send(text):os.write(master,text.encode())
  try:
   pump(lambda:has('[y/N]> '))
   if mode=='pre-confirm':send('\x03')
   else:
    send('y\r');pump(lambda:has('你 › '))
    if mode=='idle-exit':send('\x03')
    else:
     send('first 中文\r');pump(lambda:barrier('model'))
     if mode=='safety':
      pump(lambda:any('settled' in e for e in events))
      runid=next(e['settled']['runId'] for e in events if 'settled' in e)
      pump(lambda:raw.rfind('你 › '.encode())>raw.rfind('模型错误 (model_error)'.encode()))
      send(':details\r');pump(lambda:len([e for e in events if e.get('view')=='details'])==1)
      send(':replay '+runid+'\r');pump(lambda:any(e.get('view')=='replay' for e in events))
      send(':details\r');pump(lambda:len([e for e in events if e.get('view')=='details'])==2)
     elif mode=='busy':
      send('草稿ab\x1b[D中');os.write(control_w,b'model\n');pump(lambda:barrier('tool'))
      send('\r');pump(lambda:has('忙碌中'))
      # The blocked Tool proves no settlement/second admission exists yet.
      assert not any('settled' in e for e in events)
      os.write(control_w,b'tool\n');pump(lambda:any('settled' in e for e in events) and has('你 › 草稿a中b'))
      screen=Screen(columns);screen.feed(raw.decode());assert '你 › 草稿a中b' in screen.text(),screen.text()
      (directory/'after-progress-screen.txt').write_text(screen.text())
      # Cursor remained before b; insertion makes loss/reordering detectable.
      send('Z\r');pump(lambda:len([e for e in events if 'settled' in e])==2)
     else:
      send('\x03');pump(lambda:any(e.get('settled',{}).get('status')=='cancelled' for e in events))
      pump(lambda:raw.rfind('你 › '.encode())>raw.rfind('已取消 (cancelled)'.encode()));send('after\r');pump(lambda:len([e for e in events if 'settled' in e])==2)
     send('\x03')
   pump(lambda:any('exit' in e for e in events));os.close(control_w);control_w=None;child.wait(timeout=5)
   final=next(e for e in events if 'exit' in e);assert final['exit']==0 and final['forbidden']==0
   if mode in ['pre-confirm','idle-exit']:assert final['exchangeCount']==0
   elif mode=='safety':
    assert final['exchangeCount']==2
    decoded=raw.decode();assert not re.search(r'HIDDEN_|\x1b\]|\x1b\[2J|[\x00-\x09\x0b-\x0c\x0e-\x1a\x1c-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u2028\u2029]',decoded)
    assert '正常中文' in decoded and r'\u001b]52' in decoded and '│ 已完成' in decoded
   else:
    tasks=[next(m for m in reversed(r['context']['messages']) if m['role']=='user')['content'][0]['text'] for r in final['requests']]
    assert tasks==(['first 中文','first 中文','草稿a中Zb'] if mode=='busy' else ['first 中文','after']),tasks
    assert len([e for e in events if 'settled' in e])==2
   (directory/'transcript.bin').write_bytes(raw);(directory/'transcript.txt').write_text(raw.decode());(directory/'events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n');reports.append({'columns':columns,'rows':rows,'mode':mode,'exit':child.returncode,'exchangeCount':final['exchangeCount']})
  finally:
   if child.poll() is None:child.kill();child.wait()
   for fd in [master,event_r,control_w]:
    if fd is not None:os.close(fd)
(a.output/'summary.json').write_text(json.dumps(reports,indent=2)+'\n')
print('PASS actual 80x24/40x12 PTYs: draft/cursor, barrier-driven busy Enter, cancellation, confirmation, idle exit')
