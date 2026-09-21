"""Dedicated upstream cleanup CLI shim: exact requests return to the facade."""
import json,os,socket,sys
request=json.dumps(sys.argv[1:]).encode()+b'\n'
if len(request)>1024:raise SystemExit(2)
with socket.socket(socket.AF_UNIX) as client:
    client.settimeout(35);client.connect(os.environ['WO71_FACADE_SOCKET']);client.sendall(request)
    response=json.loads(client.makefile('rb').readline(4096))
if not response.get('ok'):raise SystemExit(1)
