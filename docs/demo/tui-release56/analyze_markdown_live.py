#!/usr/bin/env python3
"""Derive display times and usage from original PTY and nested archive records."""
import sys,pathlib,json,pyte,hashlib,tarfile
r=pathlib.Path(sys.argv[1]);screen=pyte.Screen(120,38);stream=pyte.Stream(screen);first=last=completed=None
for line in (r/'capture/terminal.cast').read_text().splitlines()[1:]:
 t,kind,data=json.loads(line);stream.feed(data);view='\n'.join(screen.display)
 if 'Responding' in view and '▌' in view:
  if first is None:first=t
  last=t
 if 'Completed' in view and completed is None:completed=t
records=[json.loads(x)['record'] for x in next((r/'archives/runs').glob('*/events.jsonl')).read_text().splitlines()];models=[x for x in records if x['type']=='model.turn_settled'];tools=[x for x in records if x['type'].startswith('tool.')]
assert len(models)==1 and not tools and first<last<completed
pkg=r/'download/pan-agent-0.1.4.tgz';checked=0
with tarfile.open(pkg) as tf:
 for member in tf.getmembers():
  if member.isfile():
   relative=pathlib.PurePosixPath(member.name).relative_to('package');assert '..' not in relative.parts
   assert tf.extractfile(member).read()==(r/'consumer/node_modules/pan-agent'/relative).read_bytes(),member.name;checked+=1
print(json.dumps({'runId':models[0]['runId'],'modelTurns':len(models),'toolRecords':len(tools),'usage':models[0]['usage'],'firstStreamingMarkdown':first,'lastVisibleProvisional':last,'firstCompletedFrame':completed,'packageSha256':hashlib.sha256(pkg.read_bytes()).hexdigest(),'installedPackageFilesMatched':checked,'source':'PTY visible states + nested archive records; original recorder checkpoint counters ignored'},indent=2))
