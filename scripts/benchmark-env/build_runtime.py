"""Bounded offline runtime-image preparation; no task/evaluation is executed."""
import argparse, hashlib, io, json, pathlib, tarfile, time
import docker

SOCKET='unix:///Users/panyiming/.docker/run/docker.sock'
def build(work, evidence, arch, base):
    root=pathlib.Path(work);out=pathlib.Path(evidence)
    raw=docker.DockerClient(base_url=SOCKET,timeout=120)
    image=raw.images.get(base)
    expected='amd64' if arch=='x86_64' else 'arm64'
    assert image.attrs['Architecture']==expected
    directory=root/('wheels-'+arch)
    files=sorted(directory.glob('*.whl'))
    assert files and sum(p.stat().st_size for p in files)<768*2**20
    manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    run='wo71-runtime-'+arch
    obj=raw.containers.create(image.id,name=run,command=['tail','-f','/dev/null'],
        network_mode='none',nano_cpus=2_000_000_000,mem_limit=4*2**30,pids_limit=512,
        cap_drop=['ALL'],security_opt=['no-new-privileges'],
        labels={'pan.workorder':'71','pan.run':run},
        environment={'PATH':'/opt/miniconda3/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/tmp'})
    result={'container_id':obj.id,'base':image.id,'wheel_sha256':manifest,'kind':'offline dependency build, not task/control execution'}
    try:
        obj.reload();h=obj.attrs['HostConfig']
        assert not h.get('CapAdd') and not h['Privileged'] and h['NetworkMode']=='none'
        assert h['Memory']==4*2**30 and h['NanoCpus']==2_000_000_000 and h['PidsLimit']==512
        result['host_config']=h
        obj.start()
        buf=io.BytesIO()
        with tarfile.open(fileobj=buf,mode='w') as tar:
            for path in files:tar.add(path,arcname='wo71-wheels/'+path.name)
        assert obj.put_archive('/tmp',buf.getvalue())
        python='/opt/miniconda3/bin/python' if arch=='x86_64' else '/usr/local/bin/python'
        commands=[[python,'-m','venv','/opt/wo71-venv'],
                  ['/opt/wo71-venv/bin/python','-m','pip','--isolated','--disable-pip-version-check','install','--no-index','--find-links','/tmp/wo71-wheels','swe-rex','aiohttp']]
        if arch=='aarch64':commands[1]+=['numpy','pandas','Pillow','fuzzywuzzy','opencv-python-headless','PyYAML','duckdb','scikit-learn','joblib','json5','jsonlines','tqdm','tabulate']
        for i,cmd in enumerate(commands):
            r=obj.exec_run(cmd)
            (out/(run+'-'+str(i)+'.log')).write_bytes(r.output)
            if r.exit_code:raise RuntimeError('offline dependency build failed '+str(r.exit_code))
        r=obj.exec_run(['/opt/wo71-venv/bin/python','-c','import swerex.server;print("SWE-ReX import ready")'])
        (out/(run+'-import.log')).write_bytes(r.output)
        if r.exit_code:raise RuntimeError('SWE-ReX import failed')
        r=obj.exec_run(['rm','-rf','/tmp/wo71-wheels'])
        if r.exit_code:raise RuntimeError('owned wheel cleanup failed')
        result['runtime_image_id']=obj.commit(repository='wo71/runtime-'+arch,tag='candidate').id
    finally:
        current=raw.containers.get(obj.id)
        assert current.id==result['container_id'] and current.labels.get('pan.run')==run
        current.remove(force=True)
        result['owned_container_removed']=True
        (out/(run+'-build.json')).write_text(json.dumps(result,indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--work',required=True);p.add_argument('--evidence',required=True);p.add_argument('--arch',required=True);p.add_argument('--base',required=True)
    a=p.parse_args();build(a.work,a.evidence,a.arch,a.base)
