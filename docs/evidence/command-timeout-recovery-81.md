# WO81 / Criteria1.3 — recovery candidate, independent review pending

Authority: [scope and cumulative-budget amendment](https://github.com/pym96/Pan-agent/issues/81#issuecomment-5790393381).
The six-scenario development container matrix now passes. Final clean candidate
matrix and exact remote SHA are recorded in external `criteria13/Handoff.md`.
This does not grant acceptance or demonstrate benchmark improvement. All earlier
blocked checkpoints below remain historical evidence, not the current status.

## Historical initial Criteria1.0 blocked candidate

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

## Offline repair checkpoint — 2026-09-23

Authority: [Master offline-only disposition](https://github.com/pym96/Pan-agent/issues/81#issuecomment-5790032442).
The independent rejected Verdict for `7d951f1cc495f20020c2032297ead47e93d1fdac`
remains unchanged (SHA256 `e121ad40e77143e2b9f1dbc884223dcb34918194f427f67ee3813e884c7ce70e`).
This additive repair is a diagnostic checkpoint, not a completed Handoff or a
request to repeat Regulator review of the same missing actual evidence.

The existing fixed SSE generator now runs in an explicit offline mode with a fake
bound environment. All five original scenarios reached their exact intended first
tool call through the installed real Adapter/Session: normal/nonzero each one tool,
timeout two distinct tools with the timeout observation in the second request,
cancel/uncertain one tool followed by stopping and no verifier. The wire fixture
and scenario assertions are shared with the existing opt-in container test, avoiding
a second independently maintained fake model script. No Docker subprocess is
spawned by this mode; fake credentials and usage remain synthetic.

Command diagnostics now retain at most 16 fixed stage names, one allowlisted
failure reason and a validated numeric received PID. Stages distinguish baseline
snapshot, launch, PID receipt, process snapshot, identity validation, go release,
settlement, termination snapshot/signal/confirmation and output settlement.
Missing process, group mismatch, malformed PID, unavailable receipt, bounded
operation timeout and unknown internal failures are distinguished without raw
exception text, environment values or command text in diagnostic fields.
Baseline/launch errors also produce explicit unconfirmed results rather than
escaping before diagnostics. Pure snapshot parsing and injected process/control
seams cover successful settlement and failures at each stage without host commands.

Observed retained evidence: repaired normal RPC had identity=null, empty output,
stop_unconfirmed; the saved filesystem diff had pid but no go file. Source inspection
shows several different failures previously collapsed to that same result. These
facts **do not identify which one happened**. No real identity-capture cause has
been fixed or established. Parser validation/diagnostic retention are supported
improvements, not a claim that the original runtime failure is solved.

Minimum proposed next actual probe, **not authorized here**: one newly owned normal
fixture using the same cached image/digest and 2-second `printf NORMAL` command,
with the new stage diagnostics, at most one container / 2 CPU / 4 GiB, network none,
60-second outer control cap, explicit stop receipt and unchanged cumulative ledger.
This would be normal attempt 3, requiring prospective Human/Master allowance. Stop
on failure and inspect the diagnostic; do not launch the remaining full matrix.
It tests launch→identity→go→settlement only, not child termination or full recovery.

Current checks and preserved hashes are in external `offline-repair/` evidence;
checkpoint binds the new remote SHA. Prior raw archive and container ledger are
hash-checked unchanged. No new container create/start/restart/exec, real model,
credential read, official scoring, download, main modification or facts promotion.

Offline checks: 27 distinct existing Node checks pass across the regression and
CLI rerun, plus 5 shared scenario fixtures and 13 Python checks. The first regression
was 26/27: CLI `mkdtemp` saw an uncreated configured temporary root (ENOENT).
Precreating that directory and rerunning the three CLI checks passed; original
log retained. No production code or timeout was changed for that harness failure.

## Criteria1.2 fixture correction — pre-probe

[Master 1.2](https://github.com/pym96/Pan-agent/issues/81#issuecomment-5790249975)
authorizes correcting the two-attempt guard before executing the already approved
normal3 diagnostic. The old bound fixture and the 1.1 instruction were incompatible;
Master records that preflight omission. Builder changes only fixture admission,
launcher plumbing, offline tests and notes; broker/session algorithms are unchanged.
The exact authorization selects only normal, requires exactly two old normal starts
in the original ledger, refuses previous consumption, and appends under an exclusive
file lock. Default cap2, total1800 seconds and unfinished-attempt refusal remain.
Offline checks: 14 Python tests and 5 shared fake-environment scenarios pass.
Actual results, runner identity and consumption are recorded separately after the
single authorized attempt; no outcome is asserted here.


## Criteria1.2 single normal3 result

Actual executed runner: `2443f87b3bf3f79581a8998572fab9539b375126` (clean, pushed before admission).
Authorization H-TREC81-NORMAL3-20260923-001 was consumed exactly once. The existing
ledger gained one start/end pair; the full prior byte prefix matches its preflight
hash. No further scenario, repair attempt or model call occurred.

The sole `printf NORMAL` ToolCall was admitted with timeout2. Its result diagnostic
is `stage=pid_receipt`, `reason=operation_timeout`, `received_pid=null`; stages reached
baseline_snapshot → launch → pid_receipt. No process_snapshot, identity_validation
or go_release was reached. By source, PID receipt calls the bounded control helper,
whose subprocess communication limit is2seconds. This establishes a timeout during
that control operation for this attempt; it does not establish why Docker/control
communication took that long, nor retrospectively prove the earlier failure cause.
The tool's solving command completion is not established: output empty, exit null,
termination identity null. Do not describe tool admission as successful shell work.

Environment fallback succeeded: container `fb36f1d8ffa345004afe512f9fe8a3c9d2de58f8cca0160e27211dd575fbf27a`
recorded Running=false/Pid=0, stopReason=command_stop_unconfirmed. Agent cancelled,
only one scripted dispatch, verifier absent. Normal control assertion failed.
Additional wall time 6.0645276669820305seconds including shutdown; total
19.03874633400119/1800seconds. Normal3/3 consumed; other scenarios still paused at1/2.

Raw evidence under external `normal3/`; original active logs under
`/private/tmp/wo81-work/normal3` and `normal3-preparation`. Prior archives, containers
and ledger prefix remain. This is a failed diagnostic checkpoint, not completed
acceptance Handoff. The next investigation should distinguish the PID-read control
subprocess delay from identity parsing, under a separate scoped instruction. No
new run, timeout increase or algorithm change is authorized or made by this result.


## Criteria1.3 implementation and evidence

Current fixture scope authorization keeps the original append-only locked ledger,
refuses unfinished activity or exhausted 1,800-second time, and admits only the
six named harmless scenarios. Prior normal3 consumption is retained. Actual work
uses one accepted cached nginx image per sequential container, network none,
2CPU/4GiB, no mounts or elevated capabilities. No images downloaded or built.

The command Docker client now has null stdin and `setsid --wait`: the launcher
stays associated with its child instead of treating a forked session leader as
finished work. Controller operations retain at most32 numeric timing observations
(startup, first byte, completion, bytes, exit and finite outcome); arbitrary control
stderr is suppressed. Control wait5seconds is distinct from the model-visible
command maximum30seconds. Shell release still requires PID/start identity. Local
command-result polling is additionally bounded by its remaining deadline, so the
longer control wait cannot silently extend solving via a blocked result read.
Global task/authorization cancellation and environment-stop fallback remain active.

The lifecycle classifier distinguishes baseline process groups and the pinned
launcher parent from the owned command group. It kills only the latter, confirms
no executing members, and conservatively refuses newly observed foreign groups.
This prevents treating normal children of the independent control process or the
waiting launcher itself as proof of command escape. PID/start-time mismatch and
unknown stop still stop the entire bound environment. It is **not a security
boundary against adversarial reparenting, joining pre-existing groups or transient
unobserved escape**. Those containment limits remain explicit for independent
high-risk review; no broader isolation claim is made.

Development sequence, all failures retained with source diffs:
1. Timing probe with null control stdin and5second internal wait: PID read returned
   no bytes after2.0624seconds and the command client had already exited; no go.
   This differs from the earlier collapsed timeout, but does not identify historical
   latency cause or prove a general daemon/emulation problem.
2. Adding waiting setsid and null command-client stdin reached PID identity,
   go-release and output NORMAL. Foreign-process classification then refused recovery.
3. Accounting for baseline groups and pinned launcher parent allowed normal completion.
4. Complete six-scenario development matrix passed; a later fixture enhancement
   adds a separate `/proc` observation before returning timeout to the Session.
The changes were not individually controlled causal experiments. Attribute the
observed recovery to the tested combination, not an invented single-cause result.

Offline:33 Node checks (including six shared scenario scripts) and16 Python checks
pass. Python coverage includes time/history accounting, unknown targets/groups,
malformed/missing identities, stage failures, installed Session cancellation/expiry
races, old command validation, budget and credential controls. One development
Python assertion expected a settlement timeout to be a global error; it was updated
to inject a non-timeout control failure, because local settlement timeout is now
handled as the local deadline. That failed log remains.

Actual matrix: normal and ordinary exit7 reach a synthetic verifier with no reward;
local timeout preserves BEFORE output, confirms target/managed child stopped,
then sends that ToolResult to the real installed Session. A distinct second command
waits5.1seconds (past the child's planned5second late write), checks absence of the
late file and survival of the independent control process, and emits CONTINUED.
A separate fixture observation reads the child's own recorded PID and every
managed `/proc` stat **before** returning the timeout result; remaining zombies are
non-executing and distinguished from survivors. Cancellation, official task deadline
and injected unavailable confirmation permit no next solving dispatch or verifier.
All final owned containers have explicit stop receipts; no old resource is deleted.

Test wire responses and their usage values are synthetic; there are zero real
model/Provider/credential/balance calls and zero official scoring. Raw evidence,
source diffs, cumulative time and clean final matrix are retained externally under
`wo81-timeout-recovery-20260923/criteria13/`. Final Handoff includes all hashes and
per-criterion mapping. Independent Regulator and subsequent Human/different-family
review of the new cancellation boundary remain required. Main remains untouched.


### Final clean matrix receipt

Clean executed source/runner SHA `21c69565729359f2dbc0b459771be6b8cad9f6c9`:
6/6 actual scenarios,33/33 Node and16/16 Python passed, no skips. The timeout
fixture independently confirmed its recorded child PID89 and all four managed
PIDs absent before returning the ToolResult, while the separate control survived.
It then completed the distinct delayed command and synthetic verifier (reward=null).
Cancellation/deadline/uncertain each dispatched once, stopped the environment,
and did not verify. All22 lifetime containers are confirmed stopped and retained.
Total actual control time73.52249308198225/1800seconds; original normal3 ledger
prefix and old archives are hash-verified unchanged. Minimum sampled free storage
85,596,082,176bytes; maximum accounted incremental growth4,415,488bytes.
The final reporting commit changes only report/summary; Handoff binds its SHA and
checks execution/test source identity against the clean tested runner. No additional
container replay is justified by these documentation-only result updates.
