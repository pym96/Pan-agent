from pathlib import Path
import os,subprocess,json,hashlib,pty,fcntl,termios,struct,time,select,codecs
import sys
root=Path(sys.argv[1]).resolve()
for d in ['consumer','home','xdg-config','xdg-cache','npm-cache','workspace','archives']:(root/d).mkdir(exist_ok=True)
env={k:v for k,v in os.environ.items() if not any(s in k.upper()for s in ['TOKEN','SECRET','PASSWORD','API_KEY'])};env.update(HOME=str(root/'home'),XDG_CONFIG_HOME=str(root/'xdg-config'),XDG_CACHE_HOME=str(root/'xdg-cache'),npm_config_cache=str(root/'npm-cache'),TERM='xterm-256color');env.pop('NO_COLOR',None)
def run(args,name,cwd=root/'consumer'):
 p=subprocess.run(args,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);(root/(name+'.log')).write_bytes(p.stdout);return p
cli=str(root/'consumer/node_modules/.bin/pan-agent')
class Capture:
 def __init__(self,name,args,env=env):
  self.name=name;self.buf='';self.master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',38,120,0,0));self.start=time.monotonic();self.raw=(root/(name+'.raw')).open('wb');self.events=[];self.actions=[];self.decoder=codecs.getincrementaldecoder('utf8')('replace');self.proc=subprocess.Popen(args,cwd=root/'consumer',env=env,stdin=slave,stdout=slave,stderr=slave);os.close(slave)
 def pump(self,seconds):
  end=time.monotonic()+seconds
  while time.monotonic()<end:
   if select.select([self.master],[],[],.05)[0]:
    try:b=os.read(self.master,65536)
    except OSError:break
    if not b:break
    self.raw.write(b);self.raw.flush();s=self.decoder.decode(b);self.buf+=s;self.events.append([time.monotonic()-self.start,'o',s])
 def wait(self,s,timeout=10):
  deadline=time.monotonic()+timeout
  while s not in self.buf and time.monotonic()<deadline and self.proc.poll()is None:self.pump(.1)
  assert s in self.buf,'missing expected prompt '+s
 def send(self,s,label):
  self.actions.append({'time':time.monotonic()-self.start,'label':label,'input':s})
  try:os.write(self.master,s.encode())
  except OSError:return
  self.pump(.2)
 def close(self):
  self.pump(.5)
  if self.proc.poll()is None:self.send('\x04','exit')
  self.pump(1)
  if self.proc.poll()is None:self.proc.terminate()
  code=self.proc.wait(timeout=5);self.raw.close();(root/(self.name+'.cast')).write_text(json.dumps({'version':2,'width':120,'height':38})+'\n'+'\n'.join(json.dumps(x,ensure_ascii=False)for x in self.events)+'\n');(root/(self.name+'.actions.json')).write_text(json.dumps(self.actions,indent=2)+'\n');return code

if __name__=='__main__':
 assert not (root/'home/.pan-agent/settings.json').exists()
 c=Capture('configure',[cli,'configure']);c.wait('Provider [');c.send('kimi-code:k3-256k\r','choose Kimi');c.wait('Thinking [');c.send('high\r','high');c.wait('Credential source:');c.send('e\r','environment');c.wait('Settings saved:');assert c.close()==0
 settings=json.loads((root/'home/.pan-agent/settings.json').read_text());assert settings['credentialSource']=='environment'
 c=Capture('missing-key',[cli,'--kernel','native','--workspace',str(root/'workspace'),'--memory-root',str(root/'archives')]);c.pump(1);c.send('\r','blank');c.pump(.5);assert not list((root/'archives').rglob('manifest.json'));c.send('Reply hello only. Do not use tools.\r','missing-key task');c.pump(2)
 import pyte
 screen=pyte.Screen(120,38);stream=pyte.Stream(screen);stream.feed(c.buf);view='\n'.join(screen.display);(root/'missing-key-screen.txt').write_text(view)
 joined=''.join(line[2:].strip() for line in screen.display)
 assert 'Missing KIMI_API_KEY' in view and 'configure' in joined and 'model_error' in view
 c.send(':exit\r','exit');assert c.close()==0
 assert json.loads((root/'home/.pan-agent/settings.json').read_text())==settings
 rec=[json.loads(x)['record'] for x in next((root/'archives/runs').glob('*/events.jsonl')).read_text().splitlines()]
 assert not any(x['type'].startswith('tool.') for x in rec)
 (root/'installed-check.json').write_text(json.dumps({'wizard':True,'restartPreferencesUnchanged':True,'blankStartupNoArchive':True,'missingKeyVisible':True,'nonCompleted':True,'toolRecords':0,'credentialPresent':False,'node':subprocess.check_output(['node','--version'],text=True).strip()},indent=2)+'\n')
 print('Actual installed wizard/restart/missing-key TUI passed; no credential or paid call')
