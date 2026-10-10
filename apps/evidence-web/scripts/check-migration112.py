#!/usr/bin/env python3
"""Legacy data survives additive ownership schema; no fabricated execution identity."""
import pathlib,os,json,subprocess,uuid,urllib.parse
root=pathlib.Path(__file__).resolve().parents[1];r=pathlib.Path(os.environ['WEB108_RUNTIME']);assert (r/f'web{os.environ.get("WEB_TEST_ISSUE","112")}-owner.json').exists();cfg=json.loads((r/'config.json').read_text());u=urllib.parse.urlsplit(cfg['DATABASE_URL']);env={**os.environ,'PGHOST':u.hostname,'PGPORT':str(u.port),'PGUSER':u.username,'PGPASSWORD':u.password,'PGDATABASE':u.path.lstrip('/')}
schema='probe112_'+uuid.uuid4().hex
sql='BEGIN; CREATE SCHEMA '+schema+'; SET LOCAL search_path TO '+schema+';\n'
for p in sorted((root/'internal/database/migrations').glob('00[1-6]*.sql')):sql+=p.read_text()+'\n'
sql+='''
INSERT INTO ew_accounts VALUES('a','fixture@example.test','unused');
INSERT INTO ew_bundles(id,account_id,title,summary_name,parser_version,overview) VALUES('b','a','legacy','summary.json','legacy','{}');
INSERT INTO ew_files VALUES('b','summary.json','source-hash',decode('7b7d','hex'));
INSERT INTO ew_tasks(id,account_id,bundle_id,question,state,result,cleanup_confirmed) VALUES('t','a','b','legacy','completed','{"usage":"unknown"}',true);
CREATE TEMP TABLE old_tasks AS SELECT to_jsonb(t) AS row FROM ew_tasks t;
'''
for p in sorted((root/'internal/database/migrations').glob('00[7-8]*.sql')):sql+=p.read_text()+'\n'
sql+='''DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ew_tasks t,old_tasks o WHERE to_jsonb(t)-'generation'-'revoked_at'<>o.row) THEN RAISE EXCEPTION 'legacy changed';END IF;
 IF EXISTS(SELECT 1 FROM ew_tasks WHERE generation<>0) OR EXISTS(SELECT 1 FROM ew_admissions) OR EXISTS(SELECT 1 FROM ew_attempts) THEN RAISE EXCEPTION 'invented identity';END IF;
END $$;ROLLBACK;
'''
subprocess.run(['/opt/homebrew/opt/postgresql@14/bin/psql','-X','-v','ON_ERROR_STOP=1'],env=env,input=sql,text=True,check=True)
print('PASS additive 007/008 retains all legacy task fields, no invented owner/admission/attempt')
