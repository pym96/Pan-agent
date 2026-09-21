"""Controller for one installed Pan scripted trace; loopback-only bridge."""
import argparse,hashlib,hmac,json,pathlib,secrets,subprocess,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from task_runtime import TaskRuntime

def run(manifest,task,work,evidence,node,installed,mode=None):
    evidence=pathlib.Path(evidence);work=pathlib.Path(work)
    output=work/('trace-'+task+('-'+mode if mode else ''));output.mkdir(exist_ok=True)
    token=secrets.token_hex(32);runtime=TaskRuntime(manifest,task,evidence)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):self.send_error(401);return
            if self.path=='/cancel':
                runtime.stop();self.send_response(200);self.end_headers();self.wfile.write(b'{}');return
            if self.path!='/execute':self.send_error(404);return
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=65536:self.send_error(413);return
            try:
                data=json.loads(self.rfile.read(size));result=runtime.execute(data['command'],data['timeout'])
                self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(result).encode())
            except Exception:
                self.send_response(200);self.end_headers();self.wfile.write(json.dumps({'stdout':'','stderr':'bounded task stopped after execution failure','exit_code':None,'status':'execution_error'}).encode())
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.daemon_threads=True
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        cfg={'mode':mode,'task':task,'endpoint':'http://127.0.0.1:'+str(server.server_port),'token':token,'output':str(output),'installedEntry':installed}
        command=[node,str(pathlib.Path(__file__).with_name('installed_trace.mjs'))]
        result=subprocess.run(command,input=json.dumps(cfg),text=True,capture_output=True,timeout=180,
            env={'PATH':'/usr/bin:/bin','HOME':str(work),'LANG':'C.UTF-8'},cwd=work)
        (evidence/(task+('-'+mode if mode else '')+'-installed-stdout.log')).write_text(result.stdout)
        (evidence/(task+('-'+mode if mode else '')+'-installed-stderr.log')).write_text(result.stderr)
        (evidence/(task+('-'+mode if mode else '')+'-installed-invocation.json')).write_text(json.dumps({'command':command,'bridge_port':server.server_port,'task':task,'exit':result.returncode,'installed_entry':installed,'trace_path':str(output/'trace.json')},indent=2)+'\n')
        if result.returncode:raise RuntimeError('installed trace failed')
        print(result.stdout)
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5);runtime.close()

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('manifest','task','work','evidence','node','installed'):p.add_argument('--'+name,required=True)
    p.add_argument('--mode',choices=['cancel','timeout'])
    a=p.parse_args();run(json.loads(pathlib.Path(a.manifest).read_text()),a.task,a.work,a.evidence,a.node,a.installed,a.mode)
