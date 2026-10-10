#!/usr/bin/env python3
"""Candidate write scope and locally linked documentation; read-only."""
import subprocess,pathlib,re,json
root=pathlib.Path(__file__).resolve().parents[3]
base='5bdfc4d5a87a6b9431cb94d34f2c0db4de180949'
changed=set(subprocess.check_output(['git','diff','--name-only',base],cwd=root,text=True).splitlines())
changed.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines())
for f in changed:
 assert f.startswith(('apps/evidence-web/','docs/design/pan-web/','docs/evidence/web119/')) or f in ['README.md','docs/evidence/README.md'],f
 if f in ['README.md','docs/evidence/README.md']:
  prior=subprocess.check_output(['git','show',base+':'+f],cwd=root)
  assert (root/f).read_bytes().startswith(prior),f+' must be append-only navigation'
errors=[];checked=0
for f in changed:
 p=root/f
 if p.suffix!='.md' or not p.exists():continue
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' in target or target.startswith('#'):continue
  target=target.split('#')[0].strip('<>')
  if not target:continue
  checked+=1
  if not (p.parent/target).exists():errors.append({'source':f,'target':target})
print(json.dumps({'passed':not errors,'changed':sorted(changed),'linksChecked':checked,'broken':errors},indent=2))
assert not errors
