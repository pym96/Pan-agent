"""Single owned task container + pinned SWE-ReX RemoteRuntime. No model client."""
import asyncio,io,json,pathlib,secrets,socket,tarfile,threading,time,hmac,base64,shlex
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import docker
from swerex.runtime.remote import RemoteRuntime
from swerex.runtime.abstract import Command

class TaskRuntime:
    def __init__(self,manifest,task,evidence):
        self.evidence=pathlib.Path(evidence);self.task=task;self.raw=docker.DockerClient(base_url=manifest['docker_endpoint'],timeout=20)
        self.identity='wo71-'+task+'-'+secrets.token_hex(6);self.labels={'pan.workorder':'71','pan.run':self.identity}
        self.network=None;self.container=None;self.connection=None;self.proxy=None;self.token=secrets.token_hex(32);self.stopped=False
        config=manifest['tasks'][task];self.cwd=config['cwd'];self.config=config
        try:
            self.container=self.raw.containers.create(config['runtime_image_id'],name=self.identity,command=['tail','-f','/dev/null'],
                nano_cpus=2_000_000_000,mem_limit=4*2**30,pids_limit=512,cap_drop=['ALL'],security_opt=['no-new-privileges'],
                network_mode='none',labels=self.labels,
                environment={'PATH':'/opt/wo71-venv/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/tmp'})
            self.container.reload();self.verify()
            self.copy({pathlib.Path(__file__).with_name('server_bootstrap.py'):'wo71-bootstrap.py',pathlib.Path(__file__).with_name('http_relay.py'):'wo71-http-relay.py'},'/tmp')
            if task=='da':
                paths={pathlib.Path(k):v for k,v in config['input_files'].items()}
                self.copy(paths,'/tmp')
            self.container.start();self.container.reload();self.verify()
            self.port=config['control_port']
            info=self.raw.api.exec_create(self.container.id,['/opt/wo71-venv/bin/python','/tmp/wo71-bootstrap.py'],stdin=True,stdout=True,stderr=True)
            self.connection=self.raw.api.exec_start(info['Id'],socket=True)
            self.connection._sock.sendall((self.token+'\n').encode())
            self.start_proxy()
            self.remote=RemoteRuntime(host='http://127.0.0.1',port=self.port,auth_token=self.token,timeout=10)
            deadline=time.monotonic()+60
            while time.monotonic()<deadline:
                if asyncio.run(self.remote.is_alive(timeout=10)).is_alive:break
                time.sleep(.5)
            else:raise TimeoutError('bounded serial readiness timeout')
            self.record={'container_id':self.container.id,'network_id':None,'port':self.port,'image_id':config['runtime_image_id'],'host_config':self.container.attrs['HostConfig'],'mounts':self.container.attrs['Mounts'],'environment':self.container.attrs['Config']['Env'],'task':task}
            (self.evidence/(self.identity+'-config.json')).write_text(json.dumps(self.record,indent=2)+'\n')
        except BaseException:
            self.close();raise
    def start_proxy(self):
        owner=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_GET(self):self.forward()
            def do_POST(self):self.forward()
            def forward(self):
                if not hmac.compare_digest(self.headers.get('X-API-Key',''),owner.token):
                    self.send_response(401);self.end_headers();self.wfile.write(b'{"detail":"Unauthorized"}');return
                if self.path not in ('/is_alive','/execute'):
                    self.send_error(404);return
                size=int(self.headers.get('Content-Length','0'))
                if not 0<=size<=65536:self.send_error(413);return
                body=self.rfile.read(size).decode()
                headers={k:self.headers[k] for k in ('X-API-Key','X-Request-ID','Content-Type') if k in self.headers}
                try:
                    answer=owner.relay({'method':self.command,'path':self.path,'headers':headers,'body':body})
                    self.send_response(answer['status']);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(answer['body'].encode())
                except (BrokenPipeError,ConnectionResetError):pass
                except Exception:
                    try:
                        self.send_response(503);self.end_headers();self.wfile.write(b'{"detail":"container relay unavailable"}')
                    except (BrokenPipeError,ConnectionResetError):pass
        self.proxy=ThreadingHTTPServer(('127.0.0.1',self.port),Handler)
        self.proxy.daemon_threads=True
        threading.Thread(target=self.proxy.serve_forever,daemon=True).start()
    def relay(self,request):
        if self.stopped:raise RuntimeError('task stopped')
        obj=self.raw.containers.get(self.container.id)
        if any(obj.labels.get(k)!=v for k,v in self.labels.items()):raise RuntimeError('ownership mismatch')
        entry=self.raw.api.exec_create(obj.id,['/opt/wo71-venv/bin/python','/tmp/wo71-http-relay.py'],stdin=True,stdout=True,stderr=True)
        channel=self.raw.api.exec_start(entry['Id'],socket=True)
        try:
            channel._sock.settimeout(45)
            channel._sock.sendall((json.dumps(request)+'\n').encode())
            chunks=b''
            while True:
                data=channel.read(65536)
                if not data:break
                chunks+=data
                if len(chunks)>2**20:raise RuntimeError('bounded relay overflow')
            stdout=b'';offset=0
            while offset<len(chunks):
                header=chunks[offset:offset+8]
                if len(header)!=8:raise RuntimeError('incomplete relay frame')
                size=int.from_bytes(header[4:8],'big');payload=chunks[offset+8:offset+8+size]
                if len(payload)!=size:raise RuntimeError('incomplete relay body')
                if header[0]==1:stdout+=payload
                offset+=8+size
            return json.loads(stdout)
        finally:channel.close()
    def verify(self):
        a=self.container.attrs;h=a['HostConfig']
        assert not h['Privileged'] and not h.get('CapAdd') and h['CapDrop']==['ALL']
        assert h['Memory']==4*2**30 and h['NanoCpus']==2_000_000_000 and h['PidsLimit']==512
        assert set(h['SecurityOpt'])=={'no-new-privileges'} and not a['Mounts']
        assert h['NetworkMode']=='none' and not h.get('PortBindings')
        assert a['Image']==self.config['runtime_image_id']
    def copy(self,files,destination):
        b=io.BytesIO()
        with tarfile.open(fileobj=b,mode='w') as tar:
            for path,name in files.items():
                if not path.is_file() or path.is_symlink() or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts:raise ValueError('unsafe staged input')
                tar.add(path,arcname=name,recursive=False)
        if len(b.getvalue())>16*2**20:raise ValueError('staging too large')
        assert self.container.put_archive(destination,b.getvalue())
    def execute(self,command,timeout=10):
        if self.stopped:raise RuntimeError('task stopped')
        if not isinstance(command,str) or len(command)>32768 or not 0<timeout<=30:raise ValueError('invalid command')
        try:
            result=asyncio.run(asyncio.wait_for(self.remote.execute(Command(command=['/bin/bash','-c',command],cwd=self.cwd,timeout=timeout,check=False)),timeout+2))
            return result.model_dump()
        except BaseException:
            self.stop();raise
    def export(self,name):
        if name not in ('result.csv','wo71-fixture.txt'):
            raise ValueError('export name outside fixed allowlist')
        program="""import os,stat,json,base64
fd=os.open(NAME,os.O_RDONLY|os.O_NOFOLLOW)
try:
 info=os.fstat(fd)
 if not stat.S_ISREG(info.st_mode) or info.st_size>65536:raise ValueError('unsupported export')
 data=os.read(fd,65537)
 if len(data)>65536:raise ValueError('export grew beyond limit')
 print(json.dumps({'base64':base64.b64encode(data).decode()}))
finally:os.close(fd)
""".replace('NAME',repr(name))
        result=self.execute('/opt/wo71-venv/bin/python -c '+shlex.quote(program),10)
        if result['exit_code']!=0:raise ValueError('unsafe or missing task export')
        data=base64.b64decode(json.loads(result['stdout'])['base64'],validate=True)
        if len(data)>65536:raise ValueError('export size exceeded')
        return data
    def stop(self):
        if self.container and not self.stopped:
            obj=self.raw.containers.get(self.container.id)
            if obj.id!=self.container.id or any(obj.labels.get(k)!=v for k,v in self.labels.items()):raise RuntimeError('ownership mismatch')
            obj.kill();self.stopped=True
            obj.reload()
            assert not obj.attrs['State']['Running']
            (self.evidence/(self.identity+'-stopped.json')).write_text(json.dumps({'container_id':obj.id,'running':False,'reason':'bounded timeout or cancellation'},indent=2)+'\n')
    def close(self):
        if self.proxy:
            self.proxy.shutdown();self.proxy.server_close();self.proxy=None
        if self.connection:
            self.connection.close();self.connection=None
        if self.container:
            obj=self.raw.containers.get(self.container.id)
            if any(obj.labels.get(k)!=v for k,v in self.labels.items()):raise RuntimeError('ownership mismatch')
            obj.remove(force=True);self.container=None;self.stopped=True
        if self.network:
            obj=self.raw.networks.get(self.network.id)
            if any(obj.attrs.get('Labels',{}).get(k)!=v for k,v in self.labels.items()):raise RuntimeError('network ownership mismatch')
            obj.remove();self.network=None
