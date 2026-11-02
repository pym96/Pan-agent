import json, os, signal, subprocess, time
import pytest
from conftest import response, tool

def terminal(events):
    return next(e for e in reversed(events) if e.get('type')=='execution.terminal')

def test_real_fixed_rate(case):
    code,events,stderr=case['run']()
    assert code==0,stderr
    starts=[e for e in events if e.get('type')=='execution.attempt']
    assert len(starts)==4
    assert all(0<=e['actual']-e['planned']<=500 and e['actual']<e['deadline'] for e in starts)
    assert terminal(events)['counts']['modelCalls']==4
    assert terminal(events)['reason']=='deadline_exceeded'
    assert next(e for e in events if e.get('type')=='execution.stop_latency')['ms']<=5000
    assert list((case['root']/'state'/'archive'/'runs').glob('*/manifest.json'))
    assert len(list((case['root']/'memory').glob('*/runs/*/manifest.json')))==4

@pytest.mark.parametrize('value',['0s','-1s','NaNs','999999999999h'])
def test_invalid_has_no_effects(case,value):
    args=case['base'][:];args[args.index('--for')+1]=value
    code,events,_=case['run'](args)
    assert code==2 and not events
    assert not (case['root']/'state').exists()

def test_goal_fail_feedback_pass(goal):
    goal['fixture'].write_text(json.dumps([tool('write',{'path':'result.txt','content':'wrong'},'a'),response(),tool('write',{'path':'result.txt','content':'correct'},'b'),response()]))
    args=goal['args']+['--total-model-calls','4','--total-tool-calls','2']
    code,events,stderr=goal['run'](args)
    assert code==0, (events,stderr)
    assert [e['verdict']['status'] for e in events if e.get('type')=='goal.verdict']==['FAIL','PASS']
    assert terminal(events)['reason']=='succeeded' and terminal(events)['counts']['modelCalls']==4
    tasks=[e['observation']['task'] for e in events if e.get('type')=='worker.observation' and e['observation']['type']=='run.started']
    assert 'Independent verification feedback' in tasks[1]
    assert len([e for e in events if e.get('type')=='execution.attempt'])==2
    assert (goal['workspace']/'result.txt').read_text()=='correct'

@pytest.mark.parametrize('exit_code,expected',[(2,'needs_review'),(1,'deadline_exceeded')])
def test_unknown_vs_repeated_fail(goal,exit_code,expected):
    goal['verifier'].write_text(json.dumps({'version':'v1','command':f'exit {exit_code}','seconds':1}))
    goal['fixture'].write_text(json.dumps([response()]*300))
    args=goal['args'][:];args[args.index('--for')+1]='700ms'
    code,events,stderr=goal['run'](args)
    assert code==1,(events,stderr)
    assert terminal(events)['reason']==expected
    assert not any(e.get('type')=='goal.verdict' and e['verdict']['status']=='PASS' for e in events)

def test_mutating_verifier_cannot_authorize_success(goal):
    (goal['workspace']/'result.txt').write_text('original')
    goal['verifier'].write_text(json.dumps({'version':'v1','command':'chmod u+w result.txt; echo changed > result.txt; exit 0','seconds':1}))
    code,events,_=goal['run'](goal['args']);assert code==1;assert terminal(events)['reason']=='needs_review'

def test_per_run_limit_and_outer_limit(case):
    case['fixture'].write_text(json.dumps([response()]*20))
    code,events,_=case['run'](case['base']+['--total-model-calls','1'])
    assert code==1 and terminal(events)['reason']=='budget_exhausted'
    assert terminal(events)['counts']['modelCalls']==1

def test_uncooperative_shell_stop_and_sentinel(case):
    case['fixture'].write_text(json.dumps([tool('bash',{'command':"trap '' TERM; while :; do echo beat >> heartbeat; sleep 0.05; done"},'shell')]))
    sentinel=subprocess.Popen(['sleep','20'])
    try:
        code,events,stderr=case['run']()
        assert code==0,(events,stderr)
        assert terminal(events)['reason']=='deadline_exceeded'
        assert any(e.get('type')=='process.owned' for e in events)
        beat=case['workspace']/'heartbeat';before=beat.read_bytes();time.sleep(.2);assert beat.read_bytes()==before
        assert sentinel.poll() is None
        assert next(e for e in events if e.get('type')=='execution.stop_confirmed')['confirmed']
    finally:
        sentinel.terminate();sentinel.wait()

def test_state_reuse_is_inspect_only(case):
    args=case['base'][:];args[args.index('--for')+1]='300ms'
    code,events,_=case['run'](args);assert code==0
    code,events,_=case['run'](args);assert code==2 and not events
    code,events,_=case['run']([str(case['installed']),'execution','inspect','--state',str(case['root']/'state')]);assert code==0 and events[0]['result']['reason']=='deadline_exceeded'

def test_controller_crash_stops_worker_and_preserves_uncertain_admission(case):
    case['fixture'].write_text(json.dumps([{'kind':'pending'}]))
    killed=False
    def crash(event,proc):
        nonlocal killed
        if event.get('type')=='budget.reserved' and not killed:
            meta=json.loads((case['root']/'state'/'execution.json').read_text());os.kill(meta['controllerPid'],signal.SIGKILL);killed=True
    code,events,_=case['run'](on_event=crash);assert code!=0 and killed
    assert not (case['root']/'state'/'result.json').exists()
    raw=next((case['root']/'state'/'archive'/'runs').glob('*/events.jsonl')).read_text();assert 'budget.reserved' in raw
    time.sleep(.2)
    identity=next(e for e in events if e.get('type')=='worker_identity')
    try: os.kill(identity['workerPid'],0)
    except ProcessLookupError: pass
    else: pytest.fail('worker remained after controller death')

