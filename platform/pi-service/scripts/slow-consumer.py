#!/usr/bin/env python3
"""Fault fixture: direct SQL creates large committed events, not model output or performance workload."""
import socket,subprocess,uuid,time,json,urllib.request
session='slow-'+uuid.uuid4().hex[:12]
def metrics():
 with urllib.request.urlopen('http://127.0.0.1:18142/metrics',timeout=10) as r:return json.load(r)
before=metrics()
# No tools/model calls. Bounded 12.8MB fixture in this dedicated session.
sql=f"INSERT INTO events(session,task,kind,data) SELECT '{session}','fixture','text',jsonb_build_object('text',repeat('x',64000)) FROM generate_series(1,200);"
subprocess.run(['docker','exec','pan-pi-142-pg-1','psql','-U','pan','-d','pan','-c',sql],check=True,stdout=subprocess.DEVNULL)
s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_RCVBUF,1024);s.connect(('127.0.0.1',18142));s.sendall(f'GET /sessions/{session}/events HTTP/1.1\r\nHost: localhost\r\n\r\n'.encode())
# Initial replay reads the committed fixture; client never drains its receive buffer.
time.sleep(19)
after=metrics();s.close()
assert after['writeFailures']>before['writeFailures'],(before,after)
assert after['connections']<=before['connections'],(before,after)
print(json.dumps({'session':session,'fixture':'200 direct-SQL 64KB events; no Pi/model claim','before':before,'after':after,'boundedWriteDeadlineDisconnected':True},indent=2))
