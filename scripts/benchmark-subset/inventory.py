"""Project pinned external metadata to non-gold inventory and blocked/proposed selection.

Reads no task/gold payloads. The official eval JSON itself embeds scalar answers;
these are classified as exposed and never emitted or individually hashed.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from selector import canonical, select, validate

HERE = Path(__file__).resolve().parent
DA_REV = 'b211daf51fdc9b52d5087c9df28ac50191bcabed'
SWE_REV = 'b0dde1093fe417d83b7184254edf8199c1f0dff5'
DA_BASE = 'sources/da-code/'
TASKS = DA_BASE + 'da_code/configs/task/all.jsonl'
EVALS = DA_BASE + 'da_code/configs/eval/eval_all.jsonl'
BLOCKERS = ['DA inline-answer exposure incident requires methodology adjudication; no untouched-reserve claim']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load_lines(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def unique(rows, key):
    result = {}
    for row in rows:
        value = row[key]
        if value in result:
            raise ValueError('duplicate ' + key + ': ' + str(value))
        result[value] = row
    return result


def verify_inputs(root, lock):
    for entry in lock['files']:
        name = PurePosixPath(entry['path'])
        if name.is_absolute() or '..' in name.parts:
            raise ValueError('unsafe input path')
        path = root / name
        if path.is_symlink() or path.stat().st_size != entry['bytes'] or digest(path.read_bytes()) != entry['sha256']:
            raise ValueError('input drift: ' + str(name))
    tree = json.loads((root / 'da-full-tree.json').read_text())
    if tree['sha'] != DA_REV or tree.get('truncated') is not False:
        raise ValueError('wrong or incomplete DA tree')
    entries = unique(tree['tree'], 'path')
    for entry in lock['files']:
        if entry['path'].startswith(DA_BASE):
            rel = entry['path'][len(DA_BASE):]
            content = (root / entry['path']).read_bytes()
            git_blob = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
            if git_blob != entries[rel]['sha']:
                raise ValueError('Git blob drift: ' + rel)
    hf = json.loads((root / 'swe-tree.json').read_text())
    item = next(x for x in hf if x['path'] == 'data/test-00000-of-00001.parquet')
    if digest((root / 'swe-test.parquet').read_bytes()) != item['lfs']['oid']:
        raise ValueError('SWE LFS mismatch')
    return entries


def da_inventory(tasks, evals, entries, exposure):
    tmap, emap = unique(tasks, 'id'), unique(evals, 'id')
    result = []
    for id_ in sorted(tmap.keys() | emap.keys(), key=str.encode):
        task, ev = tmap.get(id_), emap.get(id_)
        missing, unresolved = [], []
        reasons = list(exposure.get(('da', id_), []))
        if task is None or ev is None:
            missing.append('official task/eval mapping missing')
        if task is not None and not isinstance(task.get('instruction'), str):
            missing.append('instruction missing')
        elif task is not None and not task['instruction'].strip():
            missing.append('empty instruction')
        assets = {}
        for kind in ('source', 'gold'):
            prefix = 'da_code/' + kind + '/' + id_
            directory = entries.get(prefix)
            assets[kind] = [{'path': x['path'], 'git_blob': x['sha'], 'published_bytes': x.get('size'), 'mode': x.get('mode')}
                            for p, x in sorted(entries.items()) if p.startswith(prefix + '/') and x['type'] == 'blob']
            if not directory or directory['type'] != 'tree' or not assets[kind]:
                missing.append('missing or empty task-specific ' + kind + ' tree')
        funcs = (ev or {}).get('func', [])
        funcs = [funcs] if isinstance(funcs, str) else funcs
        if len(funcs) != 1 or not funcs[0]:
            unresolved.append('official evaluator function is not a unique stratum')
        requirements = []
        inline = False
        for spec in (ev or {}).get('result', []):
            if 'number' in spec:
                inline = True
                requirements.append({'kind': 'inline_answer', 'payload_omitted': True, 'shape': 'official result.number; evaluator-only'})
                continue
            files = spec.get('file', [])
            files = [files] if isinstance(files, str) else files
            for file in files:
                requirements.append({'kind': 'file', 'output_path': file, 'gold_basename': PurePosixPath(file).name,
                                     'multi': spec.get('multi', False)})
                if 'da_code/gold/' + id_ + '/' + PurePosixPath(file).name not in entries:
                    missing.append('missing officially referenced gold file: ' + PurePosixPath(file).name)
        if inline:
            reasons.append('WO72 official eval contains inline answer; machine-parsed, conservatively exposed')
        # Instruction references are static hints, not an invented complete input schema.
        instruction = (task or {}).get('instruction', '')
        quoted = re.findall(r'[\x60\"\x27]([^\x60\"\x27\n]+\.(?:csv|json|npy|xlsx|sqlite|db|txt|yaml|png|jpg|gz))[\x60\"\x27]', instruction, re.I)
        quoted += re.findall(r'(?<![\w/])([\w./-]+\.(?:csv|json|npy|xlsx|sqlite|db|txt|yaml|png|jpg|gz|md))(?!\w)', instruction, re.I)
        names = {PurePosixPath(x['path']).name for x in assets['source']}
        outputs = {PurePosixPath(x['output_path']).name for x in requirements if x['kind'] == 'file'}
        references = [{'name': n, 'status': 'source_inventory' if PurePosixPath(n).name in names else
                       'output_requirement' if PurePosixPath(n).name in outputs else 'unresolved_input_or_generated_artifact'}
                      for n in sorted(set(quoted), key=str.encode)]
        if any(x['status'].startswith('unresolved') for x in references):
            unresolved.append('instruction file reference not statically classified')
        if assets['source'] and not any(PurePosixPath(x['path']).suffix.lower() in ('.csv','.gz','.db','.sqlite','.xlsx','.npy','.data') for x in assets['source'] if PurePosixPath(x['path']).name not in outputs and not PurePosixPath(x['path']).name.startswith('sample_')):
            unresolved.append('source inventory has no recognized data payload; external/dynamic requirements unresolved')
        if task and task.get('post_process'):
            unresolved.append('official post-processing prerequisites unresolved: ' + ','.join(task['post_process']))
        decision = 'excluded' if missing or reasons else 'unresolved' if unresolved else 'eligible'
        result.append({'domain': 'da', 'instance_id': id_, 'stratum': funcs[0] if len(funcs) == 1 else None,
                       'decision': decision, 'structural_missing': sorted(set(missing)), 'unresolved': sorted(set(unresolved)),
                       'exposure_reasons': sorted(set(reasons)), 'source_revision': DA_REV, 'split': 'official all.jsonl (no upstream split field)',
                       'instruction': {'source': TASKS, 'id': id_, 'sha256': digest(instruction.encode()), 'rewritten': False},
                       'assets': assets, 'static_instruction_references': references,
                       'official_scoring': {'source': EVALS, 'id': id_, 'func': funcs, 'options': (ev or {}).get('options'),
                                            'config': (ev or {}).get('config'), 'conj': (ev or {}).get('conj', 'avg'), 'requirements': requirements},
                       'post_process': (task or {}).get('post_process'),
                       'license': 'DA-Code code MIT; per-dataset rights/provenance unresolved; tree presence is not download permission',
                       'runtime_status': 'not_validated', 'image_digest': None,
                       'environment_gaps': ['task-specific dependency/image lock', 'dataset provenance/license and external acquisition',
                                            'verify source README/instruction asset requirements', 'official scorer fresh-environment preflight']})
    return result


def swe_inventory(parquet, exposure):
    import pyarrow.parquet as pq  # existing host dependency; never install or execute upstream evaluator
    columns = ['instance_id', 'repo', 'base_commit', 'problem_statement', 'version', 'FAIL_TO_PASS', 'PASS_TO_PASS',
               'image', 'eval_type', 'log_parser', 'environment_setup_commit']
    source = unique(pq.read_table(parquet, columns=columns).to_pylist(), 'instance_id')
    rows = []
    for id_, task in sorted(source.items()):
        missing = [key + ' missing' for key in ['repo','base_commit','problem_statement','version'] if not task.get(key)]
        sizes = {}
        for key in ['FAIL_TO_PASS','PASS_TO_PASS']:
            try:
                value = json.loads(task[key]) if isinstance(task[key], str) else task[key]
                if not isinstance(value, list) or not all(isinstance(x,str) and x for x in value):
                    raise ValueError('not test-name list')
                sizes[key] = len(value)
            except (ValueError, TypeError, KeyError):
                missing.append(key + ' invalid'); sizes[key] = None
        reasons = exposure.get(('swe',id_), [])
        rows.append({'domain':'swe','instance_id':id_,'stratum':task['repo'],
                     'decision':'excluded' if missing or reasons else 'eligible','structural_missing':missing,'unresolved':[],
                     'exposure_reasons':reasons,'source_revision':SWE_REV,'split':'test','repo':task['repo'],'base_commit':task['base_commit'],
                     'instruction':{'source':'swe-test.parquet:problem_statement','id':id_, 'sha256':digest(task['problem_statement'].encode()),'rewritten':False},
                     'official_scoring':{'runner_revision':'7a21e05772954cc81471ae19d56f436cecf43c54','metric':'resolved',
                                         'test_counts':sizes,'version':task['version'],'eval_type':task['eval_type'],'log_parser':task['log_parser']},
                     'published_image':task['image'],'image_digest':None,'environment_setup_commit':task['environment_setup_commit'],
                     'runtime_status':'not_validated','published_size':None,'required_artifact':'model_patch against exact base_commit',
                     'license':'SWE-bench code MIT; per-repository code/data rights must be checked before staging',
                     'environment_gaps':['resolve public image digest and platform','task-specific dependencies/data sizes unknown',
                                         'per-task restricted evaluator preflight; no #71 control transfer']})
    return rows


def build(root, lock, exposures):
    entries = verify_inputs(root,lock)
    exp = {(r['domain'],r['instance_id']):r['reasons'] for r in exposures['historical']}
    pool = da_inventory(load_lines(root/TASKS),load_lines(root/EVALS),entries,exp) + swe_inventory(root/'swe-test.parquet',exp)
    pool.sort(key=lambda x:(x['domain'].encode(),x['instance_id'].encode()))
    proposal = select(pool, BLOCKERS)
    validate(pool,proposal,BLOCKERS)
    proposed_ids = {(x['domain'],x['instance_id']) for x in proposal['diagnostic_known_eligible_selection'] + proposal['selected']}
    feasible = None  # finalized below from both diagnostic cases
    # Concrete sensitivity witness: unresolved rows included vs withheld. This is NOT a selectable alternate campaign.
    possible = [dict(r,decision='eligible') if r['decision']=='unresolved' else r for r in pool]
    alt = select(possible,BLOCKERS)
    proposed_ids |= {(x['domain'],x['instance_id']) for x in alt['diagnostic_known_eligible_selection']}
    feasible = [r for r in pool if (r['domain'],r['instance_id']) in proposed_ids]
    witness = {'label':'diagnostic sensitivity only; membership not adjudicated',
               'withheld_unknowns':proposal['diagnostic_known_eligible_selection'],
               'included_unknowns':alt['diagnostic_known_eligible_selection'],
               'different':canonical(proposal['diagnostic_known_eligible_selection'])!=canonical(alt['diagnostic_known_eligible_selection'])}
    holdout = {'accepted_holdout':False,'future_preregistration_required':True,
               'historical':exposures['historical'],
               'current_pool':[{'domain':r['domain'],'instance_id':r['instance_id'],'metadata_machine_inspected':True,
                               'instruction_machine_inspected':True,'gold_payload_file_inspected':False,
                               'answer_exposure':r['exposure_reasons'],'execution':False,
                               'future_untouched_validation':'excluded' if r['exposure_reasons'] or (r['domain'],r['instance_id']) in proposed_ids else 'reserve_only_not_accepted_holdout'} for r in pool]}
    return {'pool.json':pool,'proposal.json':proposal,'feasibility.json':feasible,'membership-counterexample.json':witness,'holdout-exposure.json':holdout}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('inputs',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--check',action='store_true')
    args=parser.parse_args();lock=json.loads((HERE/'input-lock.json').read_text());exposure=json.loads((HERE/'historical-exposure.json').read_text())
    products=build(args.inputs,lock,exposure)
    args.output.mkdir(parents=True,exist_ok=True)
    for name,value in products.items():
        data=canonical(value);target=args.output/name
        if args.check:
            if target.read_bytes()!=data:raise ValueError('generated drift: '+name)
        else:target.write_bytes(data)
    print(json.dumps({'status':products['proposal.json']['status'],'domains':products['proposal.json']['domains'],
                      'counterexample_differs':products['membership-counterexample.json']['different']},sort_keys=True))

if __name__=='__main__':main()
