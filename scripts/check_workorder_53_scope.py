#!/usr/bin/env python3
"""#53 scope and prior obligation audit. Existing validators are unchanged."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='9934dc9740d3a1f4750bf3a933488d30bd08ac02'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
m=json.loads((root/'docs/design/workorder-preview-kimi-obligations.json').read_text());assert m['base']==base and m['criteria_version']=='1.0' and m['workorder']==53
old=git('ls-tree','-r','--name-only',base).decode().splitlines();changed=sorted(set(git('diff','--name-only',base).decode().splitlines()+git('ls-files','--others','--exclude-standard').decode().splitlines()));assert changed==sorted(m['changed_files']),(changed,m['changed_files'])
readmes={'README.md','typescript/README.md','typescript/test/README.md','scripts/README.md','scripts/fixtures/README.md','scripts/fixtures/kimi/README.md','docs/design/README.md'}
new={'typescript/test/kimi-adapter.test.ts','scripts/check_workorder_53_scope.py','scripts/demo_kimi.mjs','scripts/verify_kimi_consumer.py','docs/design/preview-kimi.md','docs/design/workorder-preview-kimi-obligations.json'}
for f in changed:assert f in readmes or f in new or f.startswith('typescript/src/providers/kimi/') or f.startswith('scripts/fixtures/kimi/') or f in {'typescript/src/cli.ts','typescript/src/index.ts','typescript/src/config/first-run.ts','typescript/src/config/settings.ts','typescript/src/config/keychain.ts','typescript/test/config-first-run.test.ts','scripts/demo_config.mjs','scripts/verify_config_consumer.py'},f
protected={}
for f in old:
 before=git('show',base+':'+f);current=(root/f).read_bytes()
 if f not in changed:assert current==before,f;protected[f]=hashlib.sha256(current).hexdigest()
 if f.startswith('typescript/test/') and f not in readmes and f not in {'typescript/test/config-first-run.test.ts','typescript/test/kimi-adapter.test.ts'}:assert current==before,'prior test changed '+f
prior=[]
for f in old:
 if f.startswith('typescript/test/') and f.endswith('.test.ts'):
  for match in re.finditer(r'''^test\((['"])([^'"\n]+)\1''',git('show',base+':'+f).decode(),re.M):prior.append({'file':f,'title':match.group(2),'execution':'exact #41 snapshot with unchanged controls' if f.endswith('module-layout.test.ts') else 'current Product; unchanged assertions'})
assert len(prior)==130 and prior==m['prior_obligations']
# The one retitled #52 test is the authorized kimi-availability behavior change; every other prior title survives verbatim.
config_now=(root/'typescript/test/config-first-run.test.ts').read_text()
for mod in m['modified_tests']:
 assert mod['from'] not in config_now and mod['to'] in config_now,mod
retitled={mod['from'] for mod in m['modified_tests']}
survivors=[o for o in prior if o['file']=='typescript/test/config-first-run.test.ts' and o['title'] not in retitled]
for o in survivors:assert o['title'] in config_now,o['title']
current_kimi=re.findall(r'''^test\("([^"\n]+)"''',(root/'typescript/test/kimi-adapter.test.ts').read_text(),re.M)
assert [{'file':'typescript/test/kimi-adapter.test.ts','title':t} for t in current_kimi]==m['added_tests']
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
# Kimi wire contract stays on the frozen official OpenAI-compatible endpoint; no DeepSeek delegation.
adapter=(root/'typescript/src/providers/kimi/pan-kimi-model-adapter.ts').read_text()
assert 'pan-deepseek' not in adapter and 'PanDeepSeekModelAdapter' not in adapter and 'deepseek_' not in adapter
assert 'encoded.reasoning_content' not in adapter,'requests must never carry the reasoning_content continuation field'
assert 'reasoning_effort' not in adapter
transport=(root/'typescript/src/providers/kimi/kimi-transport.ts').read_text()
assert 'api.deepseek.com' not in transport and 'anthropic' not in transport.lower()
print(json.dumps({'utility_unchanged':utility,'product_no_devtools_references':product_graph,'base':base,'candidate_sha':git('rev-parse','HEAD').decode().strip(),'changed':changed,'protected':protected,'priorObligations':len(prior),'addedTests':len(m['added_tests']),'modifiedTests':len(m['modified_tests']),'links':links},indent=2))
