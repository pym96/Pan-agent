#!/usr/bin/env python3
"""Offline source/caption/timing check; no agent execution. Creates frame samples."""
import pathlib,sys,json,hashlib,subprocess
from decimal import Decimal
from PIL import Image,ImageDraw,ImageFont
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);here=pathlib.Path(__file__).parent
plan=json.loads((here/'wal-caption-map.json').read_text());old=json.loads((here/'wal-edit-map.json').read_text());video=out/'pan-agent-wal-captioned.mp4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source_manifest=json.loads((source/'artifact-manifest.json').read_text());assert all(sha(source/f['path'])==f['sha256'] for f in source_manifest['files'])
assert len(plan['scenes'])==len(old['scenes'])==11
font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',28);draw=ImageDraw.Draw(Image.new('RGB',(1920,1080)))
def stamp(sec):
 ms=int(Decimal(str(sec))*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000);return f'{h:02}:{m:02}:{s:02},{ms:03}'
expected=[];frames=[];end=0
for i,(a,b) in enumerate(zip(plan['scenes'],old['scenes'])):
 for k in ['capture','start','end','speed','crop','label']:assert a.get(k)==b.get(k),(i,k)
 assert a['outputStart']==round(end,3);end+=round((a['end']-a['start'])/a['speed'],3);assert a['outputEnd']==round(end,3)
 assert len(a['caption'])==2
 assert all(draw.textlength(t,font=font)<=1792 for t in a['caption'])
 expected.append(f'{i+1}\n{stamp(a["outputStart"])} --> {stamp(a["outputEnd"])}\n'+'\n'.join(a['caption']))
 for label,t in [('start',a['outputStart']),('mid',(a['outputStart']+a['outputEnd'])/2),('end',a['outputEnd']-.1)]:
  p=out/f'scene-{i+1:02}-{label}.png';subprocess.run(['ffmpeg','-y','-loglevel','error','-ss',str(round(t,3)),'-i',str(video),'-frames:v','1',str(p)],check=True);frames.append(str(p.name))
assert video.with_suffix('.srt').read_text(encoding='utf-8')=='\n\n'.join(expected)+'\n'
subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size','-show_entries','stream=width,height,r_frame_rate','-of','json',str(video)]))
assert float(probe['format']['duration'])==round(end,3)
contact=Image.new('RGB',(960,540*6),'#090f18')
for i in range(11):contact.paste(Image.open(out/f'scene-{i+1:02}-mid.png').resize((480,270)),((i%2)*480,(i//2)*540))
# Separate header strips make all Chinese captions legible at contact-sheet width.
for i in range(11):contact.paste(Image.open(out/f'scene-{i+1:02}-mid.png').crop((0,0,1920,128)).resize((960,64)),(0,(i//2)*540+270+(i%2)*100))
contact.save(out/'contact-sheet.png')
report={'sourceFilesVerified':len(source_manifest['files']),'originalCaptureMappingsUnchanged':True,'scenes':11,'srtExactTextAndTimingMatch':True,'captionWidthChecks':22,'sampleFrames':frames,'decode':'passed','probe':probe,'runtimeOrAgentLaunched':False}
(out/'checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
