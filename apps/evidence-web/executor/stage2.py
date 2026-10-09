# Second actual tool stage consumes the durable first-stage output, not the input report.
import json,csv
from pathlib import Path
receipt=Path('/output/stage1.json')
x=json.loads(receipt.read_text())
rows=[r for r in x['rows'] if r['state']=='valid_failure']
with open('/output/details.csv','w',newline='') as f:
 w=csv.writer(f);w.writerow(['task','state','runId','rawReward','validScore','source_file','source_sha256','json_pointer'])
 for r in rows:w.writerow([json.dumps(r.get(k),ensure_ascii=False) if r.get(k) is None else r[k] for k in ['task','state','runId','rawReward','validScore']]+[r['source']['file'],r['source']['sha256'],r['source']['pointer']])
x['selection']='valid_failure';x['selectedRows']=len(rows)
Path('/output/analysis.json').write_text(json.dumps(x,ensure_ascii=False))
print(json.dumps(x,ensure_ascii=False))
