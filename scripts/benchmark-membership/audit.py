"""Offline ScopeChallenge reconstruction; never executes upstream code or selects tasks."""
import argparse
import hashlib
import json
from pathlib import Path
from projection import TARGETS, task_projection, readme_concepts, readme_projection


def reconstruct(inputs):
    here=Path(__file__).resolve().parent
    lock=json.loads((here.parent/'benchmark-subset/input-lock.json').read_text())
    locked={x['path']:x['sha256'] for x in lock['files']}
    for name in ('da-full-tree.json','sources/da-code/da_code/configs/task/all.jsonl'):
        if hashlib.sha256((inputs/name).read_bytes()).hexdigest()!=locked[name]:
            raise ValueError('base input integrity mismatch')
    tree=json.loads((inputs/'da-full-tree.json').read_text())
    if tree['truncated'] or tree['sha']!='b211daf51fdc9b52d5087c9df28ac50191bcabed':
        raise ValueError('pinned tree mismatch')
    entries={x['path']:x for x in tree['tree']}
    provenance=json.loads((here/'source-provenance.json').read_text())
    for row in provenance:
        raw=(inputs/'upstream'/row['path']).read_bytes()
        blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        if blob!=row['git_blob'] or blob!=entries[row['path']]['sha'] or hashlib.sha256(raw).hexdigest()!=row['sha256']:
            raise ValueError('upstream integrity mismatch')
    tasks=task_projection((inputs/'sources/da-code/da_code/configs/task/all.jsonl').read_bytes())
    observations=[]
    for task in tasks['tasks']:
        prefix='da_code/source/'+task['id']+'/'
        raw=(inputs/'upstream'/prefix/'README.md').read_bytes()
        projection=readme_projection(raw)
        # Actual source prose is withheld; do not publish unreviewed future excerpts.
        if projection['emitted']:raise ValueError('source projection requires additional review')
        observations.append({**task,'readme':readme_concepts(raw),'readme_text_withheld':True,
            'inventory':[{'path':e['path'],'git_blob':e['sha'],'bytes':e.get('size')} for e in tree['tree'] if e['type']=='blob' and e['path'].startswith(prefix)],
            'membership_decision':'unresolved','reason':'No final decision: dependent selection stopped at ScopeChallenge.'})
    return {'status':'scope_challenge_pending','execution_authorized':False,'source_revision':tree['sha'],
        'task_source_sha256':tasks['source_sha256'],'observations':observations,
        'selection_performed':False,'pool_overlay_performed':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inputs',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();result=reconstruct(args.inputs)
    args.output.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print('Verified pinned sources; reconstructed 16 unresolved observations. No selection.')
