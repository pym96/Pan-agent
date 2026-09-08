#!/usr/bin/env python3
"""Builder's scripted trial of the real offline interactive demo, not Human acceptance."""
import argparse,json,os,select,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--node',required=True);p.add_argument('--package',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir()
root=Path(__file__).resolve().parents[1]
env={'PATH':str(Path(a.node).resolve().parent)+':/usr/bin:/bin','HOME':str(a.output),'TMPDIR':str(a.output),'LANG':'en_US.UTF-8'}
child=subprocess.Popen([a.node,str(root/'scripts/demo_streaming.mjs'),'--package',a.package],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env)
raw=bytearray()
def until(marker,start=0):
 deadline=time.monotonic()+15
 while marker.encode() not in raw[start:]:
  assert time.monotonic()<deadline,('timeout',marker,bytes(raw)[-1000:])
  ready,_,_=select.select([child.stdout],[],[],.1)
  if ready:
   data=os.read(child.stdout.fileno(),65536);assert data,('early EOF',bytes(raw));raw.extend(data)
def send(text):child.stdin.write(text.encode());child.stdin.flush()
def command(text):
 start=len(raw);send(text+'\n');until('You > ',start)
try:
 until('[y/N]> ');send('y\n');until('You > ')
 command('frozen');command(':details');command('long');command(':details');command('error');command(':details')
 start=len(raw);send('cancel\n');until('unfinished preview',start);send('\x03');until('You > ',start);command(':details');command('broken');command('frozen');command(':runs')
 import re
 runid=re.search(rb'ARCHIVE ([a-f0-9-]+)',raw).group(1).decode();command(':replay '+runid);command(':details');send(':exit\n')
 rest=child.communicate(timeout=10)[0];raw.extend(rest);assert child.returncode==0
 text=raw.decode();assert 'PAN_PACK_OK' in text and 'line-200' in text and 'Cancelled' in text and 'Model error' in text and 'Archived replay' in text
 assert 'Faux exchanges=14 · network attempts=0' in text
 (a.output/'transcript.txt').write_text(text);(a.output/'summary.json').write_text(json.dumps({'product':a.package,'builder_trial_only':True,'faux_exchanges':14,'network_attempts':0,'scenarios':['frozen','long','error','cancel','broken','subsequent frozen'],'review':'Builder trial; C-STR-03/05 additional review remains independent'},indent=2)+'\n')
 print('PASS actual Product offline interactive demo: streamed frozen/long/error/cancel/broken/subsequent task/details/replay (Builder observation only)')
finally:
 if child.poll() is None:child.kill();child.wait()
