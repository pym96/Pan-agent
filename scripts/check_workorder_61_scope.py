#!/usr/bin/env python3
"""Compare the committed #61 candidate to the accepted base; keep raw protected-file hashes."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base='e5954e8a1c1fb6278b8ac6a640530e014079fba3'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
allowed={'typescript/src/tui/daily-workspace.ts','typescript/src/tui/tool-activity.ts','typescript/test/tool-activity.test.ts','typescript/test/README.md','docs/design/tool-activity-digest.md','docs/design/README.md','scripts/fixtures/activity-driver.mjs','scripts/fixtures/README.md','scripts/verify_activity_pty.py','scripts/check_workorder_61_scope.py','scripts/README.md'}
changed=set(git('diff','--name-only',base,'HEAD').decode().splitlines())
assert changed<=allowed,changed-allowed
assert not git('diff','HEAD','--name-only').strip(),'uncommitted tracked bytes'
protected={}
for file in git('ls-tree','-r','--name-only',base).decode().splitlines():
 if file in allowed:continue
 old=git('show',base+':'+file);current=git('show','HEAD:'+file)
 assert old==current,file
 protected[file]=hashlib.sha256(current).hexdigest()
subprocess.run(['git','diff','--check',base,'HEAD'],cwd=root,check=True)
print(json.dumps({'base':base,'candidate':git('rev-parse','HEAD').decode().strip(),'changed':sorted(changed),'protected':protected,'status':'PASS'},indent=2))
