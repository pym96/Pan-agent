#!/usr/bin/env python3
"""Owned DB constraint fault; no model retry. Run only while no load or other task is active."""
import subprocess,json,time,uuid,urllib.request
base='http://127.0.0.1:18142';session='persist-'+uuid.uuid4().hex[:12]
def sql(text):return subprocess.check_output(['docker','exec','pan-pi-142-pg-1','psql','-U','pan','-d','pan','-At','-c',text],text=True).strip()
def tasks():
 with urllib.request.urlopen(base+'/sessions/'+session+'/tasks',timeout=2) as r:return json.load(r)
sql("ALTER TABLE events ADD CONSTRAINT reject_completed_probe CHECK(kind!='completed') NOT VALID")
try:
 r=urllib.request.Request(base+'/sessions/'+session+'/tasks',data=json.dumps({'key':'one','prompt':'terminal persistence fault probe'}).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(r,timeout=10) as response:admitted=json.load(response)
 for _ in range(200):
  state=subprocess.check_output(['docker','inspect','--format','{{.State.Running}}','pan-pi-142-api-1'],text=True).strip()
  if state=='false':break
  time.sleep(.1)
 assert state=='false','service did not stop after unresolved terminal persistence'
 before=sql(f"SELECT status FROM tasks WHERE id='{admitted['id']}'")
 assert before=='running',before
 assert sql(f"SELECT count(*) FROM events WHERE task='{admitted['id']}' AND kind='completed'")=='0'
finally:
 sql('ALTER TABLE events DROP CONSTRAINT reject_completed_probe')
 subprocess.run(['docker','start','pan-pi-142-api-1'],check=True,stdout=subprocess.DEVNULL)
for _ in range(100):
 try:
  after=tasks()
  if after[0]['status']=='interrupted':break
 except Exception:pass
 time.sleep(.1)
assert after[0]['status']=='interrupted',after
print(json.dumps({'session':session,'admitted':admitted,'beforeRestart':before,'serviceStopped':True,'falseCompletedEvents':0,'afterRestart':after,'fault':'test-only PostgreSQL CHECK rejects completed event; transaction rollback; three idempotent persistence tries; no model resend'},indent=2))
