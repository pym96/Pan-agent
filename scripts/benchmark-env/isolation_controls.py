"""Finite canary probes, only project-created files/services; no private scanning."""
import argparse,hashlib,http.server,json,os,pathlib,secrets,shlex,threading,urllib.request,urllib.error
from task_runtime import TaskRuntime

def run(manifest,work,evidence):
    work=pathlib.Path(work);evidence=pathlib.Path(evidence)
    canary=work/'outside-task-canary.txt';value='WO71_CANARY_'+secrets.token_hex(16);canary.write_text(value)
    os.environ['WO71_SYNTHETIC_CREDENTIAL']=value
    class Canary(http.server.BaseHTTPRequestHandler):
        def log_message(self,*a):pass
        def do_GET(self):self.send_response(200);self.end_headers();self.wfile.write(value.encode())
    service=http.server.ThreadingHTTPServer(('127.0.0.1',0),Canary)
    thread=threading.Thread(target=service.serve_forever,daemon=True);thread.start()
    results=[]
    try:
        for task in ('swe','da'):
            runtime=TaskRuntime(manifest,task,evidence)
            try:
                program='''import os,json,socket,pathlib
paths=PATHS
reads={p:os.path.exists(p) for p in paths}
connections=[]
for host in ['127.0.0.1','192.168.65.254']:
 try:
  s=socket.create_connection((host,PORT),timeout=.5);s.close();connections.append(True)
 except OSError:connections.append(False)
print(json.dumps({'outside_paths_exist':reads,'host_canary_reachable':connections,'credential_in_env':'WO71_SYNTHETIC_CREDENTIAL' in os.environ,'interfaces':os.listdir('/sys/class/net'),'routes':pathlib.Path('/proc/net/route').read_text()}))
'''.replace('PATHS',repr([str(canary),'/var/run/docker.sock','/tmp/wo71-cross-task','/tmp/eval/gold/data-sa-001/result.csv'])).replace('PORT',str(service.server_port))
                observed=runtime.execute('/opt/wo71-venv/bin/python -c '+shlex.quote(program),10)
                assert observed['exit_code']==0
                data=json.loads(observed['stdout'])
                assert not any(data['outside_paths_exist'].values()) and not any(data['host_canary_reachable']) and not data['credential_in_env']
                (evidence/('isolation-observed-'+task+'.json')).write_text(json.dumps(data,indent=2)+'\n')
                assert len(data['routes'].strip().splitlines())==1
                for unsafe in ('/tmp/result.csv','../result.csv','nested/result.csv','.'):
                    try:runtime.export(unsafe)
                    except ValueError:pass
                    else:raise AssertionError('unsafe export admitted')
                assert runtime.execute("printf safe-fixture > wo71-fixture.txt",10)['exit_code']==0
                assert runtime.export('wo71-fixture.txt')==b'safe-fixture'
                assert runtime.execute('rm -f result.csv; ln -s /tmp/wo71-export-outside result.csv; printf outside > /tmp/wo71-export-outside',10)['exit_code']==0
                try:runtime.export('result.csv')
                except ValueError:pass
                else:raise AssertionError('outward symlink export admitted')
                # Cross-task marker is only in this disposable task, never staged next.
                assert runtime.execute('printf owned > /tmp/wo71-cross-task',10)['exit_code']==0
                auth=[]
                for extra in ({},{'X-API-Key':'wrong'},{'X-Request-ID':'known-replay-canary'}):
                    request=urllib.request.Request('http://127.0.0.1:'+str(runtime.port)+'/is_alive',headers=extra)
                    try:urllib.request.urlopen(request,timeout=5)
                    except urllib.error.HTTPError as e:auth.append(e.code)
                    else:raise AssertionError('unauthorized client passed')
                assert auth==[401,401,401]
                results.append({'task':task,'export_safe_bytes_verified':True,'unsafe_path_and_symlink_refused':True,'observed':data,'unauthorized_status':auth,'container_id':runtime.container.id,'config':runtime.record})
            finally:runtime.close()
    finally:
        service.shutdown();service.server_close();thread.join(timeout=5)
        os.environ.pop('WO71_SYNTHETIC_CREDENTIAL',None)
        (evidence/'isolation-controls.json').write_text(json.dumps({'kind':'finite local canary checks, not universal container security','host_canary_sha256':hashlib.sha256(value.encode()).hexdigest(),'host_canary_port':service.server_port,'results':results},indent=2)+'\n')
if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('manifest','work','evidence'):p.add_argument('--'+name,required=True)
    a=p.parse_args();run(json.loads(pathlib.Path(a.manifest).read_text()),a.work,a.evidence)
