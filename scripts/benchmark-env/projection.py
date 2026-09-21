"""Pure replay/projection: no Docker, network, model, or execution imports."""
import csv,hashlib,io,json,pathlib

def project(trace):
    if trace['task']!='da' or trace['realProviderCalls']!=0:raise ValueError('not a DA fixture trace')
    steps=[];previous=''
    for effect in trace['effects']:
        result=effect['result']
        steps.append({'action':'Bash','code':effect['arguments']['command'],'observation':previous})
        previous=result['stdout']+result['stderr']
    steps.append({'action':'Terminate','code':'','observation':previous})
    csv_text=trace['effects'][1]['result']['stdout']
    if not csv_text.startswith('result\n') or trace['effects'][1]['result']['exit_code']!=0:raise ValueError('missing exported fixture artifact')
    payload={'trajectory':steps,'finished':trace['result']['status']=='completed','steps':len(steps),'result':'result.csv','result_files':{'added_files':['result.csv'],'changed_files':[]},'wo71_kind':'export of actual scripted Pan fixture; not DA-Agent and not a solved task'}
    mapping={'trajectory[i].action':'Bash for actual command tool effects; Terminate from actual final Session completion','trajectory[i].code':'effects[i].arguments.command; empty at Terminate','trajectory[i].observation':'previous actual tool stdout+stderr (upstream next-row convention)','finished':'result.status == completed (fixture termination only)','steps':'exported trajectory length including actual final completion','result':'actual CSV emitted by write-and-cat effect index1','result_files':'fixed new file written by effect1 in fresh task','artifact_sha256':hashlib.sha256(csv_text.encode()).hexdigest()}
    return payload,mapping,csv_text

def classify_output(data,expected_fields):
    if data is None:return 'missing_artifact'
    try:
        text=data.decode('utf-8');reader=csv.DictReader(io.StringIO(text),strict=True);rows=list(reader)
        if reader.fieldnames!=expected_fields or not rows or any(None in row or any(v is None for v in row.values()) for row in rows):return 'corrupt_artifact'
    except (UnicodeDecodeError,csv.Error):return 'corrupt_artifact'
    return 'valid_artifact'  # does not imply any score

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('trace');p.add_argument('output');a=p.parse_args()
    trace=json.loads(pathlib.Path(a.trace).read_text());payload,mapping,artifact=project(trace)
    root=pathlib.Path(a.output)/'data-sa-001';(root/'dabench').mkdir(parents=True,exist_ok=True)
    (root/'dabench/result.json').write_text(json.dumps(payload,indent=2)+'\n');(root/'result.csv').write_text(artifact);(root/'source-map.json').write_text(json.dumps(mapping,indent=2)+'\n')
