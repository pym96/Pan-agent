#!/usr/bin/env python3
"""Pure recomputation from client records and actual pgx query traces."""
import json,sys,pathlib,math,re,collections
root=pathlib.Path(sys.argv[1]);manifest=json.loads((root/'manifest.json').read_text());out=[]
def quantile(values):
 v=sorted(values);return {'n':len(v),'p50Ms':v[math.ceil(.5*len(v))-1]/1e6 if v else None,'p95Ms':v[math.ceil(.95*len(v))-1]/1e6 if v else None}
def counters(log):
 auth=own=projection=peak=control=0
 for line in log.splitlines():
  m=re.search(r'view-query auth=(\d+) ownership=(\d+)',line)
  if m:auth+=int(m[1]);own+=int(m[2])
  m=re.search(r'view-control sql=(\d+)',line)
  if m:control+=int(m[1])
  m=re.search(r'view-projection sql=(\d+) live=(\d+) peak=(\d+)',line)
  if m:projection+=int(m[1]);peak=max(peak,int(m[3]))
 return {'authenticationSQL':auth,'ownershipSQL':own,'projectionSQL':projection,'controlSQL':control,'projectionPeak':peak}
for mode in manifest['rounds']:
 records=json.loads((root/(mode+'-requests.json')).read_text());assert len(records)==200 and sorted(r['index'] for r in records)==list(range(200))
 for r in records:assert [r['who'],r['path']]==manifest['sequence'][r['index']]
 success=[r for r in records if r['status']==200];errors=[r for r in records if r['status']!=200 and r['endNs'] is not None];unknown=[r for r in records if r['endNs'] is None]
 cache=collections.Counter(r['cache'] for r in records);den=cache['hit']+cache['miss'];boundary=json.loads((root/(mode+'-log-boundary.json')).read_text());log=(root/(mode+'-api.log')).read_bytes()
 counts=counters(log[boundary['offset']:boundary['end']].decode());counts['separatelyExcludedWarmup']=counters(log[:boundary['offset']].decode())
 item={'mode':mode,'requests':200,'success':len(success),'status503':sum(r['status']==503 for r in records),'errors':len(errors),'timeouts':sum(r['error'] in ['TimeoutError','URLError'] for r in records),'cancellations':sum(r['error']=='CancelledError' for r in records),'unfinished':len(unknown),'statuses':dict(collections.Counter(str(r['status']) for r in records)),'successLatency':quantile([r['latencyNs'] for r in success]),'errorLatency':quantile([r['latencyNs'] for r in errors]),'cache':dict(cache),'hitRate':cache['hit']/den if den else None,'maxHitAgeMs':max((int(r['ageMs']) for r in records if r['cache']=='hit'),default=None),**counts};out.append(item)
assert out[2]['cache'].get('hit',0)>0 and out[2]['projectionSQL']<out[0]['projectionSQL']
assert all(x['projectionPeak']<=4 for x in out)
print(json.dumps(out,ensure_ascii=False,indent=2))
