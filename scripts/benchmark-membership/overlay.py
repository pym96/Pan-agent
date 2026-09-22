"""Apply only reviewed membership/reason fields; reuse the immutable #72 selector."""
import copy,hashlib,importlib.util,json
from pathlib import Path
from projection import TARGETS
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('wo72_selector',ROOT.parent/'benchmark-subset/selector.py')
selector=importlib.util.module_from_spec(spec);spec.loader.exec_module(selector)
BASE_POOL_SHA='82b4c021a9d712ff73a0e32c82484c56960f89a34530e5b5eccb798f11549710'
REASONS={'required_input_unprovided_in_pinned_distribution','instruction_scorer_semantic_conflict'}

def apply(pool,decisions):
    if hashlib.sha256(selector.canonical(pool)).hexdigest()!=BASE_POOL_SHA:
        raise ValueError("protected base pool changed")
    if not isinstance(decisions,list) or len(decisions)!=16 or {d.get('id') for d in decisions}!=set(TARGETS):
        raise ValueError('exactly 16 unique authorized decisions required')
    result=copy.deepcopy(pool);index={r['instance_id']:r for r in result if r['domain']=='da'}
    if len(pool)!=800 or len({(r['domain'],r['instance_id']) for r in pool})!=800:raise ValueError('invalid base identities')
    for d in decisions:
        if d.get('decision') not in {'eligible','excluded'}:raise ValueError('unresolved membership prevents overlay and selection')
        row=index[d['id']]
        if row['decision']!='unresolved' or row['exposure_reasons']:raise ValueError('unexpected base decision/exposure')
        if d.get('original_reasons')!=row['unresolved']:raise ValueError('original reasons mismatch')
        if not d.get('evidence') or not d.get('requirements') or not d.get('runtime_gaps'):raise ValueError('incomplete decision evidence')
        if d['decision']=='excluded' and d.get('reason') not in REASONS:raise ValueError('unauthorized exclusion reason')
        if d['decision']=='eligible' and d.get('reason')!='structural_provision_identified':raise ValueError('invalid eligible reason')
        row['decision']=d['decision'];row['unresolved']=[]
        row['structural_missing']=[d['reason']] if d['decision']=='excluded' else []
    for old,new in zip(pool,result):
        changed={k for k in set(old)|set(new) if old.get(k)!=new.get(k)}
        if changed and (old['domain']!='da' or old['instance_id'] not in TARGETS or not changed<={'decision','unresolved','structural_missing'}):raise ValueError('protected field mutation')
    return result

def derive(pool,decisions):
    new=apply(pool,decisions);selection=selector.select(new)
    if selection['blockers'] or len(selection['selected'])!=30:raise ValueError('selection incomplete')
    selection['status']='structural_subset_frozen_pending_environment_and_activation'
    selection['population_boundary']='Structurally complete and instruction/scorer-consistent subset of pinned available distribution under #73 Criteria1.2.'
    return new,selection

def load_frozen(criteria="1.3"):
    if criteria not in {"1.1","1.2","1.3"}:raise ValueError("unsupported criteria")
    lock_file={"1.1":"continuation-lock.json","1.2":"continuation-lock-v12.json","1.3":"continuation-lock-v13.json"}[criteria]
    decision_file={"1.1":"decisions-v11.json","1.2":"decisions-v12.json","1.3":"decisions-v13.json"}[criteria]
    data=(ROOT.parent/'benchmark-subset/generated/pool.json').read_bytes()
    lock=json.loads((ROOT/lock_file).read_text())
    if hashlib.sha256(data).hexdigest()!=lock['base_pool_sha256']:raise ValueError('base pool integrity mismatch')
    source=(ROOT/decision_file).read_bytes()
    if hashlib.sha256(source).hexdigest()!=lock['decisions_sha256']:raise ValueError('decision freeze integrity mismatch')
    return json.loads(data),json.loads(source)['decisions']

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    pool,decisions=load_frozen();new,selection=derive(pool,decisions)
    a.output.mkdir(parents=True,exist_ok=True)
    (a.output/'pool.json').write_bytes(selector.canonical(new))
    (a.output/'selection.json').write_bytes(selector.canonical(selection))
