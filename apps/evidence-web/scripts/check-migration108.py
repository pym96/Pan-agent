#!/usr/bin/env python3
"""Apply real SQL migrations around legacy rows in a rollback-only owned schema."""
import pathlib,os,json,subprocess,uuid,urllib.parse
root=pathlib.Path(__file__).resolve().parents[1];r=pathlib.Path(os.environ['WEB108_RUNTIME']);assert (r/f"web{os.environ.get('WEB_TEST_ISSUE','108')}-owner.json").exists();cfg=json.loads((r/'config.json').read_text());env=os.environ.copy();u=urllib.parse.urlsplit(cfg['DATABASE_URL']);env.update({'PGHOST':u.hostname,'PGPORT':str(u.port),'PGUSER':u.username,'PGPASSWORD':u.password,'PGDATABASE':u.path.lstrip('/')})
schema='probe108_'+uuid.uuid4().hex
sql='BEGIN; CREATE SCHEMA '+schema+'; SET LOCAL search_path TO '+schema+';\n'
sql+='\n'.join((root/'migrations'/n).read_text() for n in ['001.sql','002.sql'])
sql+='''
INSERT INTO ew_accounts VALUES ('a','synthetic@example.test','not-a-password');
INSERT INTO ew_bundles(id,account_id,title,summary_name,parser_version,overview) VALUES ('b','a','legacy fixture','summary.json','legacy','{}');
INSERT INTO ew_files VALUES ('b','summary.json','fixture-hash',decode('6e756c6c','hex'));
INSERT INTO ew_tasks(id,bundle_id,account_id,question,state,result,cleanup_confirmed) VALUES ('t','b','a','legacy question','completed','{"result":{"finalText":"legacy answer"}}',true);
INSERT INTO ew_task_artifacts VALUES ('t','details.csv','fixture-csv-hash',decode('612c620a','hex'));
CREATE TEMP TABLE before108 AS SELECT t.id,t.question,t.result,t.state,f.content AS source,a.content AS artifact FROM ew_tasks t JOIN ew_files f ON f.bundle_id=t.bundle_id JOIN ew_task_artifacts a ON a.task_id=t.id;
'''
sql+=(root/'migrations/003.sql').read_text()*2
sql+='''
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM before108 b JOIN ew_tasks t USING(id) JOIN ew_files f ON f.bundle_id=t.bundle_id JOIN ew_task_artifacts a ON a.task_id=t.id WHERE b.question<>t.question OR b.result<>t.result OR b.state<>t.state OR b.source<>f.content OR b.artifact<>a.content OR t.conversation_id IS NOT NULL OR t.context_text IS NOT NULL) THEN RAISE EXCEPTION 'legacy migration changed history'; END IF;
 IF (SELECT count(*) FROM ew_tasks)<>1 THEN RAISE EXCEPTION 'legacy row count changed'; END IF;
END $$;
ROLLBACK;
'''
subprocess.run(['/opt/homebrew/opt/postgresql@14/bin/psql','-X','-v','ON_ERROR_STOP=1'],input=sql,text=True,env=env,check=True)
print('PASS old schema + legacy result/source/CSV unchanged; migration idempotent; no fake old context; probe rolled back')
