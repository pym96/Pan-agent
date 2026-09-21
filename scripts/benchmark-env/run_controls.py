"""Serial, ledger-bound control runner. Manifest must be frozen before invocation."""
import argparse,hashlib,json,pathlib,sys
from resources import Resources
from verify_inputs import verify

def run(manifest_path,work,evidence,label):
    root=pathlib.Path(__file__).parent;work=pathlib.Path(work);evidence=pathlib.Path(evidence)
    manifest=json.loads(pathlib.Path(manifest_path).read_text())
    for name,digest in manifest['driver_files'].items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('driver differs from frozen manifest: '+name)
    env={'PATH':'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin','HOME':str(work),'DOCKER_CONFIG':str(work/'docker-config'),'LANG':'en_US.UTF-8'}
    checked=verify(manifest,work,evidence)
    (evidence/(label+'-verified-inputs.json')).write_text(json.dumps(checked,indent=2)+'\n')
    resources=Resources(evidence,work)
    common=['--manifest',str(manifest_path),'--work',str(work),'--evidence',str(evidence)]
    jobs=[]
    for task in ('swe','da'):
        for mode in (None,'timeout','cancel'):
            args=[sys.executable,str(root/'run_installed.py'),*common,'--task',task,'--node',manifest['node'],'--installed',manifest['installed_entry']]
            if mode:args+=['--mode',mode]
            jobs.append((task+'-'+(mode or 'trace'),args))
    jobs.append(('isolation',[sys.executable,str(root/'isolation_controls.py'),*common]))
    jobs.append(('facade-collision',[sys.executable,str(root/'facade_collision_control.py'),'--manifest',str(manifest_path),'--evidence',str(evidence)]))
    for domain in ('swe','da'):
        for control in ('gold','incorrect'):
            jobs.append((domain+'-'+control,[sys.executable,str(root/('run_'+domain+'_evaluator.py')),*common,'--control',control]))
    for name,command in jobs:
        resources.run(label+'-'+name,command,env=env,timeout=1800,estimate=2*2**30)
    resources.run(label+'-projection',[sys.executable,str(root/'projection.py'),str(work/'trace-da/trace.json'),str(work/'da-projection')],env=env,timeout=60)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for name in ('manifest','work','evidence','label'):p.add_argument('--'+name,required=True)
    a=p.parse_args();run(a.manifest,a.work,a.evidence,a.label)
