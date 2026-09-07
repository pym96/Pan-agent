#!/usr/bin/env python3
"""Frozen #34 scope, source preservation and baseline test accounting; no live execution."""
import hashlib, json, re, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = '55afc93deff70035810666f0efbf583357ad12fc'
def git(*args): return subprocess.check_output(['git','-C',str(ROOT),*args])
def digest(body): return hashlib.sha256(body).hexdigest()
def before(path): return git('show',f'{BASE}:{path}')
allowed = re.compile(r'^(typescript/|references/pi/|scripts/(README.md|check_typescript_without_python.sh|check_workorder_34_scope.py|check_product_isolation.py|wo34-runtime-guard.mjs)$|README.md$|CONTEXT.md$|docs/agents/current-assignment.md$|docs/(design|adr)/)')
changed = set(git('diff','--name-only',BASE).decode().splitlines()) | set(git('ls-files','--others','--exclude-standard').decode().splitlines())
assert changed, 'empty candidate'
for path in changed: assert allowed.match(path), f'out of scope: {path}'
moved = ['model-adapter.ts','tools.ts','pi-compatibility.ts','kernels/pi-kernel.ts']
protected = ['conformance/fixtures/', 'workspace_agent_harness/', 'tests/', 'wiki/', 'docs/evidence/', 'typescript/RUNBOOK.md', 'typescript/test/fixtures/']
protected += ['typescript/src/'+p for p in ['canonical-protocol.ts','agent-tool.ts','model-adapter-contract.ts','faux-model-adapter.ts','deepseek-profile.ts','deepseek-transport.ts','pan-deepseek-model-adapter.ts','pan-trusted-local-tools.ts','tui.ts','run-archive.ts','retrospective-ledger.ts','runbook.ts','kernels/agent-kernel.ts','kernels/native-kernel.ts']]
identities = {}
for name in git('ls-tree','-r','--name-only',BASE).decode().splitlines():
 if any(name == p or (p.endswith('/') and name.startswith(p)) for p in protected):
  body = (ROOT/name).read_bytes(); assert body == before(name), f'protected bytes: {name}'
  identities[name] = digest(body)
relocations = {}
for name in moved:
 old = 'typescript/src/'+name; new='references/pi/src/'+name
 normalize = lambda s: re.sub(rb'from "\.[^"]+"', b'from "RELATIVE_IMPORT"', s)
 assert normalize(before(old)) == normalize((ROOT/new).read_bytes()), f'non-import reference change: {name}'
 assert not (ROOT/old).exists(), f'old product integration remains: {name}'
 relocations[old] = {'destination':new,'before_sha256':digest(before(old)),'after_sha256':digest((ROOT/new).read_bytes()),'comparison':'byte-identical after relative import normalization'}
# Session executable lifecycle below construction is preserved exactly.
session_before=before('typescript/src/session.ts').split(b'\n\tget isRunning():',1)[1]
assert (ROOT/'typescript/src/session.ts').read_bytes().split(b'\n\tget isRunning():',1)[1] == session_before
# Reference CLI changes are import locations and Runbook location only.
normal_cli=lambda b: re.sub(rb'from "\.[^"]+"',b'from "RELATIVE_IMPORT"',b).replace(b'"..", "..", "..", "typescript", "RUNBOOK.md"',b'"..", "RUNBOOK.md"')
assert normal_cli(before('typescript/src/cli.ts')) == normal_cli((ROOT/'references/pi/src/cli.ts').read_bytes())
manifest = json.loads((ROOT/'docs/design/workorder-34-coverage.json').read_text())
case_re = re.compile(r'^test\("([^"]+)"',re.M)
baseline = {(p,title) for p in git('ls-tree','-r','--name-only',BASE,'typescript/test').decode().splitlines() if p.endswith('.test.ts') for title in case_re.findall(before(p).decode())}
assert len(baseline)==78, f'baseline inventory drift: {len(baseline)}'
assert {(row['baseline_file'],row['baseline_title']) for row in manifest['cases']} == baseline
for row in manifest['cases']:
 assert row['destinations'], row
 for dest in row['destinations']:
  assert dest['title'] in case_re.findall((ROOT/dest['file']).read_text()), dest
assert len(manifest['cases'])==78
# Mandatory tools cannot be absent, and no ignored scan result is accepted.
subprocess.run(['rg','--version'],check=True,stdout=subprocess.DEVNULL)
scan=subprocess.run(['rg','-n',r'@earendil-works/pi-|from [\"\'].*references|import\([\"\'].*references|adaptPi|createPi','typescript/src'],cwd=ROOT,capture_output=True,text=True)
assert scan.returncode==1, scan.stdout+scan.stderr
print(json.dumps({'base':BASE,'changed_files':sorted(changed),'protected_sha256':identities,'relocations':relocations,'baseline_cases':len(baseline),'coverage_map_sha256':digest((ROOT/'docs/design/workorder-34-coverage.json').read_bytes())},indent=2))
print('PASS #34 protected bytes, source relocation, Session lifecycle and baseline coverage inventory')
