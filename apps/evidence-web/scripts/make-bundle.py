#!/usr/bin/env python3
"""Create an authorized COPY of the pinned repository report, never change it."""
import argparse,hashlib,json,pathlib
p=argparse.ArgumentParser();p.add_argument('destination');a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[3]
b=(root/'docs/evidence/terminal-bench-full-live-97-summary.json').read_bytes()
assert hashlib.sha256(b).hexdigest()=='f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab'
out=pathlib.Path(a.destination);out.mkdir(parents=True,exist_ok=False)
(out/'summary.json').write_bytes(b)
(out/'manifest.json').write_text(json.dumps({'version':1,'title':'Terminal-Bench #97 · 导入报告','summary':'summary.json','files':{'summary.json':hashlib.sha256(b).hexdigest()}},ensure_ascii=False,indent=2)+'\n')
print('Created manifest.json and summary.json (immutable source copy)')
