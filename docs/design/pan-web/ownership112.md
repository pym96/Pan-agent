# #112 — local concurrent ownership (Product candidate)

Contract: [Criteria1.0](https://github.com/pym96/Pan-agent/issues/112#issuecomment-6093541635).
Base: `ebbe2f6e2a03f57ad632b1bd8514340b321c20ee`.
This is a Builder design and evidence candidate, not an accepted implementation fact.

## Authority and serialization

PostgreSQL remains authoritative. Each independent Go Worker creates a random immutable
owner identity and holds a dedicated heartbeat connection. A one-second heartbeat can
renew only an unrevoked, unexpired ten-second lease. The backend PID **and backend start
time**, plus PostgreSQL server start time, bind the connection. Admission checks both
lease and live connection identity; reconnecting a pooled query connection does not
recreate the lost heartbeat connection. Any heartbeat error ends that Worker process.

Claim transactions serialize briefly on an advisory transaction lock. They preserve
conversation order/context, reject stop-unknown tasks globally, and count every started,
not-yet-cleaned task against two slots. A claim atomically increments the task generation
and binds its attempt and owner. Pan sessions still execute one task each. Idle Workers
are not work slots, and lease expiration never frees a slot. The two configured containers
are each 1 CPU / 1 GiB; test sentinels also count toward the 4 CPU / 8 GiB total.

Every model exchange and tool execution in the Web executor crosses an IPC admission
barrier. The child supplies its job-bound task/attempt/owner/generation and a strictly
increasing ordinal; it verifies the matching ACK. Go locks the task row, verifies current
owner/attempt/generation/state/lease/connection, inserts one admission, and commits.
**That transaction commit is the admission ordering point.** ACK is sent afterwards.
A repeated or skipped ordinal, foreign identity, expired/revoked authority, cancellation,
or unavailable database fails closed. The wrapper sits immediately before the actual
adapter exchange / Docker tool implementation; no Native kernel rewrite was required.
There is no default Product behavior change outside this opt-in Web execution path.

Revocation/control, checkpoint/receipt changes, public observations, and final publication
also lock that task row. A successful preflight in an earlier transaction provides no
right: the fault fixture can stop between preflight and request. If revocation commits
first, the action cannot be admitted. If admission commits first, its recorded action
may still execute after revocation; the system **does not promise rollback**. There is
no claim that a second independent check eliminates the race.

Node creation and PID registration are also inside the locked authority transaction;
job stdin is sent only after commit. Thus a paused old Worker cannot create an untracked
new executor after a coordinator has revoked it and confirmed stop. Execution-private
stdout/checkpoint/archive files remain under the old attempt; rejected late output is
retained there rather than becoming public authoritative state.

## Stop and recovery

A separate coordinator loop revokes only expired/disconnected owners. Starting Worker2
does not touch a healthy Worker1. It serializes stop recovery, takes the task row lock,
checks the exact recorded Node PID/argv, confirms Node exit, removes only the task-labelled
container and confirms absence, then seals an interrupted archive and records stop.
Cancellation uses the same managed stop path. Neither silence nor timeout is stop proof.

The old Worker may only stop its still-current attempt; it cannot clean up or update a
newer attempt. A revoked old Worker leaves stop to the coordinator. Stop transactions
hold the task lock through confirmation, so explicit resume cannot race ahead. Once
stopped, unresolved work no longer occupies slots, and other conversations can proceed.
There is no automatic model/tool replay or automatic transfer of execution authority.
Explicit #111 recovery must still prove a pending tool complete (reuse) or not started
(execute once); a dispatched operation without a sufficient receipt stays unresolved.
A fresh claimed attempt receives a strictly newer task generation.

Cancellation, replacement and resume retain the existing conversation/task lock order
and request identity ledgers. Cancellation removes checkpoint eligibility; late completion
cannot overwrite it. API clients cannot choose owner/generation fields. Private checkpoint
payloads remain owner-gated server state and do not enter public trace/UI/CSV.

## Migration and operation

Migrations 007/008 are additive. Old tasks/artifacts/source/usage remain unchanged;
legacy rows retain generation zero, with no invented attempts or admissions. The migration
ledger checks applied SQL bytes. Old unfenced Workers must be stopped before migration.
New Workers hold the shared form of the legacy Worker advisory lock; legacy Workers and
pending ownership migrations require its exclusive form, preventing mixed executors.

Use a dedicated `web112` runtime and database; do not point this build at an old evidence
runtime. `local-dev.py --issue 112` and `worker-control.py --slot 1|2` manage only the new
owned namespace. Keep runtime credentials private. See the evidence README for exact
reproduction commands and package identities.

## Limits and measurements

Trusted processes, trusted shared PostgreSQL, one local host and one Docker daemon are
assumed. This is not untrusted-worker enforcement, cross-host partition handling, general
exactly-once semantics, or Kimi recovery support. A blocked stop can intentionally stall
all new claims. DB-backed ownership does not undo an already admitted side effect.

Capacity uses 4 conversations × 3 ordered tasks with the same Faux scripts, input, binary,
package and per-container quota for one and two Workers. The manifest is frozen before
submission. Python and Go use the same POSIX CLOCK_MONOTONIC for submit/admission/observation
records. Admission time is sampled within the locked transaction immediately before its
insert/commit (the small commit latency is not separately measured); terminal time is the
harness observation. Docker's own StartedAt/FinishedAt on the same VM provide actual tool
execution intervals separately. Fault records are excluded from throughput. A second
Worker permits twice the analysis CPU/memory total; any speed difference cannot be
attributed solely to scheduling and says nothing about real model throughput.
