#!/usr/bin/env python3
"""Separate post-load read-only replay probe; not continuation of original clients."""
import collections
import json
import pathlib
import sys
import time
import urllib.request

root = pathlib.Path(sys.argv[1])
base = sys.argv[2] if len(sys.argv) > 2 else 'http://api:8080'
executed = 'aa1d1afcfb4c822e9082da4b4372f4ea824d8906'
started = time.time()
results = []
for identity in sorted(root.glob('load-*-source-sha.txt')):
    if identity.read_text().strip() != executed:
        continue
    stem = identity.name.removesuffix('-source-sha.txt')
    receipt = json.loads((root / (stem + '.json')).read_text())
    canonical = json.loads((root / (stem + '-committed-events.json')).read_text())
    by_session = collections.defaultdict(list)
    for event in canonical:
        by_session[event['session']].append(event['id'])
    groups = collections.Counter((c['session'], max(c['ids'], default=0)) for c in receipt['connections'])
    rows = []
    for (session, cursor), clients in sorted(groups.items()):
        expected = [i for i in by_session[session] if i > cursor]
        row = {'session': session, 'cursor': cursor, 'originalClientsWithCursor': clients,
               'expectedSuffixIDs': expected, 'receivedSuffixIDs': [], 'complete': not expected}
        request_started = time.monotonic()
        if expected:
            if time.time() - started > 600:
                row['error'] = 'separate replay probe total 600-second bound reached'
            else:
                request = urllib.request.Request(base + '/sessions/' + session + '/events', headers={'Last-Event-ID': str(cursor)})
                try:
                    with urllib.request.urlopen(request, timeout=15) as response:
                        for raw in response:
                            if raw.startswith(b'data: '):
                                event_id = json.loads(raw[6:])['id']
                                row['receivedSuffixIDs'].append(event_id)
                                if event_id >= expected[-1]:
                                    break
                    row['complete'] = row['receivedSuffixIDs'] == expected
                except Exception as error:
                    row['error'] = str(error)
        row['replaySeconds'] = time.monotonic() - request_started
        rows.append(row)
    results.append({'file': stem + '.json', 'distinctCursorGroups': len(rows),
                    'originalClients': len(receipt['connections']),
                    'originalUnobservedSuffixIDs': sum(len(r['expectedSuffixIDs'])*r['originalClientsWithCursor'] for r in rows),
                    'allDistinctSuffixesReplayed': all(r['complete'] for r in rows), 'groups': rows})
print(json.dumps({'boundary': 'Separate read-only post-load requests, one per distinct cursor/session with a suffix. Original subscriptions closed at deadline; this does not claim they later caught up.',
                  'executedSource': executed, 'seconds': time.time()-started, 'runs': results}, indent=2))
if not all(r['allDistinctSuffixesReplayed'] for r in results):
    sys.exit(1)
