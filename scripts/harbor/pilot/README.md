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

## WO89 protocol diagnostics

[test_protocol_89.mjs](test_protocol_89.mjs) exercises the installed Adapter and
Session with missing/null/empty/nonempty/invalid reasoning, split events, partial
tools and continuation. `PAN_TEST_ENTRY` must point at the new matching consumer.
Completed/failed exchange rows now include fixed-shape `structure`; no wire body
or private reasoning is logged. See [design](../../../docs/design/protocol-verifier-89.md)
and [evidence](../../../docs/evidence/protocol-verifier-89.md). No live authority
or verifier-environment change is introduced.

## WO91 signed task selection

`selection.mjs` validates signed `binding.taskIds` as a nonempty, unique ordered
subset of the frozen manifest. `binding.images` must contain exactly those IDs
with resolved `sha256:<64 hex>` identities. Full signature verification still
precedes ledger/broker/credential/provider effects. No `--task` override exists.
The CLI executes and reports only this signed subset; full five-task bindings
retain their execution order, five rows and denominator5.

After independent acceptance, Master signs a **fresh run** with
`binding.taskIds: ["break-filter-js-from-html"]` and
`binding.images: {"break-filter-js-from-html": "sha256:<resolved approved image ID>"}`.
This example is not an activation. Keep the full frozen manifest hash, accepted
runner SHA, existing package hash, model, budget and validity; sign the complete
payload with the trusted authority. Use the unchanged CLI flags with that new
activation and a fresh output directory. Never reuse #90's run/ledger/signature.
Denominator1 and one row describe an independent new attempt, not a backfill or
combined five-task score. Raw rewards alone do not prove valid task test execution.

[WO91 evidence](../../../docs/evidence/single-task-selection-91.md).
`test_cli.mjs` and `test_selection_91.mjs` exercise actual CLI gates with synthetic
I/O and the identity-matching accepted Product consumer. No live call, Docker
startup, Product package change or Human trial belongs to this workorder.

## WO94 optional reasoning and private continuation

The new Product package admits otherwise valid K3 tools when reasoning is absent
or null, omitting that field on subsequent history; observed empty/nonempty
strings still round-trip exactly. Non-string values and invalid tools reject.
[Decision and sources](../../../docs/design/kimi-reasoning-continuation-94.md),
[evidence](../../../docs/evidence/kimi-reasoning-continuation-94.md).
`test_protocol_94.mjs` runs complete two-tool-round Session/Adapter controls through
explicit `PAN_TEST_ENTRY`; `test_protocol_89.mjs` now uses the prospective optional
field policy while preserving diagnostic categories and unknown usage.

Next live contract must use a newly accepted runner SHA and package identity with
`/private/tmp/wo94-kimi/consumer/node_modules/pan-agent/dist/index.js`, a new signed
run and fresh output/ledger. This README grants no activation; no old run restart.

## WO96 frozen full89 workflow

[Design](../../../docs/design/terminal-bench-full-campaign.md) and
[evidence](../../../docs/evidence/terminal-bench-full-campaign-support.md).
Legacy `cli.mjs` and frozen `manifest.json`/`package-identity.json` are unchanged.
The new `full-cli.mjs` supports init, prepare, status, run, cancel and recover.
These commands describe a future independently accepted/activated live runner;
#96 itself performs only the offline demonstration below.

Use a clean accepted checkout, the frozen installed Product entry and a fresh
internal campaign path. `TASK_ROOT` must contain unchanged upstream task folders
at source69671fbaac6d67a7ef0dfec016cc38a64ef7a77c (including official verifier files,
which only the trusted verifier consumes). Do not show oracle/solution files to
the model. Provision only the next task(s)' original cached images under the next
live WorkOrder's approved strategy. This CLI never automatically pulls/builds or
prunes images. It resolves their content IDs and records incompatibilities.

