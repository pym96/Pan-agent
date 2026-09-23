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

- [WO78 Criteria1.1 evidence](../../../docs/evidence/terminal-bench-recovery-78.md): actual five-task ready/stop/owned-network release completed after authorized one-old-network cleanup; no live authority.

- WO81 candidate: `broker.py` owns a bounded command process group; `session.mjs`
  continues only after confirmed local timeout. See the [blocked control report](../../../docs/evidence/command-timeout-recovery-81.md).
  `test_command_control.mjs` / `test_command_control.py` are explicit opt-in,
  synthetic-response container fixtures, not official scoring or default offline tests.
  Builder container attempts are exhausted for normal completion; do not replay
  them to obtain a pass. `test_session.mjs` and `test_offline.py` cover offline
  continuation, cancellation, expiry, uncertainty and budget/credential boundaries.

- WO81 offline repair checkpoint: `WO81_OFFLINE_ROOT=/private/tmp/wo81-work/offline-repair/fixtures node --test scripts/harbor/pilot/test_command_control.mjs`
  exercises the **same** scripted SSE generator and five scenario assertions through
  installed Adapter/Session, substituting only a fake environment. It does not
  spawn a broker, run a storage guard or touch the actual-container budget.
  `broker.py` now retains finite stage/reason diagnostics; this is not proof that
  the unresolved actual identity failure is fixed. No new actual attempt authorized.

- Criteria1.2: `WO81_NORMAL3_AUTH=H-TREC81-NORMAL3-20260923-001` selects only
  the approved third normal diagnostic. Admission uses the original cumulative
  ledger under an exclusive file lock, refuses consumed/wrong authorization,
  non-normal scenarios, unfinished attempts and exhausted time. Default remains
  two attempts. This is not a reusable extra-attempt switch.

- Criteria1.3 `WO81_SCOPE_AUTH=H-TREC81-SCOPE-20260923-001` supersedes the
  normal3-only/count restriction for this scope. It runs the six normal/nonzero/
  timeout/cancel/deadline/uncertain scenarios under the original locked cumulative
  1,800-second ledger. No arbitrary targets or time reset. Use a fresh output
  directory via `WO81_CONTROL_ROOT`, never a new ledger. See current WO81 evidence.
  The command client uses `setsid --wait` and null stdin; bounded control timing
  observations distinguish launch/read/exit, and command-result polling respects
  the original local deadline. Existing task/authorization cancellation stays active.

## WO83 phase handoff controls (Criteria1.0)

See [design](../../../docs/design/verifier-handoff-83.md) and
[evidence](../../../docs/evidence/verifier-handoff-83.md). Agent completion/time or
explicit call-budget exhaustion closes Agent admission, confirms broker quiescence,
then permits one independently timed verifier. Unknown processes and global stops
remain hard stops. Only pinned pre-Agent service identities are preserved.

Offline: `node --test scripts/harbor/pilot/test_*.mjs` and the existing frozen Python
unittest discovery. Container cases skip unless explicitly enabled. Under the #83
scope authorization, from a clean committed candidate:

```sh
WO83_CONTROL_AUTH=H-GRADE83-SCOPE-20260923-001 WO83_ROLE=builder node --test scripts/harbor/pilot/test_handoff_container.mjs
```

`WO83_ROLE=regulator` selects the independent Regulator's fixed ledger; it does not
grant a role or authorize Builder to consume it. `WO83_SCENARIO` may select a named
case for an evidence-driven diagnosis. The fixed append-only ledger is
`/private/tmp/wo83-work/builder-container-budget.jsonl` (Regulator:
`/private/tmp/wo83-regulator/regulator-container-budget.jsonl`), each capped at
1800 cumulative seconds. No fixed per-case count and no ledger reset. Unfinished
attempts reject admission until reconciled; necessary cleanup must still occur.
Every actual Docker operation, including image inspection and cleanup, is inside
its reserved interval. Never use the old WO81 fixture/budget for this workorder.

The fixture creates only uniquely labelled WO83 containers from the authorized
cached image; no network, official tasks/verifier, real model, or live signature.
Its FIFO service and delayed writer are synthetic controls, not benchmark scores.