def test_frozen_supervisor_returns_bounded_unknown(case):
    case['fixture'].write_text(json.dumps([{'kind':'pending'}]))
    args=case['base'][:];args[args.index('--for')+1]='2s'
    supervisor=None;frozen=False
    def freeze(event,proc):
        nonlocal supervisor,frozen
        if event.get('type')=='worker_identity': supervisor=event['supervisorPid']
        if event.get('type')=='budget.reserved' and supervisor and not frozen:
            os.kill(supervisor,signal.SIGSTOP);frozen=True
    try:
        code,events,stderr=case['run'](args,on_event=freeze)
        assert frozen and code==1,(events,stderr)
        assert terminal(events)['reason']=='stop_unconfirmed'
        latency=next(e for e in events if e.get('type')=='execution.stop_latency')
        assert latency['ms']<=5000 and not latency['workerConfirmed']
    finally:
        if supervisor:
            try:os.kill(supervisor,signal.SIGCONT)
            except ProcessLookupError:pass

def test_verifier_timeout_survives_cli_death(goal):
    root=goal['root'];pidfile=root/'verifier.pid';heartbeat=root/'verifier.heartbeat'
    goal['verifier'].write_text(json.dumps({'version':'R-parent-death','command':f'echo $$ > {pidfile}; trap "" TERM; while :; do echo beat >> {heartbeat}; sleep 0.05; done','seconds':2}))
    args=goal['args'][:];args[args.index('--for')+1]='10s'
    # No child-cleaning wrapper: it would mask the product's missing owner.
    with (root/'death.stdout').open('w') as out,(root/'death.stderr').open('w') as err:
        proc=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True)
        pid=None
        try:
            until=time.monotonic()+4
            while not pidfile.exists() and time.monotonic()<until:time.sleep(.02)
            assert pidfile.exists(),'verifier did not start'
            pid=int(pidfile.read_text());before=heartbeat.stat().st_size
            inventory=subprocess.check_output(['ps','-axo','pid=,ppid=,pgid=,rss=,lstart=,command='],text=True)
            rows=[line for line in inventory.splitlines() if len(line.split(None,2))>=3]
            owned={proc.pid}
            while True:
                more={int(line.split(None,2)[0]) for line in rows if int(line.split(None,2)[1]) in owned}
                if more<=owned:break
                owned|=more
            (root/'process-inventory.txt').write_text('\n'.join(line for line in rows if int(line.split(None,2)[0]) in owned))
            assert len(owned)<=12
            os.kill(proc.pid,signal.SIGKILL);proc.wait(timeout=3);time.sleep(3)
            after=heartbeat.stat().st_size
            current=subprocess.run(['ps','-p',str(pid),'-o','stat='],capture_output=True,text=True).stdout.strip()
            assert not current or current.startswith('Z'),current
            assert after-before<40,(before,after)
            assert not (root/'state'/'result.json').exists()
        finally:
            if pid:
                try:os.killpg(pid,signal.SIGKILL)
                except ProcessLookupError:pass
            if proc.poll() is None:proc.kill();proc.wait()

def test_frozen_verifier_owner_parent_fallback_and_sentinel(goal):
    root=goal['root'];pidfile=root/'owner-verifier.pid';heartbeat=root/'owner-verifier.heartbeat'
    goal['verifier'].write_text(json.dumps({'version':'owner-stop','command':f'echo $$ > {pidfile}; trap "" TERM; while :; do echo beat >> {heartbeat}; sleep 0.05; done','seconds':2}))
    args=goal['args'][:];args[args.index('--for')+1]='10s'
    sentinel=subprocess.Popen(['sleep','20']);pid=None;owner=None
    with (root/'owner.stdout').open('w') as out,(root/'owner.stderr').open('w') as err:
        proc=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=out,stderr=err,start_new_session=True)
        try:
            until=time.monotonic()+4
            while not pidfile.exists() and time.monotonic()<until:time.sleep(.02)
            assert pidfile.exists()
            pid=int(pidfile.read_text());owner=int(subprocess.check_output(['ps','-p',str(pid),'-o','ppid='],text=True))
            rows=subprocess.check_output(['ps','-axo','pid=,ppid=,pgid=,rss=,lstart=,command='],text=True).splitlines()
            owned={proc.pid,sentinel.pid}
            while True:
                more={int(line.split(None,2)[0]) for line in rows if int(line.split(None,2)[1]) in owned}
                if more<=owned:break
                owned|=more
            (root/'owner-process-inventory.txt').write_text('\n'.join(line for line in rows if int(line.split(None,2)[0]) in owned))
            assert len(owned)+2<=12  # pytest and its outer watchdog
            os.kill(owner,signal.SIGSTOP);time.sleep(5)
            current=subprocess.run(['ps','-p',str(pid),'-o','stat='],capture_output=True,text=True).stdout.strip()
            assert not current,current
            before=heartbeat.read_bytes();time.sleep(.1);assert heartbeat.read_bytes()==before
            proc.wait(timeout=2);assert proc.returncode==1
            assert json.loads((root/'state/result.json').read_text())['reason']=='needs_review'
            events=[json.loads(line) for line in (root/'owner.stdout').read_text().splitlines()]
            assert any(e.get('type')=='verifier.owned' and e['pid']==pid for e in events)
            assert any(e.get('type')=='verifier.stop' and e['confirmed'] for e in events)
            assert sentinel.poll() is None
        finally:
            if owner:
                try:os.kill(owner,signal.SIGCONT)
                except ProcessLookupError:pass
            if pid:
                try:os.killpg(pid,signal.SIGKILL)
                except ProcessLookupError:pass
            if proc.poll() is None:proc.kill();proc.wait()
            sentinel.terminate();sentinel.wait()
