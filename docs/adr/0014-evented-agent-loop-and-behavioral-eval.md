# ADR-0014: Make the Run Event Log authoritative and keep TUI outside loop control

- Status: Accepted
- Date: 2026-08-25
- Decision owner: Human accepted on 2026-08-25 after the independent accepted design-freeze Regulator Verdict on WorkOrder #3 dated 2026-08-25
- Depends on: ADR-0009, ADR-0011, ADR-0012, and the independently accepted offline candidate scope of WorkOrder #4 / accepted ADR-0013

## Context

The verified minimal `AgentLoop` returns explicit terminal results and writes a validated Trace, but it still sends a text transcript through `ModelAdapter.respond(...)`, parses the action inside the loop, and writes Trace directly. The offline WorkOrder #4 candidate introduces typed full-history translation, but its Adapter still owns response validation and next-history creation because evented Runtime integration was deliberately deferred.

A future TUI, Behavioral Eval, replay reader, and durable Trace must observe the same Agent behavior. If any consumer owns loop transitions, builds its own provider transcript, or writes a competing chronology, evaluation will measure a different product and failures will become unattributable. Long interactive Runs also need a shared Context policy; arbitrary transcript truncation would corrupt retained history and make replay dishonest.

## Decision

Adopt an event-sourced AgentLoop design with these seams:

1. The append-only Run Event Log is the only durable execution chronology and has exactly one terminal settlement.
2. Canonical History is a deterministic projection of admitted semantic events. Model Context is a separate, bounded, content-addressed projection for one model exchange. Neither Trace nor a transcript is authoritative.
3. AgentLoop depends on one deep `ModelGateway.exchange(PreparedModelTurn)` Interface. Provider encoding, credentials, transport, streaming assembly, decoding, continuation state, and Exchange Evidence remain behind the gateway.
4. Runtime admission occurs after gateway settlement. Partial, malformed, unsupported, multi-action-when-disallowed, and correlation-invalid candidates cannot execute tools or enter Canonical History.
5. Trace, replay, Behavioral Eval, and TUI are consumers of committed events. They cannot mutate loop state, block persistence, form Provider payloads, execute tools, or participate in terminal settlement.
6. TUI v0 can start and cancel a Run and render compact, expanded, and trace projections subject to visibility policy. Removing it cannot change execution, scoring, Trace, or Provider payloads.
7. One adaptive Context policy applies to headless and interactive Runs. It compacts proactively on predicted next-call fit, preserves typed semantic state and atomic call/result pairs, forbids arbitrary truncation, and permits at most one compact-and-retry after Provider Context overflow.
8. `Agent Loop Behavioral Eval v0` freezes 12 deterministic local cases and one primary comparison: `observation-feedback-v0` versus `act-once-v0`, with only Loop Policy identity changing. Runtime status and exact-oracle evaluator verdict remain separate.

The exact event schema, state machine, compaction preservation rules, cases, metrics, denominators, stop rules, Pi mechanism map, deletion tests, and forbidden claims live in [`../design/agent-loop-behavioral-eval-v0.md`](../design/agent-loop-behavioral-eval-v0.md).

## Why these Modules are deep

`ModelGateway.exchange(...)` hides a complete Provider exchange behind one operation instead of exposing encoder, transport, stream, and decoder lifecycle to AgentLoop. This produces Locality for Provider changes and makes retained scripted and live Provider Adapters exercise the same Interface.

The Run Event Log earns its seam because durable JSONL and in-memory conformance Adapters vary while every projection uses the same ordered facts. Model Context earns a separate seam because exact-history and compaction-capable projectors vary while AgentLoop consumes one `PreparedModelTurn` result.

TUI is deliberately not a lifecycle Module in the execution path. Its deletion test leaves complexity in the event projections rather than redistributing model, tool, budget, or terminal logic into presentation code.

## Rejected alternatives

### Let the TUI own the interactive loop

Rejected because headless evaluation and TUI execution would have different control flow. Rendering latency, deletion, or failure could then alter Provider calls, tool execution, and terminal results.

### Keep direct Trace writes as execution truth

Rejected because Trace, evaluator, and TUI would either compete to intercept transitions or reconstruct missing state differently. Trace becomes one durable projection of the authoritative Run Event Log.

### Expose Translation Adapter lifecycle to AgentLoop

Rejected because request encoding, transport, streaming, decoding, and Provider continuation would create a shallow Interface and leak Provider syntax into loop policy. Translation remains an internal gateway seam.

### Treat the Provider transcript as Canonical History

Rejected because Provider roles, response IDs, opaque reasoning, and tool-call encodings are not portable Agent semantics. Translation is bidirectional but not guaranteed reversible.

### Build a separate strict evaluation Runtime

Rejected because it would test a different Context, recovery, and event policy from the future TUI product. Behavioral Eval must call the same public AgentLoop seam.

### Truncate oldest messages when Context is full

Rejected because byte/message/oldest-first deletion can orphan tool results, discard unresolved work, and make replay diverge from what the model saw. Semantic compaction is explicit, versioned, evidenced, and fail-closed.

### Retry Context overflow until a call succeeds

Rejected because unbounded recovery hides Provider/estimator failure and silently multiplies Tokens and cost. Exactly one recovery exchange is allowed and separately retained.

### Score reasoning prose

Rejected because visible writing style is neither the task oracle nor reliable access to hidden computation. v0 grades actions, observations, terminal disposition, and final deterministic state only.

## Consequences

- Provider details gain Locality behind one gateway Interface.
- A single retained chronology can reproduce Trace, evaluator, and TUI views without side effects.
- Canonical History remains complete even when Model Context is compacted.
- Context recovery and all extra exchanges remain attributable in usage and cost.
- Consumers become replaceable, but cannot be used as control-flow hooks.
- The existing `AgentLoop`, direct Trace writer, and WorkOrder #4 translation candidate require later integration work; this ADR implements none of it.
- v0 intentionally omits steering, parallel tools, checkpoint/resume, session trees, subagents, memory, and broad Provider support.
- The 12-case suite is a local learning instrument, not a public benchmark or a general Agent-quality score.

## Acceptance record

An independent Regulator inspected the pinned Pi locators, event ordering and causal invariants, admission-negative cases, compaction preservation/failure rules, exact 12-case manifest, causal denominators, consumer/gateway/projector deletion tests, and downstream scope. It also reran repository/path checks and issued an accepted design-freeze Verdict on WorkOrder #3 on 2026-08-25. The Human accepted this ADR on 2026-08-25.

This acceptance does not authorize implementation, promote a project fact, or publish an external claim.
