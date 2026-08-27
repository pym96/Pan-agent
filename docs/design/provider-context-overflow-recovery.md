# Provider Context overflow recovery candidate

- Status: accepted at the deterministic offline boundary by the 2026-08-27 Regulator Verdict ([issue #8 comment 5434767046](https://github.com/pym96/workspace-agent-harness/issues/8#issuecomment-5434767046))
- Date: 2026-08-27
- Baseline: independently accepted WorkOrder #7 implementation at `ec68c81`
- WorkOrder: GitHub #8
- Parent contract: [`agent-loop-behavioral-eval-v0.md`](agent-loop-behavioral-eval-v0.md) and accepted [ADR-0014](../adr/0014-evented-agent-loop-and-behavioral-eval.md)

## One bounded recovery seam

`ModelGateway.exchange(PreparedModelTurn, cancel_signal)` now settles with either
`ExchangeSettled` or `ExchangeFailed`. The failure carries a typed
`ProviderFailureKind`, provider code and message, plus one `ExchangeEvidence`
record for response identity, Token usage, duration, and cost. Only the explicit
`context_overflow` kind enters recovery. Authentication, rate limit, transport,
protocol, unknown, Python exception, cancellation, and malformed-candidate paths
retain their existing distinct settlement behavior.

The `AgentLoop` owns the complete recovery policy:

```text
project proactive Context
exchange attempt 1
  -> settled: normal admission
  -> classified Context overflow:
       retain failed exchange
       project overflow-recovery Context through SemanticContextProjector
       exchange attempt 2 exactly once
         -> settled: normal admission, tool execution, and terminal behavior
         -> Context overflow: context_overflow terminal
         -> other failure: distinct model_error terminal
```

`PreparedModelTurn.exchange_attempt` is `1` or `2`; a retry must cite the exact
failed `exchange_id`. There is no recursive loop and no general retry middleware.
Both attempts increment the ordinary model-call budget. If the budget or a
semantic projector is unavailable, the retained Run settles explicitly as
`context_overflow` without inventing a recovery.

## Semantic preservation, never truncation

The retry calls the same #7 `SemanticContextProjector.project(...)` Interface
with a typed `overflow-recovery` attempt and the retained provider-failure event
ID. It preserves the active request, unresolved commitments, source-attributed
facts/decisions/failures, exact artifact references, full source-History
identity, and atomic call/result groups. It never removes bytes, characters,
messages, or oldest items from Canonical History.

For a verified Context window, #7's fit policy remains unchanged. A fallback or
unknown window does not trigger proactive compaction and does not block the
first exchange. Its actual Token value (if any), provenance, source, confidence,
and `used_for_proactive_fit=false` decision are retained in `context.projected`.
After a real overflow with no verified fit ceiling, the recovery projection uses
the minimum validated semantic representation rather than treating the fallback
as verified. An `ExactContextProjector` cannot impersonate that semantic path.

## Durable attempt records

The original failure is appended before any recovery event. Each
`model.exchange_failed` or `model.exchange_settled` event separately records:

- exchange attempt and retry linkage;
- complete prepared-turn and Model Context identities where applicable;
- response identity;
- input/output/total Token fields;
- provider-reported duration in milliseconds;
- cost in integer micro-USD;
- failure kind/code/message or settled candidate/stop reason.

The successful chronology adds `context.overflow_retry_succeeded` before normal
candidate admission. A second overflow adds
`context.overflow_retry_exhausted` before one
`run.terminal(status=context_overflow)`. The compact TUI view labels proactive
versus overflow compaction and retry success versus exhaustion. The expanded
view explains the provider-failure trigger and window provenance from the same
events. Offline replay constructs no gateway or tool.

## Credential-free manual proof

Successful retry, tool execution, and completion:

```bash
python3 -m workspace_agent_harness.tui \
  --log .runs/workorder-8/provider-overflow-recovery-v1.jsonl \
  --overflow-recovery-demo \
  --explain-compaction
```

One retry followed by explicit exhaustion:

```bash
python3 -m workspace_agent_harness.tui \
  --log .runs/workorder-8/provider-overflow-exhausted-v1.jsonl \
  --overflow-exhaustion-demo \
  --explain-compaction
```

Read either retained log without model or tool execution:

```bash
python3 -m workspace_agent_harness.tui \
  --replay .runs/workorder-8/provider-overflow-recovery-v1.jsonl \
  --explain-compaction
```

Both demo gateways are deterministic local Provider Adapters. They read no
credential, open no network connection, and make no paid call. Candidate
Evidence is indexed at
[`../evidence/provider-context-overflow-recovery-candidate-2026-08-27.md`](../evidence/provider-context-overflow-recovery-candidate-2026-08-27.md).

## Explicit boundary

This candidate adds only one classified Provider Context-overflow recovery. It
does not add LangGraph, checkpoint/resume, a reusable retry middleware, live
Provider transport, the #9 Behavioral Eval, #10 navigation, #11 or later work,
Wiki or Verified Project Fact changes, resume evidence, PDF output, benchmark
results, or production reliability claims.
