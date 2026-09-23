# WO85 transport diagnosis, recovery and metering

Criteria1.0; candidate implementation, awaiting independent review. Authority:
[#85 formal contract](https://github.com/pym96/Pan-agent/issues/85#issuecomment-5795049179).
Base `915a62e6a88d895b58fd08343cd9992f5a11560a`. The #47 entry in
`docs/agents/current-assignment.md` is historical, not this assignment.

## Explicit authority

Legacy activations retain their exact finite budget schema, expiry window and
exclusive run ledger. New signed payloads must specify `version: 2`,
`validity: "run-bound"`, `expiresAt: null`, a valid `notBefore`, and budget
`mode: "metered"` with all three count ceilings explicitly `null`. Unknown modes,
missing/null bounded limits, huge numeric substitutes in metered mode, tampering,
and the old schema combined with the new validity format are rejected.
The signature still binds run ID, Human authorization ID, runner SHA, package,
manifest, model, exact tasks and images. A run-bound permit has no administrative
expiry; it admits one exclusive ledger/run, not permission to restart a used run.
Master must issue a new run and candidate-bound signature for subsequent work.
The new template is deliberately unsigned and unauthorized.

`GeneralAgentSession` receives explicit `{mode: "metered", maxModelTurns: null,
maxToolSteps: null}`. NativeKernel skips only these count comparisons. Missing
mode retains existing defaults; bounded mode cannot accept null. No giant integer
represents the new mode. Existing per-request byte/token/120-second bounds,
official Agent/verifier deadlines, container isolation and disk safeguards remain.
There is no additional total campaign/overnight timer. User cancellation and task
deadlines work during sends, body reads and recovery waits.

## Evidence and recovery

Each outer Session exchange is one model round. Retries are separate exchange
attempts. Durable ledger events distinguish `exchange_started`, `dispatch_reserved`,
`send_entered`, `http_observed`, failure/completion, usage and `retry_scheduled`.
`send_entered` is fsynced immediately before calling Fetch, after credential and
local checks. It proves local transport entry, **not server receipt or billing**.
A crash between that marker and Fetch remains indeterminate; reservation alone
never proves transport entry. Unknown usage remains null, including partial streams.
`counts.retries` counts scheduled waits, not necessarily a subsequent send.
Tools retain their separate pre-effect durable reservation.

Diagnostics contain finite reason codes, stage, request reservation/send-entry
booleans, observed HTTP status, response byte count and exchange elapsed milliseconds.
They exclude request/error bodies, credentials and private reasoning. Local size
refusal does not get relabeled as a known network error. Unrecognized exceptions
retain `unknown` and are not retried. HTTP status is retained independently of a
broken error body. Only exact `insufficient_quota`/`quota_exceeded` machine codes
are recognized as confirmed quota exhaustion; no message substring guess is made.
401/403 stop immediately without waiting for the error body. Authentication and
confirmed quota failures stop the whole campaign before the next task.

Kimi Adapter diagnostics are opt-in; default provider behavior is unchanged.
Evaluation enables diagnosis in both modes, but automatic recovery only in the
explicit signed metered mode. Recognized network errors, request/read timeout,
missing SSE terminator, 429 without confirmed exhaustion and 5xx can retry.
Backoff starts at 250ms, doubles to 10s; numeric Retry-After may increase a wait
up to 60s. These are delay bounds, not retry-count/total-time limits. Original
Agent timer remains the sole solving deadline and interrupts all waits.
Local oversized requests, response-size rejection and malformed protocol do not
retry unchanged. A failed exchange never reaches NativeKernel as an assembled
assistant/tool message. K3 continuation is admitted only after complete validated
assembly. Previously executed tools remain in Session context and are not replayed.

## Validation and limits

[Evidence](../evidence/transport-metering-85.md) records the installed consumer and
source mapping. Offline tests use real Session/Kimi Adapter with scripted Fetch
and broker doubles, including a signed 202-send/201-tool sequence and virtual
clock failure/deadline/cancellation sequences. They are not benchmark scores.
No real Provider, official task/verifier or container is needed for this repair.
The #83 independent verifier/handoff lifecycle is retained.

The historical #84 failures cannot be reconstructed from generic labels alone.
No assertion of improved task success is made. Independent Regulator review and
C-METER-02's different-model-family review (or one SHA-bound Human material review,
`H-METER-BOUNDARY pass/problem`) remain outstanding. This document grants no live
execution permission and changes no project/resume fact register.
