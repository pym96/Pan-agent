# WO81 / Criteria1.0 — blocked Builder candidate

Base `d290c95aefd8bef33770ea5ab4dec46b63309a38`; branch `workorder/81-candidate`.
This is an incomplete candidate, not acceptance or an operationally validated runner.
Full candidate SHA is bound in the external Handoff after commit.

## Goal, change and authority

[WorkOrder #81](https://github.com/pym96/Pan-agent/issues/81) authorizes one
command-timeout recovery slice. Human approved the scope and finite control budget;
Master published the contract; the Builder designed and implemented this candidate
and the fixtures. This does not attribute Agent implementation to Human.

The broker owns a container-bound process-group command, a start gate, bounded
stdout/stderr retention (65,536 bytes per stream, explicit byte/truncation metadata),
PID/start-time inspection, group termination and stop confirmation. An anchor waits
until identity capture before admitting the shell command. Normal completion also
cleans the managed group. Unconfirmed termination stops the bound environment.
Session forwards a confirmed timeout as a correlated ToolResult, permitting the
existing installed GeneralAgentSession and Kimi Adapter to choose another command.
No replacement Agent loop, background-job API, Provider/core edit or task hint.

The local command limit remains positive and at most 30 seconds. The broker's
bounded control/cleanup operations and controller watchdog are not extra solving
time; global task/authorization cancellation remains active. Official task/verifier
configuration, scoring and frozen manifests remain unchanged. The process-group
approach is **not adversarial containment**: observed unmanaged processes refuse
recovery, but detached/hidden transient descendants and task tampering are not
proven contained. This new boundary needs independent high-risk review.

## Executed evidence and failures

Raw root: `/Volumes/WD_BLACK/pan-agent/wo81-timeout-recovery-20260923/`.
Active originals: `/private/tmp/wo81-work/`; cumulative budget is
`controls/container-budget.jsonl`, never reset. See the adjacent machine summary.

- Final offline Node suite: 27 passed; Python suite: 11 passed. They exercise the
  installed real Adapter/Session with scripted responses, recovery, cancellation,
  official Agent timeout, expiry/completion races, unknown stop, unchanged 40/200/80
  budgets, command validation, synthetic credential redaction and settlement.
- Initial Node run: 24/25 passed. A 20 ms deadline fixture sometimes expired before
  tool admission, invalidating its assertion of exactly one tool. It was changed
  to 300 ms for that test only; no official deadline changed. This timer test is
  scheduling-dependent; the completion/cancellation race has explicit ordering.
- Five initial actual-container scenarios all failed before commands: the new
  fixture accidentally generated different response IDs for two SSE frames.
  The real Adapter rejected them as protocol errors. This was a test-construction
  defect, not evidence of a model or timeout-policy failure. Logs are preserved.
- The normal scenario's one allowed repair used a stable SSE response ID. The
  command request (`printf NORMAL`, timeout 2 s) reached the broker, but returned
  `stop_unconfirmed`, no captured PID identity or output. Bound-environment shutdown
  was confirmed; Session dispatched no further request and no verifier ran.
  The retained container diff shows a command directory and pid file, but no go
  file. The exact reason identity capture failed is **unknown**: this candidate
  collapses internal stop errors into an unavailable-confirmation result. No
  diagnostic rerun was performed to resolve it.
- Normal completion has consumed its initial and repair attempts. The whole matrix
  was stopped; nonzero, local child-timeout/continuation, cancellation and uncertainty
  controls have no successful actual-container result. Do not label these passed.
- Six newly owned containers are retained stopped (`Running=false`, `Pid=0`). Each
  used the recorded accepted cached nginx image digest, network none, 2 CPU / 4 GiB,
  no mounts/privilege/capability additions, pulls or builds. Cumulative container
  control wall time: 12.974218667019159 s of 1,800 s. Time remaining does not reset
  the exhausted per-scenario attempt cap. Resource samples stay within storage caps.
- Zero live model/Provider/balance calls and zero official scoring. Synthetic
  verifier returns no reward; scripted token counts are fixture data, not model use.

## SC-TREC-81-01 / concrete blocker

C-TREC-01 and C-TREC-03 cannot be demonstrated within the remaining authorization:
normal command recovery did not pass its final permitted attempt, and real process
identity/managed-child termination/continued execution are not established.
C-TREC-02 has offline and actual fallback evidence but no complete actual matrix.
C-TREC-04's successful targeted tests do not discharge the missing controls.

Master must adjudicate a prospective repair contract/attempt allowance if work is
continued. Suggested next engineering step is bounded identity-stage diagnostics
and offline validation of the scripted transport **before** any newly authorized
container attempt. No allowance is self-granted here; no more containers or live
campaigns are started. Regulator may inspect the failed candidate, not infer success
from the Handoff or reuse these results as acceptance.

## Preservation and limits

Only pilot execution/broker, targeted tests/navigation and these evidence files
change. Historical #77–#79 reports, raw records, consumed ledgers, authority,
activation, package, official inputs, core/Provider, facts and resumes are unchanged.
No main modification or push. Root SOURCE_OF_TRUTH navigation is Master-owned and
outside this WorkOrder's write scope; request its blocked-checkpoint update through
this Handoff. The existing root whitelist BLOCK (`.DS_Store` and the resume PDF)
remains. Human-feedback and resume structural checks pass; no unrelated historical
full regression was run to bypass that BLOCK.

No demonstrated benchmark improvement, cost saving or arbitrary-process containment.
The important failed decision was spending finite container attempts before checking
SSE fixture consistency offline. Preserve that ordering error instead of presenting
only the final offline green tests. The second failure remains an unresolved
implementation/control-environment issue, not a diagnosed infrastructure cause.
