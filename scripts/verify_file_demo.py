#!/usr/bin/env python3
"""Exercise the exact identity-bound Human demo entry in a real PTY; Builder trial only."""
import argparse,fcntl,json,os,pty,re,select,struct,subprocess,termios,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--entry',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir()
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',24,80,0,0));child=subprocess.Popen([a.entry],stdin=slave,stdout=slave,stderr=slave);os.close(slave);raw=bytearray()
def until(marker,start=0):
 deadline=time.monotonic()+20
 while marker.encode() not in raw[start:]:
  assert time.monotonic()<deadline,('deadline',marker,bytes(raw)[-2000:])
  if select.select([master],[],[],.1)[0]:
   try:data=os.read(master,65536)
   except OSError:data=b''
   assert data,('EOF',bytes(raw)[-2000:]);raw.extend(data)
def send(text):os.write(master,text.encode())
try:
 until('[y/N]> ');assert b'Verified candidate ' in raw;send('y\r');until('You > ');send('review @example');until('Matches 1');send('\r');until('Submit sends these snapshots');assert b'SYNTHETIC_DEMO_ONLY' not in raw;send('\x10');until('SYNTHETIC_DEMO_ONLY');send('\r');until('(completed)');until('You > ',raw.rfind(b'(completed)'));start=len(raw);send(':runs\r');until('ARCHIVE ',start)
 match=re.search(rb'ARCHIVE ([a-f0-9-]+)',raw[start:]);assert match;send(':replay '+match.group(1).decode()+'\r');until('Archived replay',start);start=len(raw);send(':details\r');until('SYNTHETIC_DEMO_ONLY',start);send(':exit\r');until('OFFLINE file demo closed');until('WO35 meters');child.wait(timeout=5);assert child.returncode==0
 assert b'Faux exchanges=1' in raw;assert b'1 snapshot(s)' in raw or b'original bytes as user data' in raw
 (a.output/'summary.json').write_text(json.dumps({'entry':a.entry,'builder_trial_only':True,'faux_exchanges':1,'selection_preview_submit_stream_replay':True},indent=2)+'\n');print('PASS identity-bound installed offline demo real PTY trial')
finally:
 (a.output/'transcript.bin').write_bytes(raw);(a.output/'transcript.txt').write_text(raw.decode(errors='backslashreplace'))
 if child.poll() is None:child.kill();child.wait()
 os.close(master)
