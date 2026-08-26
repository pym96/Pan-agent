# Proactive semantic compaction candidate

- Status: accepted at the deterministic offline boundary by the 2026-08-26 Regulator Verdict ([issue #7 comment 5424205548](https://github.com/pym96/workspace-agent-harness/issues/7#issuecomment-5424205548))
- Date: 2026-08-26
- Baseline: accepted WorkOrder #6 implementation at `c2c9e33`
- Parent contract: [`agent-loop-behavioral-eval-v0.md`](agent-loop-behavioral-eval-v0.md) and accepted [ADR-0014](../adr/0014-evented-agent-loop-and-behavioral-eval.md)

## One vertical slice

The evented `AgentLoop` now delegates each next-turn projection to one deep
`ModelContextProjector.project(ContextProjectionRequest)` operation. The default
`ExactContextProjector` preserves the WorkOrder #6 short-run behavior. The
`SemanticContextProjector` is a second Adapter for a known Context window: it
predicts next-call fit, externalizes large tool bodies, builds a typed sourced
summary, admits only whole recent semantic groups, validates the result, and
returns either one bounded `ModelContext` or an attributable failure.

`PreparedModelTurn` carries that disposable `ModelContext`. A gateway must read
the complete object, including `summary`; its `conversation` property is only the
bounded canonical-message portion retained for the WorkOrder #6 compatibility
path. No Provider encoding or Context-overflow retry is implemented here.

## Three distinct records

| Record | Owner and identity | What happens during compaction |
|---|---|---|
| Run Event Log | append-only `run-event/v1` JSONL | remains the complete durable chronology, including exact accepted observations, projection attempts, compaction decisions, and terminal settlement |
| Canonical History | `CanonicalConversation.identity` | remains complete in AgentLoop memory and advances only from admitted events; it is never replaced or shortened |
| Model Context | `model-context/v1` content identity | is rebuilt for exactly one exchange from the active request, typed summary, artifact references, and the newest complete call/result groups that fit |

Every semantic-summary field is source-attributed. The active request is copied
verbatim; the open `complete-active-request` commitment cites `run.started`;
facts, decisions, and failures cite the history events that produced them. A
summary also binds the full source-History identity, current system-policy and
tool-set identities, and the prior summary identity.

Trusted deterministic tools may return `SemanticToolObservation`, which pairs
their exact text body with typed facts. A plain text observation remains
supported: small omitted text is retained verbatim in the summary, while a large
body is represented by its exact artifact reference and preview. If the active
request or the minimum valid semantic representation cannot fit, the Run fails
closed; there is no byte-, character-, message-count-, or oldest-first fallback.

## Fit decision and artifact order

For a known window, compaction starts only when:

```text
estimated_input_tokens
+ requested_output_room
+ provider_protocol_and_tool_overhead
+ max(1024, ceil(0.05 * verified_context_window))
> verified_context_window
```

The event retains both estimator identities, sources, confidence, and all five
values. The offline demo uses the explicitly low-confidence
`canonical-json-utf8-bytes-div4/v1` estimator and a separately identified
deterministic protocol/tool overhead. That overhead estimate binds the exact
selected tool-set identity; a mismatch fails before exchange. These values demonstrate policy wiring;
they are not a measured Provider tokenizer or a recommended production budget.

A UTF-8 tool body exceeding 32,768 bytes is written exactly to the selected
`ArtifactStore` before `context.compaction_started`. The model-visible result
contains its stable SHA-256, relative locator, media type, byte count,
`utf8-head-tail-2048-bytes/v1` preview policy, and valid UTF-8 head/tail preview.
The preview is not the retained truth. Both file-backed and in-memory stores
implement the same content-addressed recovery contract.

After reserving the active request, summary, identities, artifact references,
output room, overhead, and safety margin, the projector walks history groups
newest-first. It either admits a complete assistant-call/tool-result pair or
stops; it never admits an orphan. Older groups are included only through the
validated sourced summary.

## Events, terminal projection, and failure

One successful proactive decision is retained as:

```text
context.projection_started
[artifact.externalized]
context.compaction_started(attempt=proactive)
context.compaction_completed
context.projected
model.exchange_started
```

Every compaction event has one `compaction_id`. Completion records the fit
trigger, source-History and result-Context identities, preservation decisions,
summary/prior-summary identities, whole atomic pairs, and artifact references.
The ordinary terminal view prints one concise completion line.
`--explain-compaction` expands `WHY_COMPACT`, `PRESERVED`, and `IDENTITIES` from
that same retained completion event; replay invokes no gateway or tool.

An invalid or non-fitting projection instead retains
`context.compaction_failed` and settles exactly once with
`context_compaction_error` before `model.exchange_started`. Canonical History and
all earlier events stay readable.

## Deterministic manual proof

From the repository root, choose a new exclusive log path:

```bash
python3 -m workspace_agent_harness.tui \
  --log .runs/workorder-7/manual.jsonl \
  --semantic-compaction-demo \
  --explain-compaction
```

Enter `Record all three stages, then finish.` The local gateway performs three
tool turns and a final turn. The locked demo reserves 6,900 output Tokens inside
a 10,000-Token known window so the last projection both summarizes older groups
and preserves the newest complete call/result pair. It makes zero Provider calls.

Replay the same evidence without execution:

```bash
python3 -m workspace_agent_harness.tui \
  --replay .runs/workorder-7/manual.jsonl \
  --explain-compaction
```

The candidate Evidence index is
[`../evidence/proactive-semantic-compaction-candidate-2026-08-26.md`](../evidence/proactive-semantic-compaction-candidate-2026-08-26.md).

## Explicit boundary

This is proactive prediction for a known window only. It does not catch a
Provider Context-overflow response, retry an exchange, implement repeated
repair, add the 12-case Behavioral Eval, add full compact/expanded/trace
navigation, call a live Provider, or add memory/checkpoint/resume. It creates no
Wiki, Verified Project Fact, factual-ledger, resume, benchmark, or disclosure
claim. Those remain outside #7 and #8–#11 are untouched.
