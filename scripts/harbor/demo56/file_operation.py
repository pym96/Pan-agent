# Runs INSIDE the bound task container through python3, never on the host.
import json,sys,pathlib,base64
request=json.loads(base64.b64decode(sys.argv[1]));args=request['arguments'];kind=request['tool']
p=pathlib.Path(args['path']);p=p if p.is_absolute() else pathlib.Path('/app')/p
p=p.resolve()
if p!=pathlib.Path('/app') and pathlib.Path('/app') not in p.parents:raise ValueError('outside_container_workspace')
if kind=='read':
 lines=p.read_text().splitlines(keepends=True);start=max(0,args.get('offset',1)-1);count=args.get('limit',len(lines));print(''.join(lines[start:start+count]),end='')
elif kind=='write':
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(args['content']);print('Wrote',len(args['content'].encode()),'bytes to',p)
elif kind=='edit':
 text=p.read_text()
 for change in args['edits']:
  if text.count(change['oldText'])!=1:raise ValueError('edit_match_not_unique')
  text=text.replace(change['oldText'],change['newText'],1)
 p.write_text(text);print('Applied',len(args['edits']),'edit(s) to',p)
else:raise ValueError('unknown_operation')
