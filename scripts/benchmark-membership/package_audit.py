"""One-pass Criteria1.3 controller diagnostic, deterministic and non-executing."""
import argparse,hashlib,json
from pathlib import Path
from package_schema import csv_gzip,json_structure,npy_structure,png_structure
from source_view import emit
ROOT=Path(__file__).resolve().parent
REVISION='b211daf51fdc9b52d5087c9df28ac50191bcabed'
PATHS=tuple('da_code/source/plot-scatter-002/'+n for n in ('closing_odds.csv.gz','odds_series.csv.gz','odds_series_b.csv.gz','odds_series_b_matches.csv.gz','odds_series_matches.csv.gz'))+tuple('da_code/gold/plot-scatter-002/'+n for n in ('plot.json','result.npy','result.png'))

def digest(path,size):
    sha=hashlib.sha256();blob=hashlib.sha1(b'blob '+str(size).encode()+b'\0');count=0
    with path.open('rb') as f:
        for b in iter(lambda:f.read(65536),b''):sha.update(b);blob.update(b);count+=len(b)
    return count,sha.hexdigest(),blob.hexdigest()

def audit(controller,tree_file):
    schema_lock=json.loads((ROOT/'package-schema-lock.json').read_text())
    if hashlib.sha256((ROOT/'package_schema.py').read_bytes()).hexdigest()!=schema_lock['parser_sha256']:raise ValueError('frozen parser changed')
    locked=json.loads((ROOT.parent/'benchmark-subset/input-lock.json').read_text())
    expected=next(r['sha256'] for r in locked['files'] if r['path']=='da-full-tree.json');tree_bytes=tree_file.read_bytes()
    if hashlib.sha256(tree_bytes).hexdigest()!=expected:raise ValueError('tree integrity mismatch')
    tree=json.loads(tree_bytes)
    if tree['truncated'] or tree['sha']!=REVISION:raise ValueError('tree pin refused')
    entries={r['path']:r for r in tree['tree']};verified=[]
    for name in PATHS:
        entry=entries[name];p=controller/'payload'/name
        if entry['mode']!='100644' or entry['type']!='blob' or p.is_symlink() or not p.resolve().is_relative_to((controller/'payload').resolve()):raise ValueError('payload role refused')
        size,sha,blob=digest(p,entry['size'])
        if size!=entry['size'] or blob!=entry['sha']:raise ValueError('whole object integrity mismatch')
        verified.append({'path':name,'bytes':size,'git_blob':blob,'sha256':sha})
    result=[]
    for identity in verified:
        name=identity['path'];p=controller/'payload'/name
        try:
            if name.endswith('.csv.gz'):structure=csv_gzip(p)
            elif name.endswith('plot.json'):structure=json_structure(p.read_bytes())
            else:
                with p.open('rb') as stream:structure=npy_structure(stream) if name.endswith('.npy') else png_structure(stream)
        except ValueError:structure={'status':'unsupported_or_malformed','values_withheld':True}
        result.append({'path':name,'structure':structure})
    return {'criteria':'1.3','source_revision':REVISION,'actor':'Working Agent evaluator-controller-local structural parser; no solver context','schema_lock':schema_lock,'provenance':verified,'structures':result,'task_runs':0,'scorer_runs':0,'model_calls':0,'membership_conclusion':'not_automatically_inferred','unknown_human_provision':'unclear','unknown_human_override':'unclear'}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--controller',type=Path,required=True);p.add_argument('--tree',type=Path,required=True);p.add_argument('--receipts',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    marker=a.controller/'inspection-started.json'
    with marker.open('x') as f:f.write(json.dumps({'criteria':'1.3','one_pass':True})+'\n')
    try:result=audit(a.controller,a.tree)
    except Exception:
        emit(a.receipts,'controller-audit-error',[(0,'One-pass package audit refused; no raw exception details displayed.')]);raise SystemExit(1)
    a.output.write_text(json.dumps(result,indent=2,ensure_ascii=True)+'\n')
    # Display only permitted schema/header metadata, never provenance plus large raw fragments.
    emit(a.receipts,'controller-package-schema',[(i,json.dumps(r,separators=(',',':'),ensure_ascii=True)) for i,r in enumerate(result['structures'],1)])
