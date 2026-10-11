#!/usr/bin/env python3
"""Actual installed operator negative probes, with private logs and no task submissions."""
import argparse,json,pathlib,subprocess,os,socket,sys,time,hashlib
P=pathlib.Path
p=argparse.ArgumentParser();p.add_argument('--package',required=True);p.add_argument('--out',required=True);p.add_argument('--pg-bin',required=True);a=p.parse_args();r=P(a.out).resolve();r.mkdir(mode=0o700);program=r/'program';data=r/'data';source=P(__file__).resolve().parents[1];entry=source/'deploy/pan-web.py';checks=[];num=0
os.umask(0o077)
def run(args,ok=True,env=None):
 global num
 num+=1;q=subprocess.run([str(x) for x in args],env=env,capture_output=True,text=True,timeout=120);(r/f'{num:02}.log').write_text(q.stdout+q.stderr);assert (q.returncode==0)==ok,(num,q.returncode);return q.stdout
def cmd(action,*extra,ok=True,env=None):return run([sys.executable,program/'deploy/pan-web.py',action,'--data',data,*extra],ok,env)
def savecfg(c):(data/'config.json').write_text(json.dumps(c,indent=2))
run([sys.executable,entry,'install','--package',a.package,'--dest',program]);run([sys.executable,entry,'install','--package',a.package,'--dest',program],False);checks.append('install refuses existing program')
cmd('start',ok=False);checks.append('missing configuration explicit failure')
with socket.socket() as s:
 s.bind(('127.0.0.1',8115));s.listen();cmd('init','--pg-bin',a.pg_bin,'--port','8115','--pg-port','54115','--redis-port','63115',ok=False);assert not data.exists();checks.append('occupied port refuses init before mutation')
cmd('init','--pg-bin',a.pg_bin,'--port','8115','--pg-port','54115','--redis-port','63115');cfg=json.loads((data/'config.json').read_text());assert not cfg['testMode'] and cfg['workers']==1
original=(data/'config.json').read_bytes();cmd('init','--pg-bin',a.pg_bin,ok=False);assert (data/'config.json').read_bytes()==original;checks.append('nonempty init preserves accounts/config')
assert data.stat().st_mode&0o077==0 and (data/'config.json').stat().st_mode&0o077==0
bad=dict(cfg,faults={'WEB_OPERATION_FAULT':'after-receipt'});savecfg(bad);cmd('start',ok=False);savecfg(cfg);checks.append('normal mode rejects configured test fault')
e=os.environ.copy();e['WEB_FAUX_BARRIER']='1';cmd('start',ok=False,env=e);checks.append('normal mode rejects ambient fault')
cmd('start');rec=json.loads((data/'processes.json').read_text());cmd('start');assert json.loads((data/'processes.json').read_text())==rec;checks.append('repeated healthy start is idempotent')
status=json.loads(cmd('status'));assert status['ready'] and len(status['processes'])==4
pids=','.join(str(v['pid']) for v in rec.values());q=subprocess.run(['lsof','-nP','-a','-p',pids,'-iTCP','-sTCP:LISTEN'],capture_output=True,text=True);(r/'listeners.txt').write_text(q.stdout);assert q.returncode==0 and q.stdout.count('127.0.0.1:')==3 and '*:' not in q.stdout;checks.append('actual three listeners loopback only; one Worker heartbeat ready')
cmd('backup','--backup',r/'forbidden-live-backup',ok=False);assert not (r/'forbidden-live-backup').exists();checks.append('live backup refused')
with subprocess.Popen([sys.executable,'-c','import time; time.sleep(90)']) as foreign:
 altered=dict(rec);altered['worker9']={'pid':foreign.pid,'identity':'wrong identity'};(data/'processes.json').write_text(json.dumps(altered));cmd('stop',ok=False);assert foreign.poll() is None;foreign.terminate();foreign.wait();(data/'processes.json').write_text(json.dumps(rec));checks.append('unknown PID identity not signalled')
cmd('stop');cmd('stop');s=json.loads(cmd('status'));assert not s['ready'] and not s['ownedProcesses'] and not s['containers'];checks.append('repeated stop proves absence')
# Extra/tampered package content must not be installed.
tiny=r/'invalid-package';tiny.mkdir();(tiny/'manifest.json').write_text(json.dumps({'files':{'missing':'bad'}}));run([sys.executable,entry,'install','--package',tiny,'--dest',r/'invalid-install'],False);assert not (r/'invalid-install').exists();checks.append('invalid package manifest rejected')
(r/'result.json').write_text(json.dumps({'passed':True,'checks':checks,'realProviderCalls':0,'credentials':'private data/config.json only'},indent=2));print('PASS',len(checks),'deployment checks')
