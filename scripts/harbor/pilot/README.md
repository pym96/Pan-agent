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

- WO81 process-group fixtures are historical: their implementation and raw results remain
  at `5552200379c3f4d45288b6942966d3ac755e3314` and the original Evidence archive.
  Their runtime entry now refuses execution; pure ledger admission regression remains.

## WO83 phase handoff controls (Criteria1.1)

See [design](../../../docs/design/verifier-handoff-83.md) and
[evidence](../../../docs/evidence/verifier-handoff-83.md). Agent completion/time or
explicit call-budget exhaustion closes Agent admission and settles the host client's
wait before one independently timed verifier. Task services/processes are retained;
there is no initial PID gate or normal-return process-group kill. The 30-second tool
limit bounds waiting, not task-process lifetime. Global cancellation stops the container.

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

## WO85 diagnosis and explicit metered mode (Criteria1.0)

See [design](../../../docs/design/transport-metering-85.md) and
[evidence](../../../docs/evidence/transport-metering-85.md).
`activation-metered-template.json` is a new unsigned, unauthorized version-2
run-bound example. The old template and signed bounded mode do not upgrade.
`test_85.mjs` covers diagnosis, signed metering through the actual installed Session,
partial-stream recovery, permanent failures, and cancellation/deadline backoff.

All Session/CLI/handoff tests now require `PAN_TEST_ENTRY` (legacy
`WO75_PAN_ENTRY` is also supported) to identify the newly installed candidate;
there is no fallback to the historical installed package. Example:

```sh
PAN_TEST_ENTRY=/path/to/new-consumer/node_modules/pan-agent/dist/index.js \
  node --test scripts/harbor/pilot/test_85.mjs scripts/harbor/pilot/test_handoff.mjs
```

No live activation is included. The current contract, not the historical #47
assignment map, controls WO85.

## WO87 response streams (Criteria1.0)

The unsigned metered template now explicitly sets `responseBytes: null`. Only this
signed metered value disables cumulative response-byte rejection. Existing numeric
permits retain their original cap; missing values never upgrade a permit. Byte and
usage accounting, request limits, official deadlines and cancellation remain.
See [design](../../../docs/design/response-stream-87.md) and
[evidence](../../../docs/evidence/response-stream-87.md).

Offline installed-path control (synthetic credentials, fetch and environment only):

```sh
TMPDIR=/private/tmp/wo87-artifacts/tmp \
PAN_TEST_ENTRY=/private/tmp/wo87-artifacts/consumer/node_modules/pan-agent/dist/index.js \
node --test scripts/harbor/pilot/test_response_stream_87.mjs scripts/harbor/pilot/test_cli.mjs
```

Provision the consumer from the unchanged accepted Product package and verify all
`package-identity.json` installed hashes first. This work changes the external
evaluation runner, not Product package bytes; never substitute a fake parser.
