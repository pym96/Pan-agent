"""Required Stage B gate. Run only with exact Master GO; missing Docker is failure, never skip."""
import json, pathlib, subprocess
from conftest import response,tool
from test_cli import terminal

def test_docker_goal_readonly_verifier_and_export(goal):
    assert subprocess.run(['docker','info'],capture_output=True).returncode==0
    (goal['root']/'host-sentinel').write_text('UNCHANGED')
    goal['fixture'].write_text(json.dumps([tool('write',{'path':'result.txt','content':'wrong'},'docker-a'),response(),tool('write',{'path':'result.txt','content':'correct'},'docker-b'),response()]))
    goal['verifier'].write_text(json.dumps({'version':'docker-v1','command':'test "$(cat result.txt)" = correct && ! touch denied-by-readonly','seconds':3}))
    args=goal['args']+['--sandbox-root',str(goal['root']/'sandbox'),'--total-model-calls','4','--total-tool-calls','2'];args[args.index('--for')+1]='45s'
    code,events,stderr=goal['run'](args)
    assert code==0,(events,stderr)
    assert [e['verdict']['status'] for e in events if e.get('type')=='goal.verdict']==['FAIL','PASS']
    assert terminal(events)['reason']=='succeeded'
    assert (goal['root']/'host-sentinel').read_text()=='UNCHANGED'
    states=list((goal['root']/'sandbox').glob('*/*/state.json'));assert len(states)==2
    for statepath in states:
        state=json.loads(statepath.read_text());assert state['phase']=='cleaned'
        assert subprocess.run(['docker','inspect',state['containerId']],capture_output=True).returncode!=0
        exported=pathlib.Path(state['exportPath'])
        assert (exported/'manifest.json').is_file() and (exported/'receipt.json').is_file()
        assert not (exported/'files'/'denied-by-readonly').exists()
    assert any('Read-only file system' in e['result']['stderr'] for e in events if e.get('type')=='verifier.result')

def test_docker_deadline_stops_generation_retains_artifact(case):
    case['fixture'].write_text(json.dumps([tool('bash',{'command':"echo artifact > result.txt; trap '' TERM; while :; do echo heartbeat >> heartbeat; sleep 0.05; done"},'docker-running')]))
    args=case['base']+['--sandbox-root',str(case['root']/'sandbox')];args[args.index('--for')+1]='6s'
    code,events,stderr=case['run'](args)
    assert code==0,(events,stderr)
    assert terminal(events)['reason']=='deadline_exceeded'
    assert next(e for e in events if e.get('type')=='execution.stop_latency')['ms']<=5000
    states=list((case['root']/'sandbox').glob('*/*/state.json'));assert len(states)==1
    state=json.loads(states[0].read_text());assert state['phase']=='cleaned'
    assert subprocess.run(['docker','inspect',state['containerId']],capture_output=True).returncode!=0
    assert (pathlib.Path(state['exportPath'])/'files'/'result.txt').read_text().strip()=='artifact'
