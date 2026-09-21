"""Pure WO72 Criteria1.0 allocation. No network, credential or execution path."""
from collections import Counter, defaultdict
import hashlib
import json

VERSION = '72/Criteria1.0/selector-v1'
SEED = 'pan-public-baseline-v1'
DOMAINS = ('da', 'swe')  # ascending UTF-8 domain order


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode()


def rank(domain, instance_id):
    return hashlib.sha256((SEED + '\0' + domain + '\0' + instance_id).encode()).hexdigest()


def allocate(counts, count=15):
    if type(count) is not int or count < 1:
        raise ValueError('positive integer sample size required')
    if not counts or any(type(n) is not int or n < 1 for n in counts.values()):
        raise ValueError('positive stratum sizes required')
    total = sum(counts.values())
    if total < count:
        raise ValueError('shortfall')
    allocations = {s: count * n // total for s, n in counts.items()}
    order = sorted(counts, key=lambda s: (-(count * counts[s] % total), s.encode()))
    for s in order[:count - sum(allocations.values())]:
        allocations[s] += 1
    return [{'stratum': s, 'population': counts[s], 'initial': count * counts[s] // total,
             'remainder': count * counts[s] % total, 'allocated': allocations[s]}
            for s in sorted(counts, key=str.encode)]


def select(pool, blockers=()):
    seen = set()
    for row in pool:
        key = row['domain'], row['instance_id']
        if key in seen:
            raise ValueError('duplicate domain/ID: ' + repr(key))
        seen.add(key)
        if row['domain'] not in DOMAINS or not isinstance(row['instance_id'], str) or not row['instance_id']:
            raise ValueError('invalid identity')
        if row['decision'] not in ('eligible', 'excluded', 'unresolved'):
            raise ValueError('invalid eligibility')
        if row['decision'] == 'eligible' and (not row.get('stratum') or row.get('exposure_reasons')):
            raise ValueError('eligible row missing stratum or contains exposure')
    failures = sorted(set(blockers))
    domains = {}
    diagnostic = []
    for domain in DOMAINS:
        rows = [r for r in pool if r['domain'] == domain]
        unknown = [r['instance_id'] for r in rows if r['decision'] == 'unresolved']
        eligible = [r for r in rows if r['decision'] == 'eligible']
        if unknown:
            failures.append(domain + ': unresolved membership')
        counts = Counter(r['stratum'] for r in eligible)
        allocation = allocate(counts) if len(eligible) >= 15 else []
        if len(eligible) < 15:
            failures.append(domain + ': fewer than 15 eligible tasks')
        for a in allocation:
            ranked = sorted((r for r in eligible if r['stratum'] == a['stratum']),
                            key=lambda r: (rank(domain, r['instance_id']), r['instance_id'].encode()))
            for i, r in enumerate(ranked[:a['allocated']], 1):
                diagnostic.append({'domain': domain, 'stratum': a['stratum'], 'instance_id': r['instance_id'],
                                   'rank': i, 'rank_sha256': rank(domain, r['instance_id'])})
        domains[domain] = {'source_count': len(rows), 'eligible_count': len(eligible),
                           'excluded_count': sum(r['decision'] == 'excluded' for r in rows),
                           'unresolved_ids': sorted(unknown, key=str.encode), 'allocations': allocation}
    failures = sorted(set(failures))
    return {'selector_version': VERSION, 'seed': SEED, 'requested_per_domain': 15,
            'status': 'blocked_proposal' if failures else 'metadata_selection_proposed',
            'execution_authorized': False, 'campaign_id': None, 'runtime_sha': None,
            'blockers': failures, 'domains': domains,
            'selected': [] if failures else diagnostic,
            'diagnostic_known_eligible_selection': diagnostic if failures else [],
            'claim': 'Convenience subset of declared pool; not full-benchmark representativeness or untouched holdout.'}


def validate(pool, result, blockers=()):
    if canonical(select(pool, blockers)) != canonical(result):
        raise ValueError('selection does not reconstruct exactly')
