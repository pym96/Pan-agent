# Execution and goal control — EC1.1 candidate

WorkOrder: https://github.com/pym96/Pan-agent/issues/150 . This document describes candidate implementation; it is not an accepted project fact.

The model chooses actions. An execution plan determines when those actions may be admitted. A goal adds a separate executable completion criterion. The model's final text is never the goal verdict.

## Interfaces and ownership

`ExecutionController.execute(plan, runner, signal)` owns fixed-rate serial dispatch, the original monotonic deadline, and terminal state. `GoalController` uses that same state machine with executable verification after each completed candidate. `BudgetLedger` is the only reservation algorithm: ordinary NativeKernel creates a per-run ledger; scheduled NativeKernel obtains parent-owned admission through IPC. Existing per-run counters and imported checkpoints retain their meaning. Outer counters do not reset between attempts. Failed admitted exchanges count once; settling a ticket twice does not charge twice. Token usage is metering, not a hard token/currency cap.

The installed CLI's parent keeps immutable plan/verifier data. A separate supervisor owns the generation worker and its registered shell process groups. The worker composes the ordinary GeneralAgentSession, NativeKernel, model adapter and authorized tools. Session context persists between checks; each check has its own archive and, when selected, a fresh SandboxSession volume. There is no new unvalidated tool dispatch path.

For supervised trusted-local shell calls the existing bash implementation delegates process placement to the supervisor. Its child shell waits at an input gate. The supervisor records the exact freshly spawned group through the controller's durable event sink; only acknowledgement releases the command. Ordinary single-run bash uses its existing implementation without that delegation.

## Timing and completion

Plain loop runs immediately, then at eligible `start + N × interval` ticks. It skips ticks missed by long checks; it never overlaps or catches up. It rechecks monotonic time after sleeping because OS timers can wake fractionally early. Successful individual checks do not end plain loop mode.

Goal completion immediately starts verification; a valid FAIL supplies feedback to a new bounded attempt. UNKNOWN stops for review, not an unbounded retry. Periodic worker reconciliation can recover a missed completion notification; matching attempt identity and a pending result slot prevent duplicate notifications from dispatching another attempt. Heartbeats are observations only.

A deadline is exclusive. Reservation, tool effect and success-transition checks reject `now >= deadline`. The last permitted model/tool operation may finish and verify PASS before the deadline despite a zero remaining balance. Only a denied further admission produces budget exhaustion. A verifier does not consume generation counts. The independent supervisor uses an absolute OS monotonic deadline, so blocking the worker's JS event loop cannot extend generation authority. Soft stop has 2 seconds before force stop, with a 5-second confirmation bound. No confirmation means `stop_unconfirmed`, not clean completion. Verification is finite (1–25 seconds); preservation has a separate 30-second helper watchdog. Late verification evidence is retained but cannot grant success.

## Verifier trust and candidates

The operator supplies a versioned JSON verifier containing an inline command and timeout, outside the writable workspace. Its immutable content hash is part of the plan. Authoring the verifier remains trusted operator work: a command that executes untrusted candidate code as its own oracle is not an independent criterion.

After worker completion, the local path snapshots bounded regular files (64 MiB, 1000 files, no links/special files) and verifies their digest before/after running the command. This detects changed candidates but is not protection against malicious same-user processes. Docker uses the accepted Sandbox stopped-volume path, exports an attributable candidate, and executes the pinned command in a separate readonly verifier container using the fixed image. Frozen command text is not taken from worker output. Export integrity is checked before cleanup.

Exit 0 is PASS, exit 1 is a valid FAIL, other exits/infrastructure exceptions are UNKNOWN. Evidence binds execution archive identity, attempt, candidate digest, criteria version, verifier identity and observed outputs. No language-model reviewer grants runtime success.

## Persistence and recovery

Execution events use the existing hash-chained RunArchiveWriter, under the exclusively created execution state directory. Task archives use a separate per-execution namespace. This separation is required because `RunArchiveStore.open` recovers unsealed archives: a worker must not open and recover the parent's live archive.

Existing execution state cannot be reused. `execution inspect` reads metadata and terminal evidence, or reports interrupted/active uncertainty when no terminal record exists. It does not replay commands, dispatch another worker, or reset counters. Unsettled reservations and sandbox intents remain available for manual reconciliation. The supervisor observes controller disconnect and stops the owned generation groups. A Docker preparation interrupted before its ready message is recovered from its dedicated state-root intents; uncertain daemon operations retain evidence rather than fabricated cleanup.

## Limits

Single-controller local execution, one serial generation worker. No scheduler daemon, recursive agents, distributed coordination, automatic schedule resume, public service, new DB, GPU, or real-model quality claim. A custom embedded TaskRunner must itself enforce termination/preservation; the state-machine interface cannot preempt arbitrary in-process code. Trusted-local host authority is not an adversarial sandbox, including deliberate `setsid` escape. Process supervision and sampled test RSS limits are not a kernel-enforced memory isolation claim. High-risk authority/lifecycle changes require independent and supplemental review before acceptance.

Tests and demos: [execution150](../../tests/execution150/README.md). Source: [execution module](../../typescript/src/execution/README.md).
