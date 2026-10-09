#!/usr/bin/env python3
"""Missing-answer/oversize fixtures in the owned test DB; never a benchmark claim."""
import pathlib,os,json,subprocess,urllib.parse,time
# Reuse the integration harness helpers without invoking its main scenario.
source=pathlib.Path(__file__).with_name('check108.py').read_text();exec(compile(source.split('\ntry:\n app=start')[0],str(pathlib.Path(__file__).with_name('check108.py')),'exec'))
u=urllib.parse.urlsplit(env['DATABASE_URL']);pg=env.copy();pg.update({'PGHOST':u.hostname,'PGPORT':str(u.port),'PGUSER':u.username,'PGPASSWORD':u.password,'PGDATABASE':u.path.lstrip('/')})
def sql(text):subprocess.run(['/opt/homebrew/opt/postgresql@14/bin/psql','-X','-q','-v','ON_ERROR_STOP=1'],input=text,text=True,env=pg,check=True,stdout=subprocess.DEVNULL)
try:
 app=start('app');ready();a=client();login(a,'a');bid=json.loads(pathlib.Path(os.environ['PREVIOUS_RESULT']).read_text())['bundleId'];cases=[]
 for label in ['missing','oversize']:
  cid=conversation(a,bid);_,one=append(a,cid,'synthetic '+label+' prerequisite');_,two=append(a,cid,'must block '+label)
  # Explicitly synthetic fault injection; JSON is constructed in SQL, not untrusted interpolation.
  result="'{}'::jsonb" if label=='missing' else "jsonb_build_object('result',jsonb_build_object('finalText',repeat('x',262145)))"
  sql("UPDATE ew_tasks SET state='completed',cleanup_confirmed=true,result="+result+",finished_at=now() WHERE id='"+one['id']+"';")
  cases.append((label,one,two))
 worker=start('worker')
 for label,one,two in cases:
  t=wait(two['id']);save(label+'.json',t);check(t['state']=='blocked' and not t['events'] and t['contextText'] is None,label+' context rejected before model/tool');check(one['id'] in t['reason'] if label=='missing' else '262144' in t['reason'],label+' explicit diagnostic')
 save('result.json',{'passed':True,'checks':checks,'fixtureOnly':True,'providerSends':0})
finally:
 stop(worker);stop(app)
 for f in logs:f.close()
