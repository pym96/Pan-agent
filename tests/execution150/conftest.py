import json, os, pathlib, subprocess, sys, selectors, time, tarfile, hashlib
import pytest

HERE = pathlib.Path(__file__).parent

@pytest.fixture(scope='session')
def installed(tmp_path_factory):
    package = os.environ.get('PAN_PACKAGE')
    assert package and pathlib.Path(package).is_file(), 'PAN_PACKAGE must name the candidate npm pack tarball; no source-CLI substitute'
    prepared = os.environ.get('PAN_PREINSTALLED_ROOT')
    if prepared:
        root = pathlib.Path(prepared).resolve()
        installed_package = root / 'node_modules' / 'pan-agent'
        # Reuse is allowed only for exact tarball bytes, not a version/name claim.
        with tarfile.open(package, 'r:gz') as archive:
            for member in archive.getmembers():
                if member.isdir(): continue
                assert member.isfile() and member.name.startswith('package/')
                relative = pathlib.PurePosixPath(member.name).relative_to('package')
                assert '..' not in relative.parts
                target = installed_package / relative
                assert target.is_file() and not target.is_symlink()
                assert hashlib.sha256(target.read_bytes()).digest() == hashlib.sha256(archive.extractfile(member).read()).digest()
        cli = root / 'node_modules' / '.bin' / 'pan-agent'
        assert cli.resolve() == (installed_package / 'bin' / 'pan-agent.mjs').resolve()
        return cli
    root = tmp_path_factory.mktemp('consumer')
    result = subprocess.run(['npm', 'install', '--offline', '--ignore-scripts', '--omit=dev', '--prefix', str(root), package], capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr
    return root / 'node_modules' / '.bin' / 'pan-agent'

def response(content=None):
    blocks = content or [{'type':'text','text':'I completed the goal'}]
    return {'kind':'response','message':{'role':'assistant','content':blocks,'timestamp':0},'stopReason':'tool_calls' if any(b['type']=='tool_call' for b in blocks) else 'stop','usage':{'status':'unavailable'},'identity':{'provider':{'status':'reported','value':'pan-faux'},'model':{'status':'reported','value':'pan-faux-v1'},'responseId':{'status':'unavailable'}}}

def tool(name, args, id):
    return response([{'type':'tool_call','id':id,'name':name,'arguments':args}])

@pytest.fixture
def case(tmp_path, installed):
    workspace=tmp_path/'workspace'; workspace.mkdir()
    fixture=tmp_path/'fixture.json'; fixture.write_text(json.dumps([response()]*20))
    base=[str(installed),'loop','--every','1s','--for','4s','--task','produce the requested result','--workspace',str(workspace),'--memory-root',str(tmp_path/'memory'),'--state',str(tmp_path/'state'),'--fixture',str(fixture)]
    processes=[]
    def run(args=None, approve=True, on_event=None):
        command=[sys.executable,str(HERE/'watchdog.py'),*(args or base)]
        proc=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        processes.append(proc); events=[]; lines=[]
        for line in proc.stdout:
            lines.append(line)
            try: event=json.loads(line)
            except ValueError: continue
            events.append(event)
            if event.get('type')=='approval.request':
                proc.stdin.write(json.dumps({'requestId':event['request']['requestId'],'decision':'allow-once' if approve else 'deny'})+'\n');proc.stdin.flush()
            if on_event: on_event(event,proc)
        proc.wait(timeout=120); stderr=proc.stderr.read()
        (tmp_path/'stdout.jsonl').write_text(''.join(lines));(tmp_path/'stderr.txt').write_text(stderr)
        return proc.returncode,events,stderr
    yield {'root':tmp_path,'workspace':workspace,'fixture':fixture,'base':base,'run':run,'installed':installed}
    for proc in processes:
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=6)
            except subprocess.TimeoutExpired: proc.kill();proc.wait()

@pytest.fixture
def goal(case):
    spec=case['root']/'verifier.json';spec.write_text(json.dumps({'version':'fixture-v1','command':'test "$(cat result.txt)" = correct','seconds':2}))
    args=case['base'][:];args[1]='goal';args[args.index('--every')+1]='5s';args[args.index('--for')+1]='8s';args+=['--verifier',str(spec)]
    case['args']=args;case['verifier']=spec
    return case
