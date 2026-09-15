#!/usr/bin/env python3
"""#60 Criteria 1.1 installed PTY proof: captured drift, both release forms, resize and Ctrl-End."""
import argparse,fcntl,hashlib,importlib.util,json,os,pty,re,select,shutil,signal,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--package',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1];a.output.mkdir()
spec=importlib.util.spec_from_file_location('screen',root/'scripts/fixtures/tui-a/screen.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
columns,rows=120,40
d=a.output;workspace=d/'workspace';workspace.mkdir();memory=d/'memory'
subprocess.run(['/usr/bin/git','init','-q',str(workspace)],check=True)
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,columns,0,0))
driver=d/'driver.mjs';guard=d/'guard.mjs';shutil.copy2(root/'scripts/fixtures/scrollbar/scrollbar-pty-driver.mjs',driver);shutil.copy2(root/'scripts/wo35-consumer-guard.mjs',guard)
consumer=a.package.parent.parent
shutil.copy2(root/'scripts/wo35-consumer-guard.mjs',d/'base-guard.mjs');shutil.copy2(root/'scripts/wo49-consumer-guard.mjs',guard)
config=d/'guard.json';config.write_text(json.dumps({'phase':'scrollbar-pty','consumer':str(consumer),'allowed':[str(consumer),str(d)],'denied':[str(root)],'report':str(d/'guard-report')}))
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
def screen_text(cw=columns,rh=rows):
 s=module.Screen(cw,rh);s.feed(bytes(raw));return s.lines()
def track_glyphs(cw,rh):
 lines=screen_text(cw,rh)
 v=rh-5-1 # composer holds one empty-draft row; no picker in this scenario
 return {y+1:(lines[y][-1] if lines[y] else '') for y in range(1,v+1)}
def first_transcript_line(cw=columns,rh=rows):
 for line in screen_text(cw,rh):
  m=re.search(r'Transcript line (\d+)',line)
  if m:return int(m.group(1))
 return None
