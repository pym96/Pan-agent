#!/usr/bin/env python3
"""#52 scope and prior obligation audit. Existing validators are unchanged."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='10f0b3089ac6e88b254a89e7f970696cc1c332ab'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
m=json.loads((root/'docs/design/workorder-preview-config-obligations.json').read_text());assert m['base']==base and m['criteria_version']=='1.0' and m['workorder']==52
old=git('ls-tree','-r','--name-only',base).decode().splitlines();changed=sorted(set(git('diff','--name-only',base).decode().splitlines()+git('ls-files','--others','--exclude-standard').decode().splitlines()));assert changed==sorted(m['changed_files']),(changed,m['changed_files'])
readmes={'README.md','typescript/README.md','typescript/test/README.md','scripts/README.md','scripts/fixtures/README.md','scripts/fixtures/preview/README.md','docs/design/README.md'}
new={'typescript/src/cli.ts','typescript/src/index.ts','typescript/test/config-first-run.test.ts','scripts/demo_config.mjs','scripts/verify_config_consumer.py','scripts/check_workorder_52_scope.py','docs/design/preview-config.md','docs/design/workorder-preview-config-obligations.json'}
for f in changed:assert f in readmes or f in new or f.startswith('typescript/src/config/') or f in {'scripts/fixtures/preview/config-boundary-driver.mjs','scripts/fixtures/preview/config-configure-driver.mjs','scripts/fixtures/preview/config-interactive-configure.mjs','scripts/fixtures/preview/config-keychain-driver.mjs','scripts/fixtures/preview/config-task-driver.mjs','scripts/fixtures/preview/interactive-driver.mjs'},f
protected={}
for f in old:
 before=git('show',base+':'+f);current=(root/f).read_bytes()
 if f not in changed:assert current==before,f;protected[f]=hashlib.sha256(current).hexdigest()
 if f.startswith('typescript/test/') and f not in readmes and not f.endswith('config-first-run.test.ts'):assert current==before,'prior test changed '+f
prior=[]
for f in old:
 if f.startswith('typescript/test/') and f.endswith('.test.ts'):
  for match in re.finditer(r'''^test\((['"])([^'"\n]+)\1''',git('show',base+':'+f).decode(),re.M):prior.append({'file':f,'title':match.group(2),'execution':'exact #41 snapshot with unchanged controls' if f.endswith('module-layout.test.ts') else 'current Product; unchanged assertions'})
assert len(prior)==117 and prior==m['prior_obligations']
current_titles=re.findall(r'''^test\("([^"\n]+)"''',(root/'typescript/test/config-first-run.test.ts').read_text(),re.M)
assert [{'file':'typescript/test/config-first-run.test.ts','title':t} for t in current_titles]==m['added_tests'],(current_titles,m['added_tests'])
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
# No real endpoint, no persisted secret pattern, no Kimi adapter in Product source.
for p in (root/'typescript/src').rglob('*.ts'):
 body=p.read_text()
 assert 'api.kimi' not in body and 'moonshot.cn' not in body,str(p)
print(json.dumps({'utility_unchanged':utility,'product_no_devtools_references':product_graph,'base':base,'candidate_sha':git('rev-parse','HEAD').decode().strip(),'changed':changed,'protected':protected,'priorObligations':len(prior),'addedTests':len(m['added_tests']),'links':links},indent=2))
