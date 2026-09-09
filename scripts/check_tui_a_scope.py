#!/usr/bin/env python3
"""#47 scope and prior obligation audit. Existing validators are unchanged."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='7ade169b276fd68198ca4461d07c5589c273253f'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
m=json.loads((root/'docs/design/workorder-tui-a-obligations.json').read_text());assert m['base']==base and m['criteria_version']=='1.2'
old=git('ls-tree','-r','--name-only',base).decode().splitlines();changed=sorted(set(git('diff','--name-only',base).decode().splitlines()+git('ls-files','--others','--exclude-standard').decode().splitlines()));assert changed==sorted(m['changed_files']),(changed,m['changed_files'])
readmes={'README.md','typescript/README.md','typescript/src/tui/README.md','typescript/test/README.md','scripts/README.md','scripts/fixtures/README.md','docs/design/README.md'}
new={'typescript/src/tui/daily-editor.ts','typescript/src/tui/daily-workspace.ts','typescript/test/daily-workspace.test.ts','scripts/demo_tui_a.mjs','scripts/verify_tui_a_pty.py','scripts/check_tui_a_scope.py','docs/design/native-daily-workspace.md','docs/design/workorder-tui-a-obligations.json'}
for f in changed:assert f in readmes or f=='docs/agents/current-assignment.md' or f.startswith('typescript/src/tui/') or f in new or f.startswith('scripts/fixtures/tui-a/'),f
protected={}
for f in old:
 before=git('show',base+':'+f);current=(root/f).read_bytes()
 if f not in changed:assert current==before,f;protected[f]=hashlib.sha256(current).hexdigest()
 if f.startswith('typescript/test/') and f not in readmes:assert current==before,'prior test changed '+f
prior=[]
for f in old:
 if f.startswith('typescript/test/') and f.endswith('.test.ts'):
  for title in re.findall(r'^test\("([^"\n]+)"',git('show',base+':'+f).decode(),re.M):prior.append({'file':f,'title':title,'execution':'exact #41 snapshot with unchanged controls' if f.endswith('module-layout.test.ts') else 'current Product; unchanged assertions'})
assert len(prior)==100 and prior==m['prior_obligations']
links=[]
for f in changed:
 if f.endswith('.md'):
  for target in re.findall(r'\]\(([^)]+)\)',(root/f).read_text()):
   if target.startswith(('http:','https:','#')):continue
   assert (root/f).parent.joinpath(target.split('#')[0]).exists(),(f,target);links.append([f,target])
utility={f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in old if f.startswith('devtools/')}
for f in utility:assert (root/f).read_bytes()==git('show',base+':'+f),f
product_graph={}
for p in [*(root/'typescript/src').rglob('*.ts'),*(root/'typescript/scripts').rglob('*.mjs'),root/'typescript/package.json',root/'typescript/package-lock.json']:
 assert 'devtools' not in p.read_text(),str(p)
 product_graph[str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
print(json.dumps({'utility_unchanged':utility,'product_no_devtools_references':product_graph,'retained_utility_result':'FAIL 35/36; #48; excluded prospectively only by 1.1','base':base,'candidate_sha':git('rev-parse','HEAD').decode().strip(),'changed':changed,'protected':protected,'priorObligations':len(prior),'links':links},indent=2))
