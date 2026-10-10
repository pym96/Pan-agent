#!/usr/bin/env python3
"""Own persistent local PostgreSQL and application processes; never manage shared services."""
import argparse,json,os,pathlib,secrets,signal,subprocess,time,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--issue',type=int,choices=[106,107,108,109,110,111,112,113],default=106);p.add_argument('command',choices=['init','start','stop','test']);p.add_argument('--runtime',required=True);p.add_argument('--pg-bin',required=True);p.add_argument('--db-port',type=int,default=54106);p.add_argument('--port',type=int,default=8106);a=p.parse_args()
r=pathlib.Path(a.runtime).resolve();root=pathlib.Path(__file__).resolve().parents[1];pg=pathlib.Path(a.pg_bin).resolve();cfg=r/'config.json';mark=r/f'web{a.issue}-owner.json'
def run(args,**kw):return subprocess.run([str(x) for x in args],check=True,**kw)
if a.command=='init':
 if r.exists() and any(r.iterdir()):raise SystemExit('init requires a new empty runtime directory')
 r.mkdir(parents=True,exist_ok=True);r.chmod(0o700)
 data={'DATABASE_URL':f'postgres://web106:{secrets.token_hex(24)}@127.0.0.1:{a.db_port}/web106?sslmode=disable','ACCOUNT_A_PASSWORD':secrets.token_hex(16),'ACCOUNT_B_PASSWORD':secrets.token_hex(16),'APP_ORIGIN':f'http://127.0.0.1:{a.port}','LISTEN_ADDR':f'127.0.0.1:{a.port}'}
 cfg.write_text(json.dumps(data,indent=2));cfg.chmod(0o600);mark.write_text(json.dumps({'issue':a.issue,'runtime':str(r)}));
 pw=r/'db-password';pw.write_text(urllib.parse.urlsplit(data['DATABASE_URL']).password+'\n');pw.chmod(0o600)
 with (r/'setup.log').open('w') as log:run([pg/'initdb','-D',r/'pgdata','-U','web106','--auth=scram-sha-256','--pwfile='+str(pw)],stdout=log,stderr=log)
 # Persist service settings so stop/start does not revert to PostgreSQL defaults.
 with (r/'pgdata/postgresql.conf').open('a') as f:f.write(f"\nlisten_addresses='127.0.0.1'\nport={a.db_port}\nunix_socket_directories='{str(r).replace(chr(39),chr(39)*2)}'\nshared_buffers='64MB'\nmax_connections=16\n")
 run([pg/'pg_ctl','-D',r/'pgdata','-l',r/'postgres.log','start'])
 env=os.environ.copy();env.update(data);env['PGPASSWORD']=urllib.parse.urlsplit(data['DATABASE_URL']).password
 run([pg/'createdb','-h','127.0.0.1','-p',str(a.db_port),'-U','web106','web106'],env=env)
 run(['go','build','-o',r/'evidence-web','.'],cwd=root)
 for who in ['a','b']:
  account=env.copy();account['ACCOUNT_EMAIL']=who+'@web106.test';account['ACCOUNT_PASSWORD']=data['ACCOUNT_'+who.upper()+'_PASSWORD'];run([r/'evidence-web','account'],env=account,cwd=root)
 print('Initialized own database and invited accounts. Passwords are only in',cfg);raise SystemExit(0)
if not mark.exists() or json.loads(mark.read_text())!={'issue':a.issue,'runtime':str(r)}:raise SystemExit('not an owned web106 runtime')
data=json.loads(cfg.read_text());env=os.environ.copy();env.update(data);env['WEB_ISSUE']=f'web{a.issue}';env['WEB_DIR']=str(root/'web/dist');pidfile=r/'app.pid'
def stop_app():
 if not pidfile.exists():return
 pid=int(pidfile.read_text());ps=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True)
 if ps.returncode==0:
  if ps.stdout.strip()!=str(r/'evidence-web'):raise SystemExit('PID ownership differs; refusing signal')
  os.kill(pid,signal.SIGTERM)
  for _ in range(100):
   try:os.kill(pid,0)
   except ProcessLookupError:break
   time.sleep(.1)
 pidfile.unlink()
if a.command=='stop':
 stop_app();run([pg/'pg_ctl','-D',r/'pgdata','-m','fast','stop']);raise SystemExit(0)
if subprocess.run([str(pg/'pg_ctl'),'-D',str(r/'pgdata'),'status'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0:run([pg/'pg_ctl','-D',r/'pgdata','-l',r/'postgres.log','start'])
if a.command=='test':
 if pidfile.exists():raise SystemExit('stop the owned app before testing (database may remain)')
 env.update({'APP_BINARY':str(r/'evidence-web'),'EVIDENCE_DIR':str(r/'test-evidence'),'TEST_PGDATA':str(r/'pgdata'),'TEST_RUNTIME_ROOT':str(r),'PG_CTL':str(pg/'pg_ctl')});run(['python3','scripts/integration.py'],cwd=root,env=env);raise SystemExit(0)
if pidfile.exists():raise SystemExit('app.pid exists; use stop or inspect before starting')
with (r/'app.log').open('a') as f:proc=subprocess.Popen([str(r/'evidence-web')],cwd=root,env=env,stdout=f,stderr=f,start_new_session=True)
time.sleep(.3)
if proc.poll() is not None:raise SystemExit('app failed; inspect app.log')
pidfile.write_text(str(proc.pid));print('Started',data['APP_ORIGIN'])
