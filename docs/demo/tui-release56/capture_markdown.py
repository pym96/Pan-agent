#!/usr/bin/env python3
"""Actual PTY offline fixture/replay capture; no synthetic TUI screen."""
import os,sys,json,pathlib,pty,fcntl,termios,struct,subprocess,time,select,codecs
import pyte
from PIL import Image,ImageDraw,ImageFont
installed,root,mode,launcher=sys.argv[1:];root=pathlib.Path(root);out=root/mode;out.mkdir(exist_ok=True)
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',38,120,0,0));screen=pyte.Screen(120,38);stream=pyte.Stream(screen);decoder=codecs.getincrementaldecoder('utf8')('replace')
env={k:v for k,v in os.environ.items() if not any(x in k.upper() for x in ['TOKEN','SECRET','PASSWORD','API_KEY'])};env.pop('NO_COLOR',None);env.update(TERM='xterm-256color',HOME=str(root/'home'),LANG='en_US.UTF-8')
proc=subprocess.Popen(['node',launcher,installed,str(root),mode],stdin=slave,stdout=slave,stderr=slave,env=env);os.close(slave);start=time.monotonic();raw=open(out/'terminal.raw','wb');cast=open(out/'terminal.cast','w');cast.write(json.dumps({'version':2,'width':120,'height':38})+'\n')
def pump(sec):
 end=time.monotonic()+sec
 while time.monotonic()<end:
  if select.select([master],[],[],.05)[0]:
   try:b=os.read(master,65536)
   except OSError:return
   if not b:return
   raw.write(b);t=decoder.decode(b);stream.feed(t);cast.write(json.dumps([round(time.monotonic()-start,3),'o',t],ensure_ascii=False)+'\n')
def send(s):
 try:os.write(master,s.encode())
 except OSError:return
 pump(.3)
def snap(name):
 (out/(name+'.txt')).write_text('\n'.join(screen.display));im=Image.new('RGB',(1560,1040),'#171717');d=ImageDraw.Draw(im)
 font=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',19);latin=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',19);bold=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',19,index=1)
 d.text((25,12),'OFFLINE / SCRIPTED FIXTURE — '+mode,font=font,fill='#a5d9ec')
 emoji=ImageFont.truetype('/System/Library/Fonts/Apple Color Emoji.ttc',20)
 colors={'default':'#e6e6e6','cyan':'#00d7d7','white':'#e6e6e6','black':'#171717'}
 for y in range(38):
  for x in range(120):
   c=screen.buffer[y][x];color=colors.get(c.fg,'#'+c.fg if len(c.fg)==6 else '#e6e6e6')
   d.text((25+x*12.5,55+y*25),c.data,font=emoji if c.data and ord(c.data[0])>=0x1f000 else (bold if c.bold else latin) if c.data and ord(c.data[0])<0x2e80 else font,fill=color,embedded_color=True)
 im.save(out/(name+'.png'))
pump(1)
if mode=='live':
 send('Show the offline Markdown fixture.');send('\r');pump(.55);snap('partial');pump(4);snap('settled')
else:
 run=next((root/'archives/runs').iterdir()).name;send(':replay '+run);send('\r');pump(1);snap('replay');send('\x07')
send(':exit');send('\r');pump(1)
if proc.poll() is None:send('\x04');pump(1)
code=proc.wait(timeout=5);raw.close();cast.close();assert code==0,code
print(mode,'captured')
