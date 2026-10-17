#!/usr/bin/env python3
"""Read existing receipts; never launch workloads or fill unavailable measurements."""
import collections
import datetime
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
output = []
for path in sorted(root.glob('load-cache*-shards*.json')):
    if any(part in path.stem for part in ('before', 'after', 'container-inspect', 'task-times', 'committed-events')):
        continue
    data = json.loads(path.read_text())
    resources = collections.defaultdict(lambda: {'samples': 0, 'cpuPercentMax': 0, 'containerMemoryBytesMax': 0})
    log = path.with_name(path.stem + '-resources.jsonl')
    for line in log.read_text().splitlines() if log.exists() else []:
        if not line.startswith('{'):
            continue
        item = json.loads(line)
        name = item['Name']
        role = 'load' if '-load-' in name else name.split('-')[-2]
        row = resources[role]
        row['samples'] += 1
        row['cpuPercentMax'] = max(row['cpuPercentMax'], float(item['CPUPerc'].rstrip('%')))
        value = item['MemUsage'].split('/')[0].strip()
        match = re.fullmatch(r'([0-9.]+)([KMG]?i?B)', value)
        if match:
            units = {'B': 1, 'KiB': 1024, 'MiB': 1024**2, 'GiB': 1024**3, 'KB': 1000, 'MB': 1000**2, 'GB': 1000**3}
            row['containerMemoryBytesMax'] = max(row['containerMemoryBytesMax'], float(match[1])*units[match[2]])
    process = path.with_name(path.stem + '-process.txt')
    text = process.read_text() if process.exists() else ''
    def maximum(pattern):
        found = [int(x) for x in re.findall(pattern, text)]
        return max(found) if found else None
    metrics = data.get('metrics', [])
    def metricmax(key):
        found = [x[key] for x in metrics if key in x]
        return max(found) if found else None
    connections = data['connections']
    offered_lag = [(datetime.datetime.fromisoformat(r['offeredAt'].replace('Z', '+00:00')) - datetime.datetime.fromisoformat(r['scheduledAt'].replace('Z', '+00:00'))).total_seconds()*1000 for r in data.get('taskRecords', []) if 'offeredAt' in r and 'scheduledAt' in r]
    output.append({
        'file': path.name,
        'resources': dict(resources),
        'apiFdMax': maximum(r'fds=(\d+)'),
        'apiProcessRSSKiBMax': maximum(r'VmRSS:\s+(\d+)'),
        'apiOSThreadsMax': maximum(r'Threads:\s+(\d+)'),
        'apiGoroutinesMax': metricmax('goroutines'),
        'apiHeapBytesMax': metricmax('heapBytes'),
        'receivedBytes': sum(c['bytes'] for c in connections) if all('bytes' in c for c in connections) else None,
        'receivedCompleteUniqueEvents': sum(len(c['ids']) for c in connections),
        'receivedHeartbeats': sum(c['heartbeats'] for c in connections),
        'connectionErrors': dict(collections.Counter(c['error'] for c in connections if c.get('error'))),
        'actualOfferScheduleLagMaxMs': max(offered_lag) if offered_lag else None,
    })
print(json.dumps({'note': 'Sampled maxima, not continuous peaks. Docker memory and process RSS are different metrics. CPU 100% denotes one core.', 'runs': output}, indent=2))