# Frozen #60 geometry restated independently in this verifier.
def js_round(x):return int(x+0.5) if x>=0 else -int(-x+0.5) # Math.round: half away from zero
def geometry(n,v,top):
 max_top=max(0,n-v)
 if max_top==0:return None
 size=max(1,min(v,-(-v*v//n)))
 start=max(0,min(v-size,js_round((v-size)*top/max_top)))
 return size,start,max_top
def drag_top(n,v,y):
 g=geometry(n,v,0)
 if g is None:return None
 size,_,max_top=g
 start=max(0,min(v-size,y-2-size//2))
 return 0 if v==size else js_round(start*max_top/(v-size))
def captured_drag_top(n,v,y,grab_offset):
 g=geometry(n,v,0)
 if g is None:return None
 size,_,max_top=g;p=max(0,min(v-1,y-2));start=max(0,min(v-size,p-grab_offset))
 return 0 if v==size else js_round(start*max_top/(v-size))
try:
 until('Write a task')  # #49 prospective startup: no session-wide y.
 # Empty transcript: the track column stays blank (no glyphs).
 glyphs=track_glyphs(columns,rows);assert all(g not in ('█','│') for g in glyphs.values()),glyphs
 deliver('demo\n');until('Completed',60)
 pump(1)
 # Tail follow: final line visible, thumb at the bottom of the track.
 assert any('Transcript line 800' in line for line in screen_text()),'tail must show the final transcript line'
 glyphs=track_glyphs(columns,rows)
 assert set(glyphs.values())<= {'█','│'} and '█' in glyphs.values(),glyphs
 assert glyphs[35]=='█',f'thumb must end at the bottom track row: {glyphs}'
 # Wheel still scrolls (unchanged #62 path): detached reader leaves the tail.
 for i in range(5):deliver('\x1b[<64;10;5M');pump(.12)
 pump(.5)
 assert not any('Transcript line 800' in line for line in screen_text()),'wheel must detach the reader'
 # A press inside the current thumb captures without jumping.
 deliver('\x1b[<0;120;35M');pump(.3)
 assert any('Transcript line 800' in line for line in screen_text()),'thumb press must not jump the viewport'
 deliver('\x1b[<3;120;35m');pump(.2)
 # Primary press at the top of the track jumps to the head and captures.
 deliver('\x1b[<0;120;2M');pump(.5)
 assert any('Transcript line 001' in line for line in screen_text()),'press at track top must reach the head'
 glyphs=track_glyphs(columns,rows);assert glyphs[2]=='█',f'thumb must start at the top track row: {glyphs}'
 # Captured drag tolerates horizontal drift; y is still the terminal-grid coordinate.
 deliver('\x1b[<32;80;18M');pump(.5)
 mid_screen=screen_text()
 assert not any('Transcript line 001' in line for line in mid_screen) and not any('Transcript line 800' in line for line in mid_screen),'mid drag must land mid-transcript'
 # A large vertical overshoot clamps to the tail even while x drifts far from the track.
 deliver('\x1b[<32;1;999999M');pump(.5)
 assert any('Transcript line 800' in line for line in screen_text()),'drag to the track bottom must restore the tail'
 # Apple Terminal-compatible button=0/m release clears capture without repositioning.
 deliver('\x1b[<0;1;999999m');pump(.3)
 # No-motion terminal: press+release without drag reports still positions.
 deliver('\x1b[<0;120;18M');deliver('\x1b[<0;120;18m');pump(.5)
 anchored_line=first_transcript_line()
 assert anchored_line is not None and 1 < anchored_line < 800,f'no-motion press must position mid-transcript: {anchored_line}'
 # Detached resize cycle preserves the anchored source line; the track follows the new final column.
 resize(80,24);pump(.5)
 assert first_transcript_line(80,24)==anchored_line,'resize must preserve the anchored source line'
 glyphs80=track_glyphs(80,24);assert set(glyphs80.values())<= {'█','│'} and '█' in glyphs80.values(),glyphs80
 resize(40,12);pump(.5);resize(120,40);pump(1)
 assert first_transcript_line()==anchored_line,'resize round trip must preserve the anchored source line'
 # Ctrl-End restores tail follow.
 deliver('\x1b[1;5F');pump(1)
 assert any('Transcript line 800' in line for line in screen_text()),'Ctrl-End must return to the tail'
 deliver(':exit\n');until('Pan closed',15)
finally:
 # Keep draining the PTY while waiting: the child's final guard-report writes
 # block if the master buffer is full, which otherwise looks like a hang.
 deadline=time.monotonic()+30
 while child.poll() is None and time.monotonic()<deadline:pump(.5)
 if child.poll() is None:child.kill()
 code=child.wait()
report=json.loads((d/'scrollbar-report.json').read_text())
mouse=report['mouseTimings']
press=[m for m in mouse if m['action']=='press'];drags=[m for m in mouse if m['action']=='drag'];releases=[m for m in mouse if m['action']=='release']
assert len(press)>=2 and len(drags)>=2 and len(releases)>=2,(len(press),len(drags),len(releases))
thumb_press=press[0]
assert thumb_press['y']==35 and thumb_press['follow'] is True and thumb_press['dragging'] is True,thumb_press
first_press=next(m for m in press if m['y']==2)
assert first_press['top']==0 and first_press['follow'] is False and first_press['dragging'] is True,first_press
mid_drag=drags[0]
initial_geometry=geometry(mid_drag['rows'],mid_drag['bodyHeight'],0)
expected=captured_drag_top(mid_drag['rows'],mid_drag['bodyHeight'],18,initial_geometry[0]//2)
assert mid_drag['top']==expected,(mid_drag,expected)
tail_drag=drags[1]
assert tail_drag['y']==999999 and tail_drag['top']==tail_drag['rows']-tail_drag['bodyHeight'] and tail_drag['follow'] is True and tail_drag['newOutput'] is False,tail_drag
for r in releases:assert r['dragging'] is False,r
# View-only interactions never rebuild the cached layout and stay within the visit bound.
drag_sequence=[m for m in mouse if m['bodyHeight']==34][:4]
for prev,cur in zip(drag_sequence,drag_sequence[1:]):
 assert cur['builds']==prev['builds'],(prev,cur)
 assert cur['visits']-prev['visits']<=2*34+8,(prev,cur)
for report_file in sorted(d.glob('guard-report*.json')):
 meters=json.loads(report_file.read_text())
 for key in ['forbidden_resolution','forbidden_filesystem','network_attempts','real_credential_reads','real_provider_calls','balance_queries','paid_formal_runs','cost_cny']:assert meters[key]==0,(report_file,key,meters[key])
samples=[round(m['ms'],3) for m in mouse]
ordered=sorted(samples);p95=ordered[min(len(ordered)-1,int(len(ordered)*.95))] if ordered else None
summary={'mouse_samples_ms':samples,'p95_ms':p95,'drag_sequence_builds_constant':True,'dimensions':report['dimensions'],'entries':report['entries'],'follow_final':report['follow'],'dragging_final':report['dragging'],'wheel_reports':len(report['wheelTimings']),'guard_meters':'all zero','pty_raw_sha256':hashlib.sha256(bytes(raw)).hexdigest(),'pty_raw_path':str(d/'terminal-output.pty')}
(d/'scrollbar-pty-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
print('PASS installed scrollbar PTY: captured horizontal drift, y clamp, both release forms, no-motion press positioning, resize anchor, Ctrl-End, zero meters')
