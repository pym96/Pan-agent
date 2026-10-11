#!/usr/bin/env python3
import pathlib,subprocess,re,json
root=pathlib.Path(__file__).resolve().parents[3];base='effbf27db194d95a83238b665a00e7ef0da33d0f'
def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True)
paths=sorted(set(git('diff','--name-only',base).splitlines()+git('ls-files','--others','--exclude-standard').splitlines()));allowed=['apps/evidence-web/','docs/design/pan-web/','docs/evidence/web114/'];assert all(p in ['README.md','docs/evidence/README.md'] or any(p.startswith(a) for a in allowed) for p in paths),paths
assert not git('diff',base,'--','apps/evidence-web/internal/database/migrations','typescript')
broken=[];links=0
for name in paths:
 p=root/name
 if p.suffix!='.md' or not p.exists():continue
 for dest in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  dest=dest.split('#')[0]
  if not dest or '://' in dest or dest.startswith('/'):continue
  links+=1
  if not (p.parent/dest).exists():broken.append([name,dest])
assert not broken,broken
print(json.dumps({'passed':True,'paths':paths,'links':links,'broken':broken,'migrationAndTypeScriptDiff':'none'},indent=2))
