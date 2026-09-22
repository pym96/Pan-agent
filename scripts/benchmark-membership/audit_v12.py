"""Verify retained source integrity without displaying its contents or executing it."""
import argparse,hashlib,json
from pathlib import Path
from overlay import ROOT,load_frozen

def audit(inputs):
    pool,decisions=load_frozen("1.2")
    tree=json.loads((inputs/'da-full-tree.json').read_text())
    lock=json.loads((ROOT.parent/'benchmark-subset/input-lock.json').read_text())
    locked={r['path']:r['sha256'] for r in lock['files']}
    for name in ('da-full-tree.json','sources/da-code/da_code/configs/task/all.jsonl'):
        if hashlib.sha256((inputs/name).read_bytes()).hexdigest()!=locked[name]:raise ValueError('base source mismatch')
    if tree['truncated'] or tree['sha']!='b211daf51fdc9b52d5087c9df28ac50191bcabed':raise ValueError('tree revision mismatch')
    entries={r['path']:r for r in tree['tree']}
    provenance=json.loads((ROOT/'source-provenance-v12.json').read_text())
    for r in provenance:
        raw=(inputs/'upstream'/r['path']).read_bytes();e=entries[r['path']]
        blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        if e['mode']!='100644' or e['type']!='blob' or e['size']!=len(raw) or blob!=e['sha'] or blob!=r['git_blob'] or hashlib.sha256(raw).hexdigest()!=r['sha256']:raise ValueError('source identity mismatch')
    return {'criteria':'1.2','source_files_verified':len(provenance),'decisions':{s:sum(d['decision']==s for d in decisions) for s in ('eligible','excluded','unresolved')},'selection_performed':False,'execution_authorized':False,'semantic_decisions_independently_accepted':False}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--inputs',type=Path,required=True);a=p.parse_args();print(json.dumps(audit(a.inputs),indent=2))
