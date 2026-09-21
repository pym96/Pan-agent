"""Fixed byte transport, inside the isolated container; never executes a command."""
import http.client,json,sys
request=json.loads(sys.stdin.readline(131072))
if request['path'] not in ('/is_alive','/execute'):raise SystemExit('unsupported control endpoint')
connection=http.client.HTTPConnection('127.0.0.1',8000,timeout=40)
connection.request(request['method'],request['path'],body=request['body'],headers=request['headers'])
response=connection.getresponse()
body=response.read(2**20+1)
if len(body)>2**20:raise SystemExit('control response too large')
print(json.dumps({'status':response.status,'body':body.decode()}))
