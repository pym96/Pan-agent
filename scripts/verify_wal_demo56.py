#!/usr/bin/env python3
"""Run task's unchanged test functions with only /app path adaptation, after the model run."""
import pathlib,sys,json,hashlib,traceback
root=pathlib.Path(sys.argv[1]).resolve();source=pathlib.Path(sys.argv[2]);checks=root/'validation';checks.mkdir(exist_ok=True)
original=source.read_bytes();adapted=original.decode().replace('/app/',str(root/'workspace')+'/')
(checks/'upstream-test-original.py').write_bytes(original);(checks/'upstream-test-adapted.py').write_text(adapted)
namespace={};exec(compile(adapted,str(checks/'upstream-test-adapted.py'),'exec'),namespace)
results=[]
for name,fn in namespace.items():
 if name.startswith('test_') and callable(fn):
  try:fn();results.append({'test':name,'passed':True})
  except Exception as e:results.append({'test':name,'passed':False,'error':str(e)})
report={'scope':'adapted upstream test functions, macOS workspace rather than official Docker/Harbor score','sourceSha256':hashlib.sha256(original).hexdigest(),'adaptedSha256':hashlib.sha256(adapted.encode()).hexdigest(),'pathOnlyAdaptation':True,'tests':results,'passed':sum(x['passed'] for x in results),'total':len(results),'allPassed':bool(results) and all(x['passed'] for x in results)}
(checks/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));sys.exit(0 if report['allPassed'] else 1)
