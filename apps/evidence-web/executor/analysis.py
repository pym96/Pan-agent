# Faux's deterministic generated-code fixture. Executed only inside Docker.
import json, csv, collections, hashlib
from pathlib import Path
meta=json.loads(Path('/input/task.json').read_text())
p=Path('/input')/meta['summary']
raw=p.read_bytes();d=json.loads(raw);rows=d['classifications']
counts=dict(collections.Counter(r['state'] for r in rows))
usage=d['segment7Final']['tasks'][0]['accounting']['usage']
source={'file':meta['summary'],'sha256':hashlib.sha256(raw).hexdigest()}
result={'label':'导入报告统计 · Offline Faux（非真实模型）','total':len(rows),'counts':counts,'validScored':sum(r['validScore'] is not None for r in rows),'segment7Usage':{k:usage[k] for k in ['known','unknown','input','output']},'usageScope':'仅 segment7Final，非累计','sources':[dict(source,pointer='/classifications'),dict(source,pointer='/segment7Final/tasks/0/accounting/usage')],'rows':[dict(r,source=dict(source,pointer='/classifications/'+str(i))) for i,r in enumerate(rows)]}
with open('/output/details.csv','w',newline='') as f:
 w=csv.writer(f);w.writerow(['task','state','runId','rawReward','validScore','source_file','source_sha256','json_pointer'])
 for i,r in enumerate(rows):w.writerow([json.dumps(r.get(k),ensure_ascii=False) if r.get(k) is None else r[k] for k in ['task','state','runId','rawReward','validScore']]+[source['file'],source['sha256'],'/classifications/'+str(i)])
Path('/output/analysis.json').write_text(json.dumps(result,ensure_ascii=False))
print(json.dumps(result,ensure_ascii=False))
