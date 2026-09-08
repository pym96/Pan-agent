#!/usr/bin/env python3
"""Criteria 1.1 R-KEYS/R-SUBMIT: actual installed PTY cells and individually delivered keys."""
import argparse,fcntl,hashlib,importlib.util,json,os,pty,select,shutil,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--package',type=Path);p.add_argument('--guard',type=Path);a=p.parse_args();root=Path(__file__).resolve().parents[1];a.output.mkdir()
spec=importlib.util.spec_from_file_location('screen',root/'scripts/fixtures/file-repair-screen.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);Screen=module.Screen
reports=[]
for columns in [40,80]:
 for mode in ['keys','submit']:
  directory=a.output/f'{columns}-{mode}';directory.mkdir();workspace=directory/'workspace';workspace.mkdir();memory=directory/'memory';subprocess.run(['git','init','-q',str(workspace)],check=True)
  files={name:''.join('synthetic preview line %02d\n'%i for i in range(60)) for name in ['e-first.txt','e-second.txt','e-third.txt']}
  for name,body in files.items():(workspace/name).write_text(body)
  (directory/'fixture.json').write_text(json.dumps({'files':{name:{'sha256':hashlib.sha256(body.encode()).hexdigest(),'bytes':len(body.encode())} for name,body in files.items()},'columns':columns,'rows':24,'mode':mode},indent=2)+'\n')
  control_r,control_w=os.pipe();event_r,event_w=os.pipe();env={'PATH':str(Path(a.node).parent)+':/usr/bin:/bin','HOME':str(directory),'LANG':'en_US.UTF-8','TERM':'xterm-256color','NODE_NO_WARNINGS':'1'}
  driver=root/'scripts/fixtures/file-repair-driver.mjs'
  if a.package:
   verification=a.package.parent.parent/'verification';driver=verification/'file-repair-driver.mjs';shutil.copy2(root/'scripts/fixtures/file-repair-driver.mjs',driver)
  if a.guard:
   config=directory/'guard-config.json';config.write_text(json.dumps({'phase':directory.name,'consumer':str(a.package.parent.parent),'allowed':[str(a.package.parent.parent),str(directory)],'denied':[str(root)],'report':str(directory/'guard-report')}));env.update(NODE_OPTIONS='--import='+str(a.guard),WO35_GUARD_CONFIG=str(config))
  master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',24,columns,0,0))
  command=[a.node,*([] if a.package else ['--experimental-strip-types']),str(driver),str(a.package or root),str(workspace),str(memory),str(control_r),str(event_w),mode]
  child=subprocess.Popen(command,stdin=slave,stdout=slave,stderr=slave,env=env,cwd=a.package.parent.parent if a.package else root,pass_fds=(control_r,event_w));os.close(slave);os.close(control_r);os.close(event_w)
  raw=bytearray();pending=bytearray();events=[];screen=Screen(columns);trace=[];snapshots=[];negatives=[];counter=0
  def pump(predicate):
   deadline=time.monotonic()+15
   while not predicate():
    assert time.monotonic()<deadline,('deadline',directory.name,events[-2:],bytes(raw)[-1500:])
    for fd in select.select([master,event_r],[],[],.1)[0]:
     try:data=os.read(fd,65536)
     except OSError:data=b''
     if fd==master:
      raw.extend(data);screen.feed(data)
     else:
      pending.extend(data)
      while b'\n' in pending:
       line,_,rest=pending.partition(b'\n');pending[:]=rest;events.append(json.loads(line))
  def stable(event):pump(lambda:len(raw)>=event['state']['outputBytes']);return event['state']
  def latest():return events[-1]['state'] if events else {}
  def record(label,s):snapshots.append({'label':label,'state':s,'screen':screen.snapshot(),'raw_bytes':len(raw)})
  def control(value):
   start=len(events);os.write(control_w,(value+'\n').encode());pump(lambda:any(e.get('control')==value for e in events[start:]));event=next(e for e in events[start:] if e.get('control')==value);return stable(event)
  def checkpoint(label,predicate=lambda s:True):
   deadline=time.monotonic()+15
   while True:
    s=control('checkpoint-'+str(len(trace))+'-'+label)
    if predicate(s):record(label,s);return s
    assert time.monotonic()<deadline,('state deadline',label,s)
  def key(text,label=None):
   before=latest().get('keyCount',0);os.write(master,text.encode());pump(lambda:any(e.get('key') is not None and e['state']['keyCount']>before for e in events));event=next(e for e in events if e.get('key') is not None and e['state']['keyCount']>before);s=stable(event);trace.append({'input':text,'label':label,'state':s,'screen':screen.snapshot()});return s
  def typing(text):
   for c in text:key(c)
  def qkey(text,query,cursor,total,chosen=None,label=None):
   s=key(text,label);assert s['query']==query and s['cursor']==cursor,(label,s,query,cursor);assert s['admissions']==s['exchanges']==0,s
   screen.query(query,cursor,total)
   if chosen is not None:assert s['chosen']==chosen,s;screen.selection(chosen)
   return s
  def composer_hint(expected,draft=''):screen.hint('Not submitted · '+expected,draft)
  def choose(query='e'):
   key('@');typing(query);checkpoint('picker-ready',lambda s:not s['loading']);key('\r');return checkpoint('selected',lambda s:s['query'] is None)
  def command(text):
   key('\x15');typing(text);key('\r');s=checkpoint(text,lambda s:any(l.startswith('You >') for l in screen.lines()));composer_hint('Write a task');return s
  try:
   pump(lambda:b'[y/N]> ' in raw);typing('y');key('\r');checkpoint('confirmed');composer_hint('Write a task')
   typing('review ')
   if mode=='keys':
    control('gate-listing');key('@');pump(lambda:any(e.get('barrier')=='listing' for e in events));qkey('e','e',1,1);qkey('\t','e',1,1);qkey('\r','e',1,1);assert latest()['opens']==0
    control('release-listing');checkpoint('listing-complete',lambda s:not s['loading']);screen.query('e',1,1);screen.selection('e-first.txt')
    qkey('\t','e',1,1,'e-second.txt','original-e-Tab');qkey('\t','e',1,1,'e-third.txt');qkey('\t','e',1,1,'e-third.txt','last-boundary');qkey('\x1b[Z','e',1,1,'e-second.txt');qkey('\x1b[A','e',1,1,'e-first.txt');qkey('\x1b[A','e',1,1,'e-first.txt','first-boundary')
    qkey('\x1b[B','e',1,1,'e-second.txt');qkey('\x1b[D','e',0,1,'e-second.txt','cursor-preserves-selection');qkey('中','中e',1,2);qkey('\x7f','e',0,1,'e-first.txt');qkey('\x1b[F','e',1,1,'e-first.txt');qkey('\x7f','',0,0,'e-first.txt')
    for text,query,cursor,total in [('中','中',1,1),('e','中e',2,2),('\u0301','中e\u0301',2,2),('👩','中e\u0301👩',3,3),('\u200d','中e\u0301👩‍',3,3),('💻','中e\u0301👩‍💻',3,3)]:qkey(text,query,cursor,total)
    qkey('\x1b[D','中e\u0301👩‍💻',2,3);qkey('\x7f','中👩‍💻',1,2);qkey('宽','中宽👩‍💻',2,3);qkey('\x1b[C','中宽👩‍💻',3,3);qkey('\x7f','中宽',2,2)
    for text in ['\x1b[3~','\x1bOP','\x1b[6~','\t','\x1b[Z']:qkey(text,'中宽',2,2,None,'unknown-or-no-match')
    qkey('\x1b[H','中宽',0,2);qkey('\x1b[C','中宽',1,2);qkey('\x7f','宽',0,1);qkey('\x1b[F','宽',1,1);qkey('\x7f','',0,0,'e-first.txt')
    control('fault-selection-on');s=key('\t');assert s['chosen']=='e-second.txt' and s['query']==''
    try:screen.selection('e-second.txt');raise RuntimeError('wrong display escaped oracle')
    except AssertionError:negatives.append({'name':'correct-internal-wrong-visible-selection','state':s,'screen':screen.snapshot()})
    control('fault-selection-off');qkey('\x1b[A','',0,0,'e-first.txt')
    # Cancel a captured read whose completion is held; later release cannot add an attachment.
    control('gate-capture');key('\r');pump(lambda:any(e.get('barrier')=='capture' for e in events));s=checkpoint('capture-held');assert s['capturing'] and not s['attachments'];reads=s['reads']
    s=key('\t');assert s['reads']==reads and s['capturing'];key('\r');key('\x03');control('release-capture');s=checkpoint('late-capture-cancelled');assert not s['attachments'] and s['admissions']==s['exchanges']==0 and s['reads']==reads
    # Listing cancellation and literal Escape each retain the composer without admitting a task.
    control('gate-listing');key('@');pump(lambda:latest().get('loading'));key('e');key('\x03');control('release-listing');checkpoint('listing-cancelled',lambda s:s['query'] is None)
    key('@');key('e');key('\x1b');s=checkpoint('literal-escape');assert s['draft']=='review @e' and not s['attachments'];key('\x7f');key('\x7f')
    s=choose();assert len(s['attachments'])==1;composer_hint('Enter Send','review ');assert s['admissions']==s['exchanges']==0
   else:
    s=choose();assert len(s['attachments'])==1;composer_hint('Enter Send','review ');key('\x10');s=checkpoint('long-inline-preview');composer_hint('Enter Send','review ');assert screen.snapshot()['scrollback_rows']>24
    # A hint in earlier scrollback is insufficient: suppress only the actual rendered hint.
    assert b'Not submitted' in raw;control('fault-hint-on');key('\x10');s=checkpoint('missing-visible-hint')
    try:composer_hint('Enter Send','review ');raise RuntimeError('missing prompt hint escaped oracle')
    except AssertionError:negatives.append({'name':'old-scrollback-hint-current-missing','state':s,'screen':screen.snapshot(),'old_hint_present_in_raw':True})
    control('fault-hint-off');key('\x10');checkpoint('preview-restored');composer_hint('Enter Send','review ')
    choose();composer_hint('Enter Send','review ');key('\x12');checkpoint('removed');composer_hint('Enter Send','review ');s=choose();assert len(s['attachments'])==1
    s=command(':preview');assert len(s['attachments'])==1 and s['draft']=='';s=command(':details');assert 'No submitted run yet' in '\n'.join(screen.lines());s=command(':runs');assert 'No submitted run yet' in '\n'.join(screen.lines())
    key('\r');s=checkpoint('blank-with-attachment');composer_hint('Write a task');assert s['admissions']==s['exchanges']==0 and len(s['attachments'])==1 and not list((memory/'runs').iterdir())
    typing('review ');s=checkpoint('nonblank-ready');composer_hint('Enter Send','review ')
   key('\r');pump(lambda:any(e.get('barrier')=='model' for e in events));s=checkpoint('one-explicit-send');assert s['admissions']==s['exchanges']==1 and len(list((memory/'runs').iterdir()))==1
   if mode=='submit':
    typing('next draft');s=checkpoint('busy-draft');composer_hint('Busy','next draft');key('\r');s=checkpoint('busy-enter');assert s['admissions']==s['exchanges']==1;composer_hint('Busy','next draft')
    key('\x03');s=checkpoint('cancelled-retains-draft',lambda s:len(s['results'])==1);assert s['results'][0]['status']=='cancelled';composer_hint('Enter Send','next draft');control('release-model');s=checkpoint('late-model-does-not-submit');assert s['admissions']==s['exchanges']==1
    key('\r');s=checkpoint('next-explicit-send',lambda s:len(s['results'])==2);assert s['admissions']==s['exchanges']==2
   else:control('release-model');s=checkpoint('completed',lambda s:len(s['results'])==1);assert s['results'][0]['status']=='completed'
   run=s['results'][0]['runId'];before_calls=s['exchanges'];archive=memory/'runs'/run/'events.jsonl';before_hash=hashlib.sha256(archive.read_bytes()).hexdigest();records=[json.loads(line)['record'] for line in archive.read_text().splitlines()];task=next(r['task'] for r in records if r.get('type')=='run.started');payload=json.loads(task.split('\n',1)[1]);assert payload['prompt']=='review ' and payload['attachments'][0]['path']=='e-first.txt' and payload['attachments'][0]['text']==files['e-first.txt']
   command(':replay '+run);s=command(':details');assert s['exchanges']==before_calls and hashlib.sha256(archive.read_bytes()).hexdigest()==before_hash
   key('\x15');typing(':exit');key('\r');pump(lambda:any('exit' in e for e in events));os.close(control_w);control_w=None;child.wait(timeout=5);assert child.returncode==0
   report=json.loads((directory/'report.json').read_text());assert report['admissions']==report['exchanges']==(1 if mode=='keys' else 2)
   if a.guard:
    guard_files=list(directory.glob('guard-report*.json'));assert guard_files
    for file in guard_files:
     guard=json.loads(file.read_text());assert all(guard[k]==0 for k in ['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny'])
   reports.append({'case':directory.name,'admissions':report['admissions'],'exchanges':report['exchanges'],'independent_keys':len(trace),'screens':len(snapshots),'negative_controls':len(negatives),'archive':str(archive),'archive_sha256':before_hash})
  finally:
   for name,data in [('events',events),('input-trace',trace),('screens',snapshots),('negative-controls',negatives)]: (directory/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
   (directory/'transcript.bin').write_bytes(raw);(directory/'transcript.txt').write_text(raw.decode(errors='backslashreplace'))
   if child.poll() is None:child.kill();child.wait()
   for fd in [master,event_r,control_w]:
    if fd is not None:os.close(fd)
for name,mode in [('R-KEYS','keys'),('R-SUBMIT','submit')]: (a.output/(name+'.json')).write_text(json.dumps({'criteria_version':'1.1','name':name,'cases':[r for r in reports if r['case'].endswith(mode)],'oracle':'actual bounded VT cells and cursor; raw output / input / state retained; display-only negative injection'},indent=2)+'\n')
print('PASS four real-PTY repair cases, separate physical key delivery, bounded screen oracles and four display-only negative controls')
