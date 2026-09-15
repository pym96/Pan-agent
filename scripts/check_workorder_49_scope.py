#!/usr/bin/env python3
"""#49 committed-scope audit; retain protected baseline hashes and exact candidate identity."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='5f497e57c096a10b3dba886f352711d78832b1d3'
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
allowed=set('''docs/adr/README.md docs/adr/0018-operation-scoped-authorization.md docs/design/README.md scripts/README.md scripts/fixtures/README.md scripts/fixtures/authorization-driver.mjs scripts/demo_authorization.mjs scripts/verify_authorization_pty.py scripts/wo49-consumer-guard.mjs scripts/check_workorder_49_scope.py scripts/verify_activity_pty.py scripts/verify_scroll_pty.py scripts/verify_scrollbar_pty.py typescript/README.md typescript/src/cli.ts typescript/src/config/settings.ts typescript/src/index.ts typescript/src/runtime/README.md typescript/src/runtime/session.ts typescript/src/runtime/authorization.ts typescript/src/tools/README.md typescript/src/tools/pan-trusted-local-tools.ts typescript/src/tools/authorized-file.ts typescript/src/tui/compact-tui.ts typescript/src/tui/daily-workspace.ts typescript/src/tui/tui.ts typescript/test/README.md typescript/test/authorization.test.ts typescript/test/compact-tui.test.ts typescript/test/conformance.test.ts typescript/test/general-agent.test.ts typescript/test/memory-lanes.test.ts typescript/test/pan-deepseek-adapter.test.ts typescript/test/pan-faux-tools.test.ts'''.split())
changed=set(git('diff','--name-only',base,'HEAD').decode().splitlines());assert changed<=allowed,changed-allowed
assert not git('diff','HEAD','--name-only').strip(),'uncommitted tracked bytes'
protected={}
for path in git('ls-tree','-r','--name-only',base).decode().splitlines():
 if path in allowed:continue
 old=git('show',base+':'+path);assert old==git('show','HEAD:'+path),path;protected[path]=hashlib.sha256(old).hexdigest()
subprocess.run(['git','diff','--check',base,'HEAD'],cwd=root,check=True)
print(json.dumps({'base':base,'candidate':git('rev-parse','HEAD').decode().strip(),'criteria':'1.1','changed':sorted(changed),'protected':protected,'status':'PASS'},indent=2))
