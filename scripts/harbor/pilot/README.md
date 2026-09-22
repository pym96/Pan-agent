# WO75 Terminal-Bench public pilot (offline preparation)

Criteria1.1; Product evaluation adapter. No live permission is included.
See [design](../../../docs/design/terminal-bench-pilot-75.md) and
[evidence](../../../docs/evidence/terminal-bench-pilot-75.md).

- `acquire.py`, `manifest.json`: pinned official registry, deterministic five-task selection,
  public configuration/file identities. Downloads only four small integration files per task.
- `policy.mjs`, `activation-template.json`: signed controller authorization, immutable ceilings,
  exclusive durable campaign admission and dispatch/tool ledger. Template is unauthorized.
- `cli.mjs`, `session.mjs`: controller-owned installed Pan Session and real Kimi Adapter;
  only the explicit controller callback resolves the future credential.
- `broker.mjs`, `broker.py`: sanitized child environment and bound Harbor capability;
  official verifier follows Agent completion. Reuses WO74 `PanAgent.stop_target` only.
- `package-identity.json`: baseline package and installed-file hashes; pinned Harbor closure.
- `resources.mjs`: five-second operational disk guard; not a filesystem hard quota.
- `report.mjs`: fixed denominator, original reward, explicit unknown usage and errors.
- `test_cli.mjs` (real CLI orchestration with explicit fake dependencies), `test_policy.mjs`, `test_session.mjs`, `test_broker.mjs`, `test_offline.py`: offline controls; injected wire
  responses are test fixtures only. No test creates task images or containers.

```sh
python3 scripts/harbor/pilot/acquire.py --source /private/tmp/wo75-work/source --output /private/tmp/wo75-work/rebuilt.json
node scripts/harbor/pilot/cli.mjs --dry-run
WO75_PAN_ENTRY=/private/tmp/wo75-work/consumer/node_modules/pan-agent/dist/index.js node --test scripts/harbor/pilot/test_policy.mjs scripts/harbor/pilot/test_session.mjs scripts/harbor/pilot/test_broker.mjs
PYTHONDONTWRITEBYTECODE=1 /private/tmp/wo74-work/venv/bin/python -m unittest discover -s scripts/harbor/pilot -p 'test_*.py' -v
```

Criteria1.1 permits only the fixed original `/app/test_outputs.py` for
`break-filter-js-from-html`, with source identities recorded in the manifest.
The SC-only permanent refusal is removed; all activation and runtime gates remain.
Actual image contents and runtime viability are unverified. Run the new entry tests:

```sh
node --test scripts/harbor/pilot/test_cli.mjs
```

- [WO76 official environments](environment-prep/README.md): real source/image preparation and bounded harmless broker probes; no model or formal verifier execution.

- [WO78 recovery design](../../../docs/design/terminal-bench-recovery-78.md) and [evidence](../../../docs/evidence/terminal-bench-recovery-78.md): diagnostics.mjs/diagnostics.py, test_recovery.mjs/test_recovery.py, and unsigned recovery-78-proposal.json; blocked full ready comparison, no live authority.
