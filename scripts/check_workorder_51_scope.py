#!/usr/bin/env python3
"""#51 scope and prior obligation audit. Existing validators are unchanged."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='4cd830951663a65c24f2ab94d18083bd00a1b249'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
m=json.loads((root/'docs/design/workorder-preview-entry-obligations.json').read_text());assert m['base']==base and m['criteria_version']=='1.0' and m['workorder']==51
old=git('ls-tree','-r','--name-only',base).decode().splitlines();changed=sorted(set(git('diff','--name-only',base).decode().splitlines()+git('ls-files','--others','--exclude-standard').decode().splitlines()));assert changed==sorted(m['changed_files']),(changed,m['changed_files'])
readmes={'README.md','typescript/README.md','typescript/test/README.md','scripts/README.md','scripts/fixtures/README.md','scripts/fixtures/preview/README.md','docs/design/README.md'}
new={'typescript/test/preview-entry.test.ts','scripts/fixtures/preview-first-task-v1.json','scripts/demo_preview.mjs','scripts/try_preview.sh','scripts/verify_preview_consumer.py','scripts/check_workorder_51_scope.py','docs/design/preview-first-task.md','docs/design/workorder-preview-entry-obligations.json'}
for f in changed:assert f in readmes or f in new or f.startswith('scripts/fixtures/preview/'),f
protected={}
for f in old:
 before=git('show',base+':'+f);current=(root/f).read_bytes()
 if f not in changed:assert current==before,f;protected[f]=hashlib.sha256(current).hexdigest()
 if f.startswith('typescript/test/') and f not in readmes:assert current==before,'prior test changed '+f
prior=[]
for f in old:
 if f.startswith('typescript/test/') and f.endswith('.test.ts'):
  for match in re.finditer(r'''^test\((['"])([^'"\n]+)\1''',git('show',base+':'+f).decode(),re.M):prior.append({'file':f,'title':match.group(2),'execution':'exact #41 snapshot with unchanged controls' if f.endswith('module-layout.test.ts') else 'current Product; unchanged assertions'})
assert len(prior)==115 and prior==m['prior_obligations']
added=json.loads((root/'docs/design/workorder-preview-entry-obligations.json').read_text())['added_tests']
current_titles=re.findall(r'''^test\((['"])([^'"\n]+)\1''',(root/'typescript/test/preview-entry.test.ts').read_text(),re.M)
assert [{'file':'typescript/test/preview-entry.test.ts','title':title} for _,title in current_titles]==added,(current_titles,added)
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
fixture=json.loads((root/'scripts/fixtures/preview-first-task-v1.json').read_text());assert fixture['id']=='preview-first-task/v1'
assert (root/'scripts/fixtures/packed-create-run-verify-v1.json').read_bytes()==git('show',base+':scripts/fixtures/packed-create-run-verify-v1.json'),'#35 fixture must stay byte-identical'
print(json.dumps({'utility_unchanged':utility,'product_no_devtools_references':product_graph,'base':base,'candidate_sha':git('rev-parse','HEAD').decode().strip(),'changed':changed,'protected':protected,'priorObligations':len(prior),'addedTests':len(added),'links':links},indent=2))
