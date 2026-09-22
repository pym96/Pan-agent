"""Criteria1.2 one installation phase (600s) and independent bounded cleanup (60s)."""
import argparse, hashlib, json, signal, subprocess, time, uuid, shutil
from pathlib import Path
from prepare import BASE
HERE=Path(__file__).resolve().parent
DEPENDENCY_ENV={'UV_DOWNLOAD_URL':'file:///opt/wo74','UV_PYTHON_PREFERENCE':'only-system','UV_OFFLINE':'1','UV_FIND_LINKS':'/opt/wo74/wheels'}

def cleanup(cid, output):
    start=time.monotonic()
    previous=signal.signal(signal.SIGTERM,signal.SIG_IGN)
    try:
        # At most 25s of subprocess waiting, below the separate 60s allowance.
        subprocess.run(['docker','stop','--timeout','1',cid],check=True,timeout=20)
        state=json.loads(subprocess.check_output(['docker','inspect',cid,'--format','{{json .State}}'],text=True,timeout=5))
        record={'container_id':cid,'elapsed_seconds':time.monotonic()-start,'state':state}
        (output/'cleanup.json').write_text(json.dumps(record,indent=2)+'\n')
        assert not state['Running'] and state['Pid']==0
    finally:signal.signal(signal.SIGTERM,previous)

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--budget-ledger',type=Path,required=True);a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=False)
    (a.output/'sources').mkdir()
    for name in ['prepare_prefetched.py','prepare-prefetched.sh','check-local-apt-uris.sh']:shutil.copy2(HERE/name,a.output/'sources'/name)
    ledger=json.loads(a.budget_ledger.read_text()) if a.budget_ledger.exists() else {'criteria':'1.3','limit_seconds':1800,'attempts':[]}
    assert ledger['criteria']=='1.3' and ledger['limit_seconds']==1800
    assert all('elapsed_work_seconds' in x for x in ledger['attempts']), 'unresolved earlier attempt'
    fingerprint=hashlib.sha256(b''.join((HERE/f).read_bytes() for f in ['prepare_prefetched.py','prepare-prefetched.sh','check-local-apt-uris.sh'])+(a.input/'SHA256SUMS').read_bytes()).hexdigest()
    assert not any(x['fingerprint']==fingerprint for x in ledger['attempts']), 'identical preparation input already attempted'
    work_limit=min(600,1800-sum(x['elapsed_work_seconds'] for x in ledger['attempts']))
    assert work_limit>0, 'preparation budget exhausted'
    attempt={'output':str(a.output),'fingerprint':fingerprint,'work_limit_seconds':work_limit}
    ledger['attempts'].append(attempt);a.budget_ledger.write_text(json.dumps(ledger,indent=2)+'\n')
    start=time.monotonic();cid=None;n=0
    def interrupted(*_):raise TimeoutError('installation interrupted; cleanup only')
    signal.signal(signal.SIGTERM,interrupted)
    def run(*cmd,limit=None):
        nonlocal n
        n+=1;remaining=work_limit-(time.monotonic()-start)
        with (a.output/'commands.jsonl').open('a') as journal:journal.write(json.dumps({'number':n,'argv':cmd,'remaining_work_seconds':remaining,'command_limit':limit})+'\n')
        if remaining<=0:raise TimeoutError('installation work deadline reached')
        with (a.output/f'command-{n:02d}.log').open('w') as log:
            result=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,timeout=min(remaining,limit or remaining))
        if result.returncode:raise RuntimeError(f'command {n} exit {result.returncode}')
        return (a.output/f'command-{n:02d}.log').read_text().strip()
    def create(label):
        nonlocal cid
        owned=run('docker','create','--name','wo74-v12-'+label+'-'+uuid.uuid4().hex[:12],'--cpus','1','--memory','2048m',BASE,'sleep','infinity')
        cid=owned
        (a.output/(label+'-id.json')).write_text(json.dumps({'container_id':owned})+'\n')
        info=json.loads(run('docker','inspect',owned))[0];h=info['HostConfig']
        assert info['Image']==BASE and not info['Mounts'] and not h['Privileged'] and not h.get('CapAdd') and not h.get('Devices') and not h.get('DeviceRequests') and h['NetworkMode']!='host'
        assert h['NanoCpus']==10**9 and h['Memory']==2048*2**20
        assert {e.split('=',1)[0] for e in info['Config']['Env']}=={'PATH'}
        (a.output/(label+'-owned.json')).write_text(json.dumps(info,indent=2)+'\n')
        return owned
    record={'base_image':BASE,'scheme':'Criteria1.3 authenticated uncompressed apt indexes','work_limit_seconds':work_limit,'cleanup_limit_seconds':60}
    try:
        # Real timeout of the candidate's work subprocess, then the same cleanup function.
        cid=create('timeout-probe');run('docker','start',cid)
        timed_out=False
        try:run('docker','exec',cid,'sleep','30',limit=1)
        except subprocess.TimeoutExpired:timed_out=True
        assert timed_out
        probe=a.output/'timeout-probe';probe.mkdir();cleanup(cid,probe);cid=None
        (probe/'result.json').write_text(json.dumps({'actual_subprocess_timeout':True,'work_seconds':1,'cleanup_function':'prepare_prefetched.cleanup'})+'\n')
        cid=create('installation');run('docker','start',cid)
        run('docker','exec',cid,'mkdir','-p','/opt/wo74')
        run('docker','cp',str(a.input)+'/.' ,cid+':/opt/wo74/')
        run('docker','cp',str(HERE/'prepare-prefetched.sh'),cid+':/tmp/wo74-prepare.sh')
        run('docker','cp',str(HERE/'check-local-apt-uris.sh'),cid+':/tmp/wo74-check-uris.sh')
        run('docker','exec',cid,'bash','/tmp/wo74-prepare.sh')
        run('docker','cp',cid+':/opt/wo74/apt-consumed-indexes.txt',str(a.output/'apt-consumed-indexes.txt'))
        run('docker','cp',cid+':/opt/wo74/apt-planned-uris.txt',str(a.output/'apt-planned-uris.txt'))
        changes=[]
        for key,value in DEPENDENCY_ENV.items():changes+=['--change',f'ENV {key}={value}']
        record['image_id']=run('docker','commit',*changes,cid)
        record.update(preflight='passed',container_id=cid,elapsed_work_seconds=time.monotonic()-start,dependency_env=DEPENDENCY_ENV)
    except BaseException as e:
        record.update(error=type(e).__name__+': '+str(e),elapsed_work_seconds=time.monotonic()-start)
        (a.output/'failure.json').write_text(json.dumps(record,indent=2)+'\n');raise
    finally:
        attempt.update(elapsed_work_seconds=time.monotonic()-start,successful=record.get('preflight')=='passed')
        a.budget_ledger.write_text(json.dumps(ledger,indent=2)+'\n')
        if cid:cleanup(cid,a.output)
    (a.output/'prepared.json').write_text(json.dumps(record,indent=2)+'\n')
if __name__=='__main__':main()
