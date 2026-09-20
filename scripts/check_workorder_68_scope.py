#!/usr/bin/env python3
"""#68 exact write inventory and protection of all other tracked base bytes."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base='05a4a8530f01d28aa38f8975f011d70a9ef096de'
allowed='''typescript/src/providers/kimi/kimi-profile.ts
typescript/src/providers/kimi/kimi-transport.ts
typescript/src/providers/kimi/pan-kimi-model-adapter.ts
typescript/src/providers/kimi/kimi-continuation.ts
typescript/src/providers/kimi/README.md
typescript/src/config/settings.ts
typescript/src/config/first-run.ts
typescript/src/cli.ts
typescript/src/index.ts
typescript/test/kimi-adapter.test.ts
typescript/test/config-first-run.test.ts
typescript/test/README.md
typescript/test/kimi-k3.test.ts
scripts/fixtures/kimi/kimi-k3-wire-v1.json
scripts/fixtures/kimi/kimi-k3-driver.mjs
scripts/verify_kimi_k3_consumer.py
scripts/check_workorder_68_scope.py
scripts/fixtures/kimi/README.md
scripts/README.md
scripts/fixtures/README.md
docs/design/kimi-k3-offline.md
docs/design/README.md
typescript/README.md
docs/design/preview-kimi.md'''.splitlines()
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
assert not git('status','--porcelain').strip(),'committed clean candidate required'
changed=git('diff','--name-only',base,'HEAD').decode().splitlines();assert set(changed)<=set(allowed),set(changed)-set(allowed)
protected=[]
for file in git('ls-tree','-r','--name-only',base).decode().splitlines():
 if file not in allowed:
  assert git('show',base+':'+file)==(root/file).read_bytes(),file
  protected.append(file)
# Keep historical #53 tests; only the prospectively expanded model-selection diagnostic changes.
old=git('show',base+':typescript/test/kimi-adapter.test.ts').decode()
assert (root/'typescript/test/kimi-adapter.test.ts').read_text()==old.replace('/fixed model/','/unsupported kimi-code model/')
for file in ['typescript/test/config-first-run.test.ts','docs/design/preview-kimi.md']:
 old=git('show',base+':'+file).decode();assert (root/file).read_text().startswith(old),file
print(json.dumps(dict(base=base,candidate=git('rev-parse','HEAD').decode().strip(),changed=changed,protected_files=len(protected)),indent=2))
