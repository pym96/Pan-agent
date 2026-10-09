"""Capture one auxiliary replay in a private PTY, then export only its safe projection.
No desktop/microphone/camera access. No arbitrary command or live-run launcher.
"""
import argparse, errno, fcntl, json, os, pathlib, pty, struct, subprocess, termios, time
p=argparse.ArgumentParser();p.add_argument('--entry',required=True);p.add_argument('--archive',required=True);p.add_argument('--run-id',required=True);p.add_argument('--output',required=True);a=p.parse_args()
o=pathlib.Path(a.output);o.mkdir(parents=True,exist_ok=False)
script=pathlib.Path(__file__).resolve().parent
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0))
env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin','TERM':'dumb','WO58_GUARD_LOG':str(o/'guard.json')}
cmd=['/opt/homebrew/bin/node','--require',str(script/'offline-guard.cjs'),str(script/'replay.mjs'),a.entry,a.archive,a.run_id]
start=time.monotonic();child=subprocess.Popen(cmd,stdin=subprocess.DEVNULL,stdout=slave,stderr=slave,env=env);os.close(slave)
chunks=[]
while True:
 try:b=os.read(master,65536)
 except OSError as exc:
  if exc.errno==errno.EIO:break
  raise
 if not b:break
 chunks.append({'seconds':time.monotonic()-start,'text':b.decode('utf8')})
os.close(master);code=child.wait();(o/'pty.json').write_text(json.dumps({'argv':cmd,'exitCode':code,'chunks':chunks},indent=2))
if code:raise SystemExit(code)
result=json.loads(''.join(c['text'] for c in chunks));(o/'projection.json').write_text(json.dumps(result,indent=2))
lines=['PAN | AUXILIARY TRACE REPLAY','OFFLINE PREPARATION - HISTORICAL RUN','PTY capture rendered to MP4; not native TUI or live demo','run '+result['runId'],'']
for e in result['events']:
 lines.append(f"event {e['sequence']:02d}  {e['type']}"+('  '+e['terminal'] if 'terminal' in e else ''))
lines+=['','All free-form payloads withheld. No private reasoning.','Official score is not inferred from archive terminal.','Zero model requests / zero tool execution.']
(o/'frame.txt').write_text('\n'.join(lines))
font='/System/Library/Fonts/Menlo.ttc'
# Paths are filter syntax, not shell commands. Reject unsupported escaping.
if any(c in str(o) for c in "':,[]\\"):raise ValueError('unsupported filter path')
filter_arg=f"drawtext=fontfile={font}:textfile={o/'frame.txt'}:fontcolor=white:fontsize=26:x=48:y=35:line_spacing=8:expansion=none"
ff=['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x132128:s=1280x900:r=15:d=8','-vf',filter_arg,'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(o/'offline-sample.mp4')]
subprocess.run(ff,check=True,env=env)
probe=subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(o/'offline-sample.mp4')],env=env)
(o/'ffprobe.json').write_bytes(probe)
subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(o/'offline-sample.mp4'),'-f','null','-'],check=True,env=env)
print(json.dumps({'capturedPty':True,'exitCode':code,'events':len(result['events']),'mp4Decode':'passed','audio':False}))
