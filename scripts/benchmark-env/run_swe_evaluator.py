"""Pinned official run_instance, restricted Docker facade and cleanup transport."""
import argparse,hashlib,json,os,pathlib,secrets,socketserver,sys,threading
from evaluator_facade import restricted_client

def run(manifest,work,evidence,control):
    import docker
    import pyarrow.parquet as pq
    work=pathlib.Path(work);evidence=pathlib.Path(evidence)
    # No cloud/model/account TCP endpoint can be reached by this process.
    denied=[]
    def guard(event,args):
        if event=='socket.connect':
            address=args[1]
            if not isinstance(address,str) or address not in ('/Users/panyiming/.docker/run/docker.sock',str(work/'cleanup.sock')):
                denied.append(event);raise RuntimeError('nonlocal network denied')
    sys.addaudithook(guard)
    from swebench.harness.run_evaluation import run_instance
    from swebench.harness.utils import make_test_spec
    data=evidence/'dev.parquet'
    assert hashlib.sha256(data.read_bytes()).hexdigest()=='b90bcbfaca1b5f65155500124a977876c264a4003ab384aca4dfc39a54bef89f'
    row=next(r for r in pq.read_table(data).to_pylist() if r['instance_id']=='pydicom__pydicom-901')
    image_ref='swebench/sweb.eval.x86_64.pydicom_1776_pydicom-901@sha256:9eefbfc3074839815a9f3a319a78980aa2d568b828087457df54e11caf849865'
    row['image']=image_ref
    spec=make_test_spec(row)
    if spec.image_assets:raise RuntimeError('unexpected asset acquisition')
    run_id='wo71-'+control+'-'+secrets.token_hex(4)
    root=work/run_id;root.mkdir();os.chdir(root)
    receipts=[]
    def record(value):
        receipts.append(value)
        (evidence/(run_id+'-facade.json')).write_text(json.dumps(receipts,indent=2)+'\n')
    raw=docker.DockerClient(base_url=manifest['docker_endpoint'],timeout=60)
    client,dispatch,cleanup=restricted_client(raw,image_id='sha256:91e8d1bd92fe29da1112e613c0753037fb874da7b99fb03719b182ff7cd2651d',image_refs={image_ref},run_id=run_id,receipt=record)
    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            try:
                argv=json.loads(self.rfile.readline(1025));dispatch(argv);answer={'ok':True}
            except Exception:answer={'ok':False}
            self.wfile.write(json.dumps(answer).encode()+b'\n')
    socket_path=work/'cleanup.sock'
    if socket_path.exists():raise RuntimeError('existing cleanup socket')
    server=socketserver.UnixStreamServer(str(socket_path),Handler);os.chmod(socket_path,0o600)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    bindir=root/'bin';bindir.mkdir()
    shim=bindir/'docker';shim.write_text('#!'+sys.executable+'\n'+pathlib.Path(__file__).with_name('cleanup_cli.py').read_text());shim.chmod(0o700)
    os.environ['PATH']=str(bindir);os.environ['WO71_FACADE_SOCKET']=str(socket_path)
    wrong='diff --git a/wo71_incorrect.txt b/wo71_incorrect.txt\nnew file mode 100644\nindex 0000000..1fd8ab2\n--- /dev/null\n+++ b/wo71_incorrect.txt\n@@ -0,0 +1 @@\n+Deliberately does not fix the bug.\n'
    patch=row['patch'] if control=='gold' else wrong
    prediction={'instance_id':spec.instance_id,'model_name_or_path':'wo71-evaluator-fixture-'+control,'model_patch':patch}
    report=None
    try:
        report=run_instance(spec,prediction,client,run_id,timeout=1800)
        if report is None:raise RuntimeError('official evaluator returned no report')
        resolved=report[1][spec.instance_id]['resolved']
        if resolved != (control=='gold'):raise RuntimeError('official score control mismatch')
    finally:
        cleanup();server.shutdown();server.server_close();thread.join(timeout=5);socket_path.unlink()
        summary={'control':control,'kind':'official scoring under restricted deployment; evaluator fixture, not Pan achievement','run_id':run_id,'report':report,'original_logs':str(root/'logs'),'denied_network_attempts':denied,'facade_receipts':run_id+'-facade.json'}
        (evidence/(run_id+'-result.json')).write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({'run_id':run_id,'resolved':resolved}))
if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('manifest','work','evidence','control'):p.add_argument('--'+name,required=True)
    a=p.parse_args();run(json.loads(pathlib.Path(a.manifest).read_text()),a.work,a.evidence,a.control)