```sh
CAMPAIGN=/private/tmp/approved-full-run/campaign
ENTRY=/private/tmp/wo94-kimi/consumer/node_modules/pan-agent/dist/index.js
TASK_ROOT=/private/tmp/approved-full-run/tasks
node scripts/harbor/pilot/full-cli.mjs init --campaign "$CAMPAIGN" --entry "$ENTRY"
node scripts/harbor/pilot/full-cli.mjs prepare --campaign "$CAMPAIGN" --task adaptive-rejection-sampler --task-root "$TASK_ROOT"
node scripts/harbor/pilot/full-cli.mjs status --campaign "$CAMPAIGN" --task adaptive-rejection-sampler
```

Status includes89 rows and `proposedBinding`. Master signs that complete binding
with a new UUID, `authorized:true`, `version:2`, `validity:run-bound`,
`notBefore`, `expiresAt:null` and Human authorization ID using the existing trusted
authority; the CLI has no signing command. The new binding includes
`manifestHash`, `panHash`, `runnerSha`, `model`, `budget`, `mode:live`, `taskIds`,
`images` and `full:{campaignId,root,checkpoint,segmentIndex,preparations}`. Keep
exactly what status emitted; editing preparation after signing invalidates it.
Credentials are read only by the authorized Node controller; the broker receives
no Provider credential.

```sh
node scripts/harbor/pilot/full-cli.mjs run --campaign "$CAMPAIGN" --activation /path/to/new-master-activation.json --entry "$ENTRY" --task-root "$TASK_ROOT"
# In another terminal: read progress or request cancellation.
node scripts/harbor/pilot/full-cli.mjs status --campaign "$CAMPAIGN"
node scripts/harbor/pilot/full-cli.mjs cancel --campaign "$CAMPAIGN"
# After controller exit/crash, reconcile owned leftovers; unknown stops block resume.
node scripts/harbor/pilot/full-cli.mjs recover --campaign "$CAMPAIGN"
```

Select only status rows with state `not_started`, prepare their next small subset,
obtain a **new** status binding and Master signature/run, and invoke run again on
the same campaign. Already reserved failure/unknown/success rows are never eligible.
A normal task failure continues within the signed subset; a global block pauses.
No preloading of89 images is needed. Raw score may be0 while validScore is null;
CTRF evidence is currently required for automatic valid-score classification.
`status` reconstructs counters/known and unknown usage from segment ledger originals,
not summary caches. Preserve the entire campaign and global run ledgers for review.

### Reproducible offline demonstration and checks

This creates synthetic authority, ledgers and fake I/O **only under a new directory**;
never use a live campaign or credential home. The helper injects fake capabilities
into the same public CLI parser; there is no production `--fake` override. It runs
89 fake tasks in two segments, interrupts before one result commit and proves89
unique starts plus retained unknown. Cancellation/double-start/ticket fencing and
other negative scenarios are in the process-level test suite.

```sh
node scripts/harbor/pilot/full-demo.mjs /private/tmp/wo96-full/new-offline-demo
WO96_TEST_ROOT=/private/tmp/wo96-full/new-offline-tests \
PAN_TEST_ENTRY=/private/tmp/wo94-kimi/consumer/node_modules/pan-agent/dist/index.js \
TMPDIR=/private/tmp/wo96-full/tmp \
node --test scripts/harbor/pilot/test_full_96.mjs
```

Rebuild the population offline from the retained registry, tree and89 task.toml
files (or allow public metadata downloads for absent configs):

```sh
python3 scripts/harbor/pilot/full-acquire.py --source /private/tmp/wo96-full --output /private/tmp/wo96-full/rebuilt-manifest.json
cmp scripts/harbor/pilot/full-manifest.json /private/tmp/wo96-full/rebuilt-manifest.json
```

Required registry source is Harbor revision
`f9deaca7f44ab0b91f1dd445d79629e4d97a0716/registry.json`; tree metadata is the GitHub
Git tree API at the frozen task source commit, not a moving branch. Missing source
metadata must be obtained at those exact revisions and checked, never substituted.
