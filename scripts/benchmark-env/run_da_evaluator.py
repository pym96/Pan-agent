"""Fresh bounded DA-Code official CLI controls; gold stays evaluator-only."""
import argparse,csv,hashlib,io,json,pathlib,secrets,tarfile
import docker

def run(manifest,work,evidence,control):
    work=pathlib.Path(work);evidence=pathlib.Path(evidence);source=work/'sources/da-code'
    raw=docker.DockerClient(base_url=manifest['docker_endpoint'],timeout=90)
    name='wo71-da-eval-'+control+'-'+secrets.token_hex(4);labels={'pan.workorder':'71','pan.run':name}
    gold=(source/'da_code/gold/data-sa-001/result.csv').read_bytes()
    line=next(line for line in (source/'da_code/configs/eval/eval_all.jsonl').read_text().splitlines() if json.loads(line)['id']=='data-sa-001')
    config=json.loads(line);assert config['func']==['compare_csv']
    fixture={'trajectory':[],'finished':True,'steps':0,'result':'result.csv','result_files':{'added_files':['result.csv'],'changed_files':[]},'wo71_kind':'controller evaluator fixture; not Pan or DA-Agent trajectory'}
    prediction=gold
    if control=='incorrect':
        reader=csv.DictReader(io.StringIO(gold.decode()));rows=list(reader)
        for row in rows:row['result']='WO71_DELIBERATELY_OUTSIDE_ALLOWED_ANSWERS'
        s=io.StringIO();writer=csv.DictWriter(s,fieldnames=reader.fieldnames);writer.writeheader();writer.writerows(rows);prediction=s.getvalue().encode()
    files={'eval/config.jsonl':(line+'\n').encode(),'eval/gold/data-sa-001/result.csv':gold,'eval/output/data-sa-001/dabench/result.json':json.dumps(fixture).encode(),'eval/output/data-sa-001/result.csv':prediction}
    for p in source.rglob('*.py'):
        if not p.is_symlink():files['eval/'+str(p.relative_to(source))]=p.read_bytes()
    obj=raw.containers.create(manifest['tasks']['da']['runtime_image_id'],name=name,command=['tail','-f','/dev/null'],network_mode='none',nano_cpus=2_000_000_000,mem_limit=4*2**30,pids_limit=512,cap_drop=['ALL'],security_opt=['no-new-privileges'],labels=labels,environment={'PATH':'/opt/wo71-venv/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/tmp'})
    record={'control':control,'kind':'controller evaluator fixture; not Pan achievement','container_id':obj.id,'input_sha256':{k:hashlib.sha256(v).hexdigest() for k,v in files.items()}}
    try:
        obj.reload();h=obj.attrs['HostConfig'];record['host_config']=h
        assert not h['Privileged'] and not h.get('CapAdd') and h['CapDrop']==['ALL'] and h['NetworkMode']=='none'
        assert h['Memory']==4*2**30 and h['NanoCpus']==2_000_000_000 and h['PidsLimit']==512 and not obj.attrs['Mounts']
        b=io.BytesIO()
        with tarfile.open(fileobj=b,mode='w') as tar:
            for path,data in files.items():
                member=tarfile.TarInfo(path);member.size=len(data);tar.addfile(member,io.BytesIO(data))
        assert obj.put_archive('/tmp',b.getvalue());obj.start()
        command=['/opt/wo71-venv/bin/python','/tmp/eval/evaluate.py','--output_dir','/tmp/eval/output','--gold_dir','/tmp/eval/gold','--eval_json','/tmp/eval/config.jsonl','--result_dir','/tmp/eval/results','--timeout_seconds','60']
        record['command']=command
        result=obj.exec_run(command,workdir='/tmp/eval');record['exit']=result.exit_code
        (evidence/(name+'.log')).write_bytes(result.output)
        if result.exit_code:raise RuntimeError('official evaluator infrastructure failure')
        result=obj.exec_run(['cat','/tmp/eval/results/output.json'])
        if result.exit_code:raise RuntimeError('missing official report')
        report=json.loads(result.output);record['report']=report
        score=report['average_score']
        assert score==1 if control=='gold' else 0<=score<1
    finally:
        obj.reload()
        if obj.id!=record['container_id'] or any(obj.labels.get(k)!=v for k,v in labels.items()):raise RuntimeError('ownership mismatch')
        obj.remove(force=True);record['owned_container_removed']=True
        (evidence/(name+'-result.json')).write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'control':control,'official_score':score}))
if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('manifest','work','evidence','control'):p.add_argument('--'+name,required=True)
    a=p.parse_args();run(json.loads(pathlib.Path(a.manifest).read_text()),a.work,a.evidence,a.control)
