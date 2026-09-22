"""One recorded preparation plan, <=600s; external resource launcher remains required."""
import argparse, hashlib, json, subprocess, time, uuid, signal
from pathlib import Path
BASE='sha256:d84ac69e7810ab577455f4b95fe1452285a8d812c533fd4562ff37c618fd4d54'
HERE=Path(__file__).resolve().parent

def stop_owned(cid, output):
    # The outer deadline can coincide with an inner timeout. Do not let its
    # SIGTERM interrupt the bounded cleanup of our explicitly recorded ID.
    previous=signal.signal(signal.SIGTERM,signal.SIG_IGN)
    try:
        subprocess.run(['docker','stop','--timeout','1',cid],check=True,timeout=3)
        state=subprocess.check_output(['docker','inspect',cid,'--format','{{json .State}}'],text=True,timeout=1)
        (output/'final-state.json').write_text(state)
        parsed=json.loads(state)
        if parsed['Running'] or parsed['Pid']!=0:raise RuntimeError('preparation container remains running')
    finally:
        signal.signal(signal.SIGTERM,previous)

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--ca-bundle',type=Path,required=True);p.add_argument('--round',type=int,choices=[1,2],required=True);a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=False)
    script=HERE/('prepare.sh' if a.round==1 else 'prepare-round2.sh')
    host_canary=a.output/'host-canary';host_canary.write_text('host-original\n')
    start=time.monotonic();cid=None
    def interrupted(*_):raise TimeoutError('preparation interrupted')
    signal.signal(signal.SIGTERM,interrupted)
    command_number=0
    def run(*args):
        nonlocal command_number
        command_number+=1
        remaining=600-(time.monotonic()-start)
        if remaining<=0:raise TimeoutError('preparation 600s exhausted')
        print(json.dumps({'command':args,'elapsed':time.monotonic()-start}),flush=True)
        log=a.output/f'command-{command_number:02d}.log'
        with log.open('w') as stream:
            r=subprocess.run(args,stdout=stream,stderr=subprocess.STDOUT,text=True,timeout=remaining)
        output=log.read_text()
        print(output,flush=True)
        if r.returncode:raise RuntimeError('preparation command failed: '+str(r.returncode))
        return output.strip()
    def check(label):
        info=json.loads(run('docker','inspect',cid))[0]
        h=info['HostConfig']
        assert not info['Mounts'] and not h['Privileged'] and not h.get('CapAdd') and h['NetworkMode']!='host'
        assert h['NanoCpus']==10**9 and h['Memory']==2048*2**20 and not h.get('Devices') and not h.get('DeviceRequests')
        assert {v.split('=',1)[0] for v in info['Config']['Env']}=={'PATH'}
        (a.output/(label+'.json')).write_text(json.dumps(info,indent=2)+'\n')
    record={'round':a.round,'base_image':BASE,'ca_bundle_sha256':hashlib.sha256(a.ca_bundle.read_bytes()).hexdigest(),'script_sha256':hashlib.sha256(script.read_bytes()).hexdigest(),'started_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    try:
        cid=run('docker','create','--name','wo74-prep-'+uuid.uuid4().hex[:12],'--cpus','1','--memory','2048m',BASE,'sleep','infinity')
        record['container_id']=cid
        (a.output/'owned.json').write_text(json.dumps(record,indent=2)+'\n')
        check('before')
        run('docker','start',cid)
        run('docker','exec',cid,'sh','-c','test ! -e "$1" && mkdir -p "$(dirname "$1")" && printf container-only > "$1"','canary',str(host_canary))
        assert host_canary.read_text()=='host-original\n'
        run('docker','exec',cid,'sh','-c','test ! -e /app/hello.txt && test ! -e /tests && test ! -e /logs && test ! -e /var/run/docker.sock && mkdir -p /etc/ssl/certs')
        # Public CA trust roots from pinned certifi, not a credential or host mount.
        run('docker','cp',str(a.ca_bundle),cid+':/etc/ssl/certs/ca-certificates.crt')
        run('docker','cp',str(script),cid+':/tmp/wo74-prepare.sh')
        run('docker','exec',cid,'bash','/tmp/wo74-prepare.sh')
        run('docker','exec',cid,'sh','-c','test "$(cat "$1")" = container-only && rm "$1"','canary',str(host_canary))
        assert host_canary.read_text()=='host-original\n'
        record['preparation_canary']='host unchanged, container-only file checked then removed'
        check('after')
        record['image_id']=run('docker','commit',cid)
        record.update(preflight='passed',elapsed_seconds=time.monotonic()-start)
        (a.output/'prepared.json').write_text(json.dumps(record,indent=2)+'\n')
    except BaseException as e:
        record.update(error=type(e).__name__+': '+str(e),elapsed_seconds=time.monotonic()-start)
        (a.output/'failure.json').write_text(json.dumps(record,indent=2)+'\n');raise
    finally:
        if cid:
            stop_owned(cid,a.output)

if __name__=='__main__':main()
