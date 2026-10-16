#!/usr/bin/env python3
"""Render only retained PTY events according to explicit edit-map; no invented UI."""
import pathlib,json,sys,subprocess,math,hashlib
from decimal import Decimal
import pyte
from PIL import Image,ImageDraw,ImageFont
root=pathlib.Path(sys.argv[1]);plan=json.loads(pathlib.Path(sys.argv[2]).read_text());output=pathlib.Path(sys.argv[3]);W,H=1920,1080;fps=10
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',20);label=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',22);small=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',17)
caption_font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',28)
CW,CH=12,24;TW,TH=120*CW,38*CH
palette={'default':'#dce6f0','black':'#121a24','red':'#ff7b86','green':'#a6df8c','brown':'#edc67e','blue':'#84b8ff','magenta':'#d6a4f7','cyan':'#80d9cf','white':'#e4eaf3'}
proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(fps),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],stdin=subprocess.PIPE)
for scene in plan['scenes']:
 lines=(root/scene['capture']).read_text().splitlines();header=json.loads(lines[0]);events=[json.loads(x) for x in lines[1:]];screen=pyte.Screen(header['width'],header['height']);stream=pyte.Stream(screen);idx=0
 duration=(scene['end']-scene['start'])/scene.get('speed',1);n=max(1,round(duration*fps));cached_key=None;cached_img=None
 for frame in range(n):
  t=scene['start']+frame/fps*scene.get('speed',1)
  while idx<len(events) and events[idx][0]<=t:
   if events[idx][1]=='o':stream.feed(events[idx][2])
   idx+=1
  key=hashlib.sha256('\n'.join(screen.display).encode()).digest()
  if key!=cached_key:
   term=Image.new('RGB',(TW,TH),'#111a25');d=ImageDraw.Draw(term)
   for y,line in enumerate(screen.display):
    for x,ch in enumerate(line):
     if ch!=' ':d.text((x*CW,y*CH),ch,font=font,fill=palette.get(screen.buffer[y][x].fg,'#dce6f0'))
   cached_key=key;cached_img=term
  im=Image.new('RGB',(W,H),'#090f18');d=ImageDraw.Draw(im)
  d.text((64,18),'PAN AGENT  /  DATABASE RECOVERY  /  '+str(plan['scenes'].index(scene)+1).zfill(2),font=label,fill='#e4eef8')
  for row,text in enumerate(scene['caption']):
   assert d.textlength(text,font=caption_font)<=1792, 'caption too wide'
   d.text((64,52+row*35),text,font=caption_font,fill='#e4eef8' if row==0 else '#9bd4f5')
  badge=scene.get('label','LIVE CAPTURE')+('  |  '+str(scene['speed'])+'x' if scene.get('speed',1)!=1 else '')
  d.text((W-650,20),badge,font=small,fill='#abbaca')
  if 'crop' in scene:
   x,y,w,h=scene['crop'];panel=cached_img.crop((x*CW,y*CH,(x+w)*CW,(y+h)*CH));scale=min(1792/panel.width,790/panel.height);panel=panel.resize((round(panel.width*scale),round(panel.height*scale)),Image.Resampling.LANCZOS);px=(W-panel.width)//2;py=150+(790-panel.height)//2;im.paste(panel,(px,py));d.rounded_rectangle((px-5,py-5,px+panel.width+5,py+panel.height+5),radius=8,outline='#5285ab',width=2)
  else:
   overview=cached_img.resize((1368,866),Image.Resampling.LANCZOS);im.paste(overview,((W-1368)//2,136))
  d.text((64,H-43),scene.get('note','Actual installed TUI · model-driven tools · adapted task, not an official benchmark score'),font=small,fill='#aab8c8')
  proc.stdin.write(im.tobytes())
proc.stdin.close();assert proc.wait()==0
def stamp(sec):
 ms=int(Decimal(str(sec))*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000);return f'{h:02}:{m:02}:{s:02},{ms:03}'
srt='\n\n'.join(str(i+1)+'\n'+stamp(sc['outputStart'])+' --> '+stamp(sc['outputEnd'])+'\n'+'\n'.join(sc['caption']) for i,sc in enumerate(plan['scenes']))+'\n'
output.with_suffix('.srt').write_text(srt,encoding='utf-8')
print(output)

