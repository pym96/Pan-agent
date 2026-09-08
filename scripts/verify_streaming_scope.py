#!/usr/bin/env python3
"""Disposable current/historical snapshots and scope/graph negative controls; never edit candidate or #42 retained paths."""
import argparse,hashlib,json,subprocess,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir()
root=Path(__file__).resolve().parents[1];base='fd408c4ecd236cf97d509436085e4df461829e9e';reports=[]
def snapshot(sha,name):
 target=a.output/name;target.mkdir();archive=subprocess.check_output(['git','archive',sha],cwd=root);subprocess.run(['tar','-xf','-','-C',str(target)],input=archive,check=True);return target
def run(name,args,expected=0,needle=None):
 result=subprocess.run(args,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);log=a.output/(name+'.log');log.write_text(result.stdout);assert result.returncode==expected,(name,result.stdout[-2000:]);assert needle is None or needle in result.stdout,(name,needle,result.stdout[-2000:]);reports.append({'name':name,'command':list(map(str,args)),'exit':result.returncode,'expected':expected,'log':str(log),'sha256':hashlib.sha256(log.read_bytes()).hexdigest()})
current=snapshot('HEAD','current');run('current',['node',str(root/'scripts/check_streaming_scope.mjs'),str(current)])
for file,needle,name in [('typescript/src/tools/pan-trusted-local-tools.ts','protected file changed','current-tool'),('typescript/src/runtime/agent-kernel.ts','unapproved core wiring','current-runtime')]:
 target=current/file;old=target.read_bytes();target.write_bytes(old+b'\n// unauthorized mutation control\n');run(name,['node',str(root/'scripts/check_streaming_scope.mjs'),str(current)],1,needle);target.write_bytes(old)
# A separate new worktree lets the unchanged historical checker see its exact base and git state.
historical=a.output/'historical-42';subprocess.run(['git','worktree','add','--detach',str(historical),base],cwd=root,check=True,stdout=subprocess.PIPE);shutil.copytree(root/'typescript/node_modules',historical/'typescript/node_modules',symlinks=True)
run('historical-42',['node',str(historical/'scripts/check_tui_scope.mjs')])
for file,addition,needle,name in [('typescript/src/runtime/agent-kernel.ts','\n// unauthorized historical core mutation\n','protected file changed','historical-core'),('typescript/src/tui/presentation.ts','\nimport "../providers/deepseek/deepseek-profile.ts";\n','forbidden edge: tui -> providers','historical-graph')]:
 target=historical/file;old=target.read_bytes();target.write_bytes(old+addition.encode());run(name,['node',str(historical/'scripts/check_tui_scope.mjs')],1,needle);target.write_bytes(old)
assert not subprocess.check_output(['git','status','--porcelain'],cwd=historical).strip()
(a.output/'summary.json').write_text(json.dumps({'base':base,'candidate_sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'reports':reports,'historical_worktree_retained':str(historical)},indent=2)+'\n')
print('PASS current and exact #42 scopes with four negative controls; snapshots retained')
