"""Start/restart a private remote Kimi deployment; key travels on SSH stdin only."""
import argparse,os,subprocess,shlex,json
p=argparse.ArgumentParser();p.add_argument('--host',required=True);p.add_argument('--program',required=True);p.add_argument('--data',required=True);p.add_argument('--action',choices=['start','restart'],default='start');a=p.parse_args()
key=os.environ.get('KIMI_API_KEY','');assert key.strip(),'KIMI_API_KEY must exist in controlling process'
command=['python3','-B',a.program+'/deploy/pan-web.py',a.action,'--data',a.data]
script="import sys,os,subprocess;key=sys.stdin.read();assert key.strip();os.environ['KIMI_API_KEY']=key;raise SystemExit(subprocess.call("+repr(command)+"))"
raise SystemExit(subprocess.run(['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',a.host,'python3 -c '+shlex.quote(script)],input=key,text=True).returncode)
