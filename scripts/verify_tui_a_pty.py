#!/usr/bin/env python3
"""Installed Product PTY inputs with a separate VT grid oracle and held Faux/filesystem barriers."""
import signal
import argparse,fcntl,hashlib,importlib.util,json,os,pty,select,shutil,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--package',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1];a.output.mkdir()
spec=importlib.util.spec_from_file_location('screen',root/'scripts/fixtures/tui-a/screen.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
reports=[]
for columns,rows in [(120,40),(80,24),(40,12)]:
 d=a.output/f'{columns}x{rows}';d.mkdir();workspace=d/'workspace';workspace.mkdir();memory=d/'memory'
 subprocess.run(['/usr/bin/git','init','-q',str(workspace)],check=True)
 files={'example 中文.txt':'SNAPSHOT original\n','one/same.txt':'ONE\n','two/same.txt':'TWO\n','evil\x1b[2J\u202e.txt':'CONTENT\x1b]52;c;YQ==\x07\r\u0085\u202e\u2028\u2029\n'}
 for name,body in files.items():q=workspace/name;q.parent.mkdir(exist_ok=True);q.write_text(body)
 control_r,control_w=os.pipe();event_r,event_w=os.pipe();master,slave=pty.openpty();before=termios.tcgetattr(slave);fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,columns,0,0))
 driver=d/'driver.mjs';guard=d/'guard.mjs';shutil.copy2(root/'scripts/fixtures/tui-a/driver.mjs',driver);shutil.copy2(root/'scripts/wo35-consumer-guard.mjs',guard);config=d/'guard.json';consumer=a.package.parent.parent
 config.write_text(json.dumps({'phase':d.name,'consumer':str(consumer),'allowed':[str(consumer),str(d)],'denied':[str(root)],'report':str(d/'guard-report')}))
 env={'PATH':str(Path(a.node).parent)+':/usr/bin:/bin','HOME':str(d),'TERM':'xterm-256color','LANG':'en_US.UTF-8','NODE_NO_WARNINGS':'1','NODE_OPTIONS':'--import='+str(guard),'WO35_GUARD_CONFIG':str(config),'PAN_SYNTHETIC_API_KEY':'TUI_A_ENV_CANARY_NOT_PUBLIC'}
 child=subprocess.Popen([a.node,str(driver),str(a.package),str(workspace),str(memory),str(control_r),str(event_w)],stdin=slave,stdout=slave,stderr=slave,cwd=consumer,env=env,pass_fds=(control_r,event_w));os.close(control_r);os.close(event_w)
 raw=bytearray();pending=bytearray();events=[];screens=[];screen=module.Screen(columns,rows);steps=[]
 def pump(fn):
  deadline=time.monotonic()+15
  while not fn():
   assert time.monotonic()<deadline,('deadline',d,events[-1:] if events else [],bytes(raw)[-700:])
   for fd in select.select([master,event_r],[],[],.05)[0]:
    try:data=os.read(fd,65536)
    except OSError:data=b''
    if fd==master:raw.extend(data);screen.feed(data)
    else:
     pending.extend(data)
     while b'\n' in pending:
      line,_,rest=pending.partition(b'\n');pending[:]=rest;events.append(json.loads(line))
 def latest():return events[-1]['state'] if events else {}
 def control(label):
  start=len(events);os.write(control_w,(label+'\n').encode());pump(lambda:any(e.get('control')==label for e in events[start:]));s=next(e['state'] for e in events[start:] if e.get('control')==label);pump(lambda:len(raw)>=s['outputBytes']);return s
 def checkpoint(label,fn=lambda s:True):
  deadline=time.monotonic()+15
  while True:
   s=control('checkpoint-'+label+'-'+str(len(steps)))
   if fn(s):screens.append({'label':label,'state':s,'screen':screen.snapshot(),'rawBytes':len(raw)});return s
   assert time.monotonic()<deadline,(label,s)
   time.sleep(.01)
 def key(value,fn=lambda s:True,label='key'):
  before=latest().get('keyCount',0);os.write(master,value.encode());pump(lambda:latest().get('keyCount',0)>before);s=checkpoint(label,fn);steps.append({'input':value,'state':s});return s
 def paste(text):
  os.write(master,('\x1b[200~'+text+'\x1b[201~').encode());return checkpoint('paste',lambda s:s.get('draft')==text)
 def choose(query):
  key('@');key(query);checkpoint('picker-ready',lambda s:not s['loading']);key('\r\r');return checkpoint('selected',lambda s:s['query'] is None)
 try:
  checkpoint('initial',lambda s:s.get('phase')=='confirm');key('y');key('\r');checkpoint('idle',lambda s:s['phase']=='idle')
  assert next(i for i,l in enumerate(screen.lines()) if l.startswith('─'))>=1+rows//2;assert len(screen.lines())==rows;assert any(line.startswith('Pan') for line in screen.lines())
  key('review ');control('gate-list');key('@');pump(lambda:any(e.get('barrier')=='listing' for e in events));key('old');key('\x03');control('release-listing');s=checkpoint('stale-list',lambda s:s['query'] is None);assert s['draft']=='review ' and s['entries']==[]
  control('gate-capture');key('@');key('example');checkpoint('capture-ready',lambda s:not s['loading']);key('\r');pump(lambda:any(e.get('barrier')=='capture' for e in events));key('\x03');control('release-capture');s=checkpoint('capture-cancelled');assert s['attachments']==[] and s['draft']=='review '
  choose('example');s=checkpoint('snapshot');assert len(s['attachments'])==1 and s['admissions']==0;screen.confirmed();snapshot=s['attachments'][0];(workspace/'example 中文.txt').write_text('changed after selection')
  key('\x10');s=checkpoint('preview',lambda s:s['overlay'] is not None);assert s['admissions']==0;key('\r\r');s=checkpoint('preview-closed',lambda s:s['overlay'] is None);screen.confirmed();assert s['admissions']==0
  control('fault-on');rejected=False
  try:screen.confirmed()
  except AssertionError:rejected=True
  assert rejected,'visible negative control passed';control('fault-off');screen.confirmed()
  # Literal colon/@ multiline paste is a draft only, including when the entire paste arrives in one write.
  key('\x15');key('\x16');key(':exit @');key('\r');s=checkpoint('safe-edit');assert s['draft']==':exit @\n' and s['query'] is None and s['admissions']==0;key('\x1b');key('\x15');draft='中e\u0301👩‍💻\n@literal\n:exit';s=paste(draft);assert s['admissions']==0 and s['query'] is None;assert s['draft']==draft
  if columns==120:
   fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',8,30,0,0));screen=module.Screen(30,8);os.kill(child.pid,signal.SIGWINCH);time.sleep(.05);key('\r');assert latest()['admissions']==0 and latest()['draft']==draft;assert any('Resize terminal' in x for x in screen.lines())
   fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,columns,0,0));screen=module.Screen(columns,rows);os.kill(child.pid,signal.SIGWINCH);time.sleep(.05);checkpoint('restored-idle')
  key('\r');pump(lambda:any(e.get('barrier')=='model-0' for e in events));s=checkpoint('stream',lambda s:s['phase']=='running');assert s['admissions']==s['exchanges']==1
  draft2='next 中e\u0301👩‍💻\n'+('code @ literal :exit\n'*500);s=paste(draft2);assert s['admissions']==1;assert 0<=screen.row<screen.rows and 0<=screen.col<screen.columns
  key('\r');key('\r');s=checkpoint('busy');assert s['draft']==draft2 and s['admissions']==1;screen.confirmed(True)
  choose('evil');key('\x10');checkpoint('hostile-preview');key('\r');s=checkpoint('busy-attachment');assert s['attachments'][0]['text']==files[next(n for n in files if n.startswith('evil'))];assert s['admissions']==1
  key('\x1b[5~');s=checkpoint('reading');assert not s['follow'];top=s['top'];control('release-model-0');pump(lambda:any(e.get('barrier')=='finish-0' for e in events));s=checkpoint('new-output');assert s['top']==top and s['newOutput'];assert 'New output' in '\n'.join(screen.lines())
  # Resize preserves canonical draft/snapshot; undersized Enter cannot admit.
  if columns==120:
   for cw,rh in [(40,12),(80,24),(30,8),(120,40)]:
    fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rh,cw,0,0));screen=module.Screen(cw,rh);os.kill(child.pid,signal.SIGWINCH);time.sleep(.05);s=checkpoint('resize-'+str(cw));assert s['draft']==draft2 and s['admissions']==1
    if cw<40:key('\r');assert latest()['admissions']==1;assert any('Resize terminal' in x for x in screen.lines())
  key('\x03');key('\x03');s=checkpoint('cancelled',lambda s:s['phase']=='idle');assert s['cancels']==1 and s['admissions']==1 and s['draft']==draft2;assert 'Partial response' in '\n'.join(screen.lines())
  assert len(s['attachments'])==1;key('\x12');assert not latest()['attachments'];assert s['results'][0]['status']=='cancelled';assert s['top']==top or columns==120
  key('\x1b[1;5F');assert latest()['follow']
  # Replace with a manageable next draft, select duplicate names while still never submitting on preview.
  key('\x15');key('second ');choose('one/');choose('two/');s=checkpoint('duplicates');assert len(s['attachments'])==2;assert 'one/same.txt' in '\n'.join(screen.lines()) and 'two/same.txt' in '\n'.join(screen.lines())
  key('\t');assert latest()['focus']=='attachments';key('\r');key('\x1b');checkpoint('focus-restored',lambda s:s['overlay'] is None);assert latest()['admissions']==1
  key('\x1b');key('\r');pump(lambda:any(e.get('barrier')=='model-1' for e in events));control('release-model-1');s=checkpoint('finished',lambda s:s['phase']=='idle');assert s['admissions']==2 and s['results'][-1]['status']=='completed';assert sum(e['text'].count('Next draft received.') for e in s['entries'])==1
  # View-only details/replay cannot change sealed archives or effects.
  def archives():return {str(p.relative_to(memory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in memory.rglob('*') if p.is_file()}
  sealed=archives();key(':details');key('\r');key('\r');key(':runs');key('\r');key('\r');s=checkpoint('view-only');assert s['admissions']==2 and archives()==sealed
  # C-SUM/protocol is irrelevant here; confirm exact selection-time envelope at actual adapter.
  key(':exit');os.write(master,b'\r');pump(lambda:any('exit' in e for e in events));os.close(control_w);control_w=-1;pump(lambda:child.poll() is not None);assert child.returncode==0
  after=termios.tcgetattr(slave);assert before==after,(before,after)
  report=json.loads((d/'report.json').read_text());assert report['contexts'][0]['messages'][-1]['role']=='user';task=report['contexts'][0]['messages'][-1]['content'];assert 'SNAPSHOT original' in json.dumps(task) and 'changed after selection' not in json.dumps(task)
  assert b'TUI_A_ENV_CANARY_NOT_PUBLIC' not in raw;assert screen.modes.get('2004') is False and screen.modes.get('1049') is False and screen.modes.get('25') is True
  reports.append({'viewport':[columns,rows],'result':'PASS','directory':str(d),'snapshot':snapshot,'negativeVisibleConfirmationRejected':rejected,'admissions':report['admissions'],'modesBefore':repr(before),'modesAfter':repr(after)})
 finally:
  (d/'raw.pty').write_bytes(raw);(d/'screens.json').write_text(json.dumps(screens,ensure_ascii=False)+'\n');(d/'steps.json').write_text(json.dumps(steps,ensure_ascii=False)+'\n');(d/'events.json').write_text(json.dumps(events,ensure_ascii=False)+'\n')
  if child.poll() is None:child.kill();child.wait()
  for fd in [master,slave,event_r,control_w]:
   if fd>=0:os.close(fd)
(a.output/'results.json').write_text(json.dumps(reports,indent=2)+'\n');print('PASS installed PTY',len(reports),'viewports')
