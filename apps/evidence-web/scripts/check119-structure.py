#!/usr/bin/env python3
"""Source/compiled import oracle, public interfaces, exact migration identities."""
import pathlib,json,subprocess,hashlib,re,sys
root=pathlib.Path(__file__).resolve().parents[1]
base='5bdfc4d5a87a6b9431cb94d34f2c0db4de180949'
raw=subprocess.check_output(['go','list','-json','./...'],cwd=root,text=True)
dec=json.JSONDecoder();packages=[]
while raw.strip():
 p,n=dec.raw_decode(raw.lstrip());packages.append(p);raw=raw.lstrip()[n:]
graph={p['ImportPath']:p.get('Imports',[]) for p in packages}
prefix='pan-agent/evidence-web/internal/'
for pkg in ['evidence','httpapi','taskview','tasks','executor','worker','config']:
 imports=graph[prefix+pkg]
 if pkg=='evidence':assert all('.' not in s.split('/')[0] and not s.startswith(('net/','database/','os/exec')) for s in imports),imports
 if pkg=='httpapi':assert 'os/exec' not in imports and 'github.com/jackc/pgx/v5/pgxpool' not in imports
 if pkg=='taskview':assert all(not s.endswith(('/tasks','/executor','/worker','/pgxpool')) for s in imports)
 if pkg in ['tasks','executor','worker']:assert 'net/http' not in imports
 if pkg=='executor':assert not any('pgx' in s for s in imports)
for p in (root/'internal').rglob('*.go'):
 if p.name.endswith('_test.go'):continue
 text=p.read_text()
 assert 'getAuthority(' not in text and 'authorityKey' not in text
 if p.parent.name not in ['startup','testfixture']:assert 'os.Getenv' not in text,p
 if p.parent.name=='httpapi':assert not re.search(r'\b(INSERT INTO|UPDATE ew_|DELETE FROM|SELECT .*FROM ew_)',text),p
 if p.parent.name=='taskview':assert '.Exec(' not in text and '.Begin(' not in text,p
migration={}
for p in sorted((root/'internal/database/migrations').glob('*.sql')):
 prior=subprocess.check_output(['git','show',base+':apps/evidence-web/migrations/'+p.name],cwd=root)
 assert p.read_bytes()==prior,p
 migration[p.name]=hashlib.sha256(prior).hexdigest()
interfaces={}
for pkg in ['tasks','taskview','executor','worker','evidence','config']:
 interfaces[pkg]=subprocess.check_output(['go','doc',prefix+pkg],cwd=root,text=True)
assert 'executorExec' not in interfaces['tasks']
read_receiver=re.search(r'type viewHandler struct \{(.*?)\n\}',(root/'internal/httpapi/http.go').read_text(),re.S).group(1)
assert not any(x in read_receiver for x in ['tasks.Store','pgx','*app'])
result={'readReceiver':read_receiver,'passed':True,'baseline':base,'imports':graph,'interfaces':interfaces,'migrationSHA256':migration}
print(json.dumps(result,indent=2))
