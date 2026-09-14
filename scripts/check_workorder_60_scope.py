#!/usr/bin/env python3
"""#60 scope and prior obligation audit. Existing validators are unchanged."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='6dc0efe7b605cf54d626091c2c790bb1b88c219d'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
m=json.loads((root/'docs/design/workorder-scrollbar-obligations.json').read_text());assert m['base']==base and m['criteria_version']=='1.0' and m['workorder']==60
old=git('ls-tree','-r','--name-only',base).decode().splitlines();changed=sorted(set(git('diff','--name-only',base).decode().splitlines()+git('ls-files','--others','--exclude-standard').decode().splitlines()));assert changed==sorted(m['changed_files']),(changed,m['changed_files'])
readmes={'typescript/README.md','typescript/test/README.md','scripts/README.md','scripts/fixtures/README.md','scripts/fixtures/scrollbar/README.md','docs/design/README.md'}
new={'typescript/src/tui/daily-workspace.ts','typescript/src/tui/framed-input.ts','typescript/src/tui/daily-editor.ts','typescript/src/tui/scrollbar.ts','typescript/test/scrollbar.test.ts','scripts/demo_scrollbar.mjs','scripts/verify_scrollbar_pty.py','scripts/check_workorder_60_scope.py','docs/design/transcript-scrollbar.md','docs/design/workorder-scrollbar-obligations.json'}
for f in changed:assert f in readmes or f in new or f=='scripts/fixtures/scrollbar/scrollbar-pty-driver.mjs',f
protected={}
for f in old:
 before=git('show',base+':'+f);current=(root/f).read_bytes()
 if f not in changed:assert current==before,f;protected[f]=hashlib.sha256(current).hexdigest()
 if f.startswith('typescript/test/') and f not in readmes and not f.endswith('scrollbar.test.ts'):assert current==before,'prior test changed '+f
prior=[]
for f in old:
 if f.startswith('typescript/test/') and f.endswith('.test.ts'):
  for match in re.finditer(r'''^test\((['"])([^'"\n]+)\1''',git('show',base+':'+f).decode(),re.M):prior.append({'file':f,'title':match.group(2),'execution':'exact #41 snapshot with unchanged controls' if f.endswith('module-layout.test.ts') else 'current Product; unchanged assertions'})
assert len(prior)==141 and prior==m['prior_obligations']
current=re.findall(r'''^test\('([^'\n]+)''',(root/'typescript/test/scrollbar.test.ts').read_text(),re.M)
assert [{'file':'typescript/test/scrollbar.test.ts','title':t} for t in current]==m['added_tests'],(current,m['added_tests'])
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
# The scrollbar change must stay TUI-local: no runtime/kernel/tool/archive edits are in the changed set.
for f in changed:assert not f.startswith(('typescript/src/runtime/','typescript/src/tools/','typescript/src/memory/','typescript/src/providers/','conformance/','references/','tests/','workspace_agent_harness/')),f
print(json.dumps({'utility_unchanged':utility,'product_no_devtools_references':product_graph,'base':base,'candidate_sha':git('rev-parse','HEAD').decode().strip(),'changed':changed,'protected':protected,'priorObligations':len(prior),'addedTests':len(m['added_tests']),'links':links},indent=2))
