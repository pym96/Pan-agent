"""Serial, zero-model hello-world controls; never a Terminal-Bench score."""
import argparse
import asyncio
import hashlib
import json
import math
import os
import shlex
import signal
import uuid
from pathlib import Path
from adapter import PanAgent
from harbor.environments.docker.docker import DockerEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.task.task import Task
from harbor.models.trial.paths import TrialPaths
from harbor.verifier.verifier import Verifier

HERE=Path(__file__).resolve().parent

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def reward(path):
    try:v=float(Path(path).read_text())
    except (OSError,ValueError) as e:raise RuntimeError('evaluation_error: missing/non-numeric reward') from e
    if not math.isfinite(v):raise RuntimeError('evaluation_error: non-finite reward')
    return v

async def docker(*args):
    p=await asyncio.create_subprocess_exec('docker',*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
    out,err=await p.communicate()
    if p.returncode:raise RuntimeError(err.decode())
    return out.decode()

def audit(info,logdir):
    h=info['HostConfig']; names=sorted(x.split('=',1)[0] for x in info['Config']['Env'])
    assert not h['Privileged'] and not h.get('CapAdd') and h['NetworkMode']!='host'
    assert h['NanoCpus']==1_000_000_000 and h['Memory']==2048*2**20 and not h.get('DeviceRequests')
    assert not h.get('Devices')
    assert all(m['Type']=='bind' and Path(m['Source']).resolve()==logdir.resolve() and m['Destination']=='/logs/verifier' for m in info['Mounts'])
    assert set(names)<= {'PATH','WO74_CANARY'}
    return {'id':info['Id'],'image':info['Image'],'mounts':info['Mounts'],'privileged':h['Privileged'],'cap_add':h.get('CapAdd'),'network':h['NetworkMode'],'nano_cpus':h['NanoCpus'],'memory':h['Memory'],'devices':h.get('Devices'),'device_requests':h.get('DeviceRequests'),'environment_names':names}

async def one(a,mode):
    target=a.output/mode;target.mkdir() # no accidental overwrite/reuse
    trial=TrialPaths(trial_dir=target);trial.mkdir()
    task=Task(a.harbor/'examples/tasks/hello-world')
    lock=json.loads((HERE/'identity.json').read_text())
    for f,digest in lock['task_files'].items():
        assert sha(a.harbor/'examples/tasks/hello-world'/f)==digest
    cfg=task.config.environment.model_copy(update={'docker_image':a.image})
    sid='wo74-'+mode+'-'+uuid.uuid4().hex[:12]
    env=DockerEnvironment(environment_dir=a.harbor/'examples/tasks/hello-world/environment',environment_name='wo74-hello-world',session_id=sid,trial_paths=trial,task_env_config=cfg,mounts=[{'type':'bind','source':str(trial.verifier_dir),'target':'/logs/verifier'}],persistent_env={'WO74_CANARY':'fake-not-a-credential'},keep_containers=True)
    (target/'owned.json').write_text(json.dumps({'compose_project':sid,'image':a.image})+'\n')
    container=None
    try:
        await asyncio.wait_for(env.start(force_build=False),task.config.environment.build_timeout_sec)
        # Lookup by this unpredictable controller-owned project, then bind immutable ID.
        ids=(await docker('ps','-aq','--filter','label=com.docker.compose.project='+sid,'--filter','label=com.docker.compose.service=main')).split()
        assert len(ids)==1;container=ids[0]
        (target/'owned.json').write_text(json.dumps({'compose_project':sid,'image':a.image,'container_id':container})+'\n')
        info=json.loads(await docker('inspect',container))[0]
        (target/'configuration.json').write_text(json.dumps(audit(info,trial.verifier_dir),indent=2)+'\n')
        assert info['Image']==a.image
        host=target/'host-canary';host.write_text('host-original\n')
        same=str(host)
        canary=f'test ! -e {shlex.quote(same)} && mkdir -p {shlex.quote(str(host.parent))} && printf container-only > {shlex.quote(same)} && cat {shlex.quote(same)} && printf "\\n%s\\n" "$WO74_CANARY" && test ! -e /var/run/docker.sock'
        sleep='sleep 30 & child=$!; printf "%s %s\\n" "$$" "$child" > /tmp/wo74-started; wait "$child"; printf should-not-complete'
        commands={'positive':[canary,"printf 'Hello, world!\\n' > /app/hello.txt; cat /app/hello.txt",'exit 7'], 'negative':[canary,'test ! -e /app/hello.txt'], 'timeout':[sleep], 'cancel':[sleep]}[mode]
        agent=PanAgent(logs_dir=trial.agent_dir)
        agent.bind(installed_entry=a.entry,mode=mode,commands=commands,container_id=info['Id'])
        await agent.setup(env)
        await asyncio.wait_for(agent.run(task.instruction,env,AgentContext()),task.config.agent.timeout_sec)
        assert host.read_text()=='host-original\n'
        trace=json.loads((trial.agent_dir/'trace.json').read_text())
        report={'mode':mode,'pan_terminal':trace['result']['status'],'real_provider_calls':0,'usage':'synthetic zero','host_canary_unchanged':True}
        if mode in ('positive','negative'):
            vr=await asyncio.wait_for(Verifier(task,trial,env).verify(),task.config.verifier.timeout_sec)
            value=reward(trial.reward_text_path)
            report.update(official=vr.model_dump(mode='json'),reward=value)
            assert value== (1 if mode=='positive' else 0)
            if mode=='positive':assert any(e['result']['exit_code']==7 for e in trace['effects'])
        else:
            assert agent.stopped
            assert any(e['result']['status']==('timeout' if mode=='timeout' else 'cancelled') for e in trace['effects'])
            if mode=='cancel':assert report['pan_terminal']=='cancelled'
            report['task_success']=False
        (target/'report.json').write_text(json.dumps(report,indent=2)+'\n')
        return report
    except BaseException as exc:
        (target/'failure.json').write_text(json.dumps({'type':type(exc).__name__,'message':str(exc)})+'\n');raise
    finally:
        if container:
            # Only stop the explicitly recorded owned ID; retain inspect and raw logs.
            await docker('stop','--time','1',container)
            state=json.loads(await docker('inspect',container))[0]['State']
            (target/'final-state.json').write_text(json.dumps(state,indent=2)+'\n')
            assert not state['Running'] and state['Pid']==0
        # Do not use Harbor delete=True (it also removes images). Keep stopped IDs for review.

async def main():
    task=asyncio.current_task()
    asyncio.get_running_loop().add_signal_handler(signal.SIGTERM,task.cancel)
    p=argparse.ArgumentParser();p.add_argument('--harbor',type=Path,required=True);p.add_argument('--entry',type=Path,required=True);p.add_argument('--image',required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--mode',choices=['positive','negative','timeout','cancel'],required=True)
    a=p.parse_args();a.output=a.output.resolve();a.output.mkdir(parents=True,exist_ok=True)
    assert a.image.startswith('sha256:') and len(a.image)==71
    assert '/node_modules/pan-agent/dist/index.js' in str(a.entry.resolve())
    installed=a.entry.resolve().parents[1]
    lock=json.loads((HERE/'identity.json').read_text())
    for relative,digest in lock['installed_pan_files'].items():
        if sha(installed/relative)!=digest:raise RuntimeError('installed Pan identity drift: '+relative)
    print(json.dumps(await one(a,a.mode)))

if __name__=='__main__':asyncio.run(main())
