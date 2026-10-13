"""Independent imported-row oracle. Never sends data to the model or edits its output."""
import pathlib,json,csv,hashlib,collections,re,argparse
parser=argparse.ArgumentParser();parser.add_argument('journey');parser.add_argument('--input',required=True);parser.add_argument('--root',required=True);parser.add_argument('--output');args=parser.parse_args()
r=pathlib.Path(args.root);j=r/args.journey;raw=pathlib.Path(args.input).read_bytes();source=json.loads(raw);sha=hashlib.sha256(raw).hexdigest();original=source['classifications'];expected_counts=dict(collections.Counter(x['state'] for x in original));expected_valid=sum(x['validScore'] is not None for x in original);expected_usage=source['segment7Final']['tasks'][0]['accounting']['usage'];strict=False
def walk(value,path=''):
 yield path,value
 if isinstance(value,dict):
  for k,v in value.items():yield from walk(v,path+'/'+k.replace('~','~0').replace('/','~1'))
 elif isinstance(value,list):
  for i,v in enumerate(value):yield from walk(v,path+'/'+str(i))
def cell(v,raw):
 if raw is None:return v.strip().lower() in ['', 'null', 'none', '未知']
 if isinstance(raw,(int,float)):
  try:return float(v)==raw
  except ValueError:return False
 return v==str(raw)
checks=[];tasks=[]
for i in [1,2]:
 t=json.loads((j/f'task-{i}.json').read_text());a=json.loads((j/f'round{i}-analysis.json').read_text());rows=list(csv.DictReader((j/f'round{i}-details.csv').open()));expected_indices=list(range(len(original))) if i==1 else [k for k,x in enumerate(original) if x['state']=='valid_failure' and x['validScore'] is not None]
 assert t['state']=='completed' and t['cleanupConfirmed'] and t['result']['mode']=='kimi' and t['result']['providerSends']>0
 actual_indices=[]
 for row in rows:
  assert row['source_file']=='summary.json' and row['source_sha256']==sha
  p=row['json_pointer'];assert re.fullmatch('/classifications/(0|[1-9][0-9]*)',p);k=int(p.rsplit('/',1)[1]);actual_indices.append(k);o=original[k]
  for field in ['task','state','rawReward','validScore']:assert field in row and cell(row[field],o[field]),(i,k,field,row.get(field),o[field])
 assert len(actual_indices)==len(expected_indices) and sorted(actual_indices)==expected_indices
 for n in ['analysis.json','details.csv']:assert hashlib.sha256((j/f'round{i}-{n}').read_bytes()).hexdigest()==t['result']['artifacts'][n]['sha256']
 checks.append({'round':i,'csvRows':len(rows),'exactOriginalIndices':actual_indices,'allOriginalTaskStateRewardScoreCellsMatch':True,'artifactHashesMatch':True,'providerSends':t['result']['providerSends'],'modelCalls':t['result']['result']['modelCalls'],'toolCalls':t['result']['result']['toolCalls'],'accounting':t['recovery']['accounting'],'usage':t['result']['result']['usage']});tasks.append(t)
 if i==1:
  counts_paths=[p for p,v in walk(a['data']) if isinstance(v,dict) and all(v.get(k)==n for k,n in expected_counts.items())];assert counts_paths,expected_counts
  denominator_paths=[p for p,v in walk(a['data']) if v==expected_valid and any(s in p.lower() for s in ['valid','denominator','分母'])];assert denominator_paths
  usage_paths=[p for p,v in walk(a['data']) if isinstance(v,dict) and all(v.get(k,v.get(k+'Tokens'))==expected_usage[k] for k in ['known','unknown','input','output'])];assert usage_paths
  if strict:
   assert not re.search(r'\d+(?:\.\d+)?\s*%',t['result']['result']['finalText'])
   assert not any(isinstance(v,dict) and any(k in v for k in ['successRateOverValid','cumulativeKnownObservedTotals','knownObservedTotals']) for _,v in walk(a['data']))
   assert any(s['pointer'].startswith('/segment7Final/tasks/') and 'usage' in s['pointer'] for s in a['sources'])
  checks[-1].update(countsPaths=counts_paths,denominatorPaths=denominator_paths,usagePaths=usage_paths,strictScope=strict)
context=json.loads(tasks[1]['contextText']);assert context['turns'][0]['taskId']==tasks[0]['id'] and context['turns'][0]['answer']==tasks[0]['result']['result']['finalText']
received=[e for e in tasks[1]['events'] if e.get('type')=='context.received'];assert received
quoted=[json.loads(c['text'].split('\n',1)[1]) for m in received[0]['messages'] for c in m['content'] if c.get('text','').startswith('Completed public conversation')]
assert quoted and quoted[0]['turns'][0]['answer']==tasks[0]['result']['result']['finalText']
result={'passed':True,'journey':args.journey,'inputSHA256':sha,'expectedCounts':expected_counts,'expectedValidDenominator':expected_valid,'expectedSegment7Usage':expected_usage,'checks':checks,'actualSecondExchangeReceivesFirstPublicAnswer':True,'notBenchmarkScore':True,'note':'Builder independent calculation, not an independent Regulator Verdict. Prior live02 reporting-scope deviation is preserved separately.'}
if args.output:
 with pathlib.Path(args.output).open('x') as f:f.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
