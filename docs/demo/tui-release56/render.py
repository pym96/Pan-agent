#!/usr/bin/env python3
"""Render recorded PTY bytes, not a simulated interface. Requires Pillow, pyte, ffmpeg."""
import json,sys,pathlib,subprocess
import pyte
from PIL import Image,ImageDraw,ImageFont
cast=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);lines=cast.read_text().splitlines();head=json.loads(lines[0]);events=[json.loads(x) for x in lines[1:]]
font_path='/System/Library/Fonts/Menlo.ttc';font=ImageFont.truetype(font_path,19);small=ImageFont.truetype(font_path,17)
cols,rows=head['width'],head['height'];cw,ch=12,26;width,height=cols*cw+48,rows*ch+110
screen=pyte.Screen(cols,rows);stream=pyte.Stream(screen);fps=5
proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(fps),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
# Long idle spans compressed to 3s, otherwise preserve timing; capture source remains intact.
last=0
palette={'black':'#18202b','red':'#ff7b86','green':'#a1df8c','brown':'#edc67e','blue':'#83b8ff','magenta':'#d9a2ff','cyan':'#7ddbd6','white':'#dde5ef','default':'#dde5ef'}
def frame():
 im=Image.new('RGB',(width,height),'#101722');d=ImageDraw.Draw(im)
 d.text((24,15),head.get('title','Pan Agent'),font=font,fill='#92cfff')
 d.text((24,44),'Recorded terminal output | idle waits shortened | input automated',font=small,fill='#aab8c9')
 for y in range(rows):
  for x in range(cols):
   cell=screen.buffer[y][x]
   if cell.data and cell.data!=' ':d.text((24+x*cw,82+y*ch),cell.data,font=font,fill=palette.get(cell.fg,'#dde5ef'))
 return im.tobytes()
for t,kind,data in events:
 wait=min(max(t-last,0),3)
 for _ in range(round(wait*fps)):proc.stdin.write(frame())
 if kind=='o':stream.feed(data)
 last=t
for _ in range(3*fps):proc.stdin.write(frame())
proc.stdin.close();assert proc.wait()==0
print(out)
