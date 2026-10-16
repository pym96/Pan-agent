#!/usr/bin/env python3
"""Record the installed public CLI directly. No provider/TUI replacement or token pacing."""
import os,sys,json,pathlib,pty,fcntl,termios,struct,subprocess,time,select,codecs,hashlib,datetime
import pyte
root=pathlib.Path(sys.argv[1]).resolve();out=root/'capture';out.mkdir()
for name in ['workspace','archives','home/.pan-agent']:(root/name).mkdir(parents=True,exist_ok=True)
(root/'home/.pan-agent/settings.json').write_text(json.dumps({'schemaVersion':1,'provider':'kimi-code','modelId':'k3-256k','thinkingLevel':'high','credentialSource':'environment'})+'\n')
prompt='Please answer directly in text only. Do not call any tools, inspect files, run commands, or change anything. Write a friendly bilingual Markdown mini-guide titled "Readable terminal reports / 清晰的终端报告". Use four short sections with # and ## headings, a three-item bullet list with **bold** labels, a numbered list, inline code, and one fenced python code example (about six lines). Explain the example in Chinese and English. Aim for roughly 500 Chinese characters plus 200 English words, so a reader can watch the answer arrive progressively. End with a brief summary. This is a harmless formatting demonstration, not an instruction to execute the example.'
(root/'prompt.txt').write_text(prompt+'\n');assert os.environ.get('KIMI_API_KEY'),'credential unavailable'
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',38,120,0,0));screen=pyte.Screen(120,38);stream=pyte.Stream(screen);decoder=codecs.getincrementaldecoder('utf8')('replace')
env=os.environ.copy();env.pop('NO_COLOR',None);env.update(HOME=str(root/'home'),TERM='xterm-256color',LANG='en_US.UTF-8')
command=['node',str(root/'consumer/node_modules/pan-agent/bin/pan-agent.mjs'),'--kernel','native','--workspace',str(root/'workspace'),'--memory-root',str(root/'archives')]
proc=subprocess.Popen(command,stdin=slave,stdout=slave,stderr=slave,env=env,close_fds=True);os.close(slave);start=time.monotonic();utc=datetime.datetime.now(datetime.timezone.utc).isoformat();raw=open(out/'terminal.raw','wb');cast=open(out/'terminal.cast','w');cast.write(json.dumps({'version':2,'width':120,'height':38,'title':'Actual installed Pan v0.1.4 / live Kimi streaming'})+'\n');actions=[];checks=[]
def elapsed():return round(time.monotonic()-start,6)
def pump(sec):
 end=time.monotonic()+sec
 while time.monotonic()<end:
  if select.select([master],[],[],.03)[0]:
   try:b=os.read(master,65536)
   except OSError:return
   if not b:return
   raw.write(b);raw.flush();t=decoder.decode(b);stream.feed(t);cast.write(json.dumps([elapsed(),'o',t],ensure_ascii=False)+'\n');cast.flush()
def send(s,label):
 actions.append({'time':elapsed(),'label':label,'input':s})
 try:os.write(master,s.encode())
 except OSError:return
 pump(.1)
def records():
 files=list((root/'archives/runs').glob('*/events.jsonl'))
 if not files:return []
 result=[]
 for line in files[0].read_text().splitlines():
  try:result.append(json.loads(line).get('record',json.loads(line)))
  except json.JSONDecodeError:pass
 return result
def snap(name):
 (out/(name+'.txt')).write_text('\n'.join(screen.display));checks.append({'time':elapsed(),'name':name,'settledRecords':sum(x.get('type')=='model.turn_settled' for x in records()),'terminalRecords':sum(x.get('type')=='run.terminal' for x in records())})
pump(1.5);send('\x1b[200~'+prompt+'\x1b[201~','draft text-only request');pump(1);send('\r','single submit')
settled=False;first=False;lastsnap=-100;reason=None
while proc.poll() is None and time.monotonic()-start<300:
 pump(.06);text='\n'.join(screen.display);events=records()
 if 'Approval required' in text:send('\x07','deny unexpected approval')
 if any(x.get('type')=='tool.started' for x in events):reason='unexpected tool request';send('\x03','cancel unexpected tool request');break
 if 'Responding' in text and '▌' in text:
  if not first:snap('first-streaming-markdown');first=True
  if elapsed()-lastsnap>2:snap('streaming-'+str(len(checks)));lastsnap=elapsed()
 manifests=list((root/'archives/runs').glob('*/manifest.json'))
 if manifests:
  try:
   if json.loads(manifests[0].read_text()).get('settled_state') in ['terminal','failed','cancelled','interrupted']:settled=True;break
  except json.JSONDecodeError:pass
if not settled and proc.poll() is None:reason=reason or 'recorder deadline';send('\x03','cancel recorder deadline');pump(3)
pump(2);snap('final');send('\x1b[5~','view earlier response');pump(1);snap('final-earlier');send('\x1b[5~','view first section');pump(1);snap('final-first');send(':exit','exit draft');send('\r','exit submit');pump(1)
if proc.poll() is None:send('\x04','exit fallback');pump(1)
if proc.poll() is None:proc.terminate()
code=proc.wait(timeout=5);raw.close();cast.close()
report={'command':command,'mode':'direct installed CLI / actual Kimi','startUtc':utc,'durationSeconds':elapsed(),'exitCode':code,'settled':settled,'sawStreamingMarkdown':first,'reason':reason,'checkpoints':checks,'actions':actions,'node':subprocess.check_output(['node','--version'],text=True).strip(),'platform':sys.platform,'packageSha256':hashlib.sha256((root/'download/pan-agent-0.1.4.tgz').read_bytes()).hexdigest()}
(out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'exitCode':code,'settled':settled,'sawStreamingMarkdown':first,'reason':reason}))
