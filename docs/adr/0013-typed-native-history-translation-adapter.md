# ADR-0013: Put provider protocol behind a typed full-history Translation Adapter

- Status: Accepted
- Date: 2026-08-25
- Decision owner: Human accepted on 2026-08-25 after the independent accepted Regulator Verdict on WorkOrder #4 dated 2026-08-25
- Depends on: ADR-0011 and ADR-0012

## Context

The completed Phase 0 path stores assistant actions as JSON text and converts tool observations into user text. Protocol-reliability then observed provider/action-transfer failures, but its transport comparison did not replace the historical transcript with complete provider-native assistant call/result history. Its global 2,048-token request setting also became a known interpretation confound.

A later Behavioral Eval must not attribute Harness-created translation friction to model or Agent behavior. Provider syntax also cannot spread into `AgentLoop`, Trace, evaluators, or a future UI.

## Decision

Add one provider-neutral typed canonical conversation and one `TranslationAdapter` Interface with two operations:

1. encode a complete canonical conversation plus typed tools into one provider request;
2. decode an exact retained provider response into either one validated canonical action/final message and next history, or one attributable failure.

Implement DeepSeek Chat Completions as the first Adapter. Preserve tool-call correlation IDs across assistant calls and paired tool results. Keep optional reasoning and provider metadata structurally separate from executable action arguments.

Retain two diagnostic switches without selecting a production conclusion:

- legacy JSON-text history versus provider-native call/result history;
- required diagnostic `thought` in wire arguments versus command-only arguments.

Require every translated call to select a `ModelProfile`. Its `max_output_tokens` is either a positive integer or an explicit provider-controlled state and is part of identity. The translated path has no global 2,048 fallback. Historical experiment locks remain immutable.

Reject invalid history and length-terminated, malformed, schema-invalid, multi-call, or correlation-invalid responses before tool execution. Retain structured failure data but leave any maximum-one repair to a separate governed policy.

## Rejected alternatives

### Keep JSON text as canonical history

Rejected because action identity, executable arguments, reasoning, and observation role remain embedded in prose. A prompt change cannot make this persistent provider-neutral state.

### Put DeepSeek roles and `tool_calls` into AgentLoop

Rejected because every future model/provider, Trace reader, evaluator, and TUI would inherit the provider wire format. That is a shallow Adapter and a high-leverage leak.

### Let each consumer translate its own view

Rejected because correlation and failure semantics would drift across runtime, evaluation, Trace, and UI paths. The Adapter Interface is the single test surface.

### Silently repair history by fabricating missing tool results

Rejected for this gate. Pi and Codex contain normalization mechanisms that insert synthetic missing outputs for production continuity. In a diagnostic prefactor, fabrication would hide the exact correlation failure being measured. Invalid history fails before transport.

### Raise a global output constant

Rejected because the retained sensitivity Evidence found continued length/DSML behavior at larger ceilings and because model output, Context compression, and Run budgets are different controls. The selected profile owns the requested per-call ceiling without implying that a particular number is optimal.

## Consequences

- Provider wire details gain high Locality inside one Adapter implementation.
- The canonical Interface becomes reusable by a later evented loop, retained Trace, evaluator, and UI without exposing DeepSeek JSON.
- Complete native history and command-only actions become independently testable causal factors.
- Correlation failures become visible instead of being repaired implicitly.
- The old Phase 0 Adapter remains only for historical experiment reproduction; migration of live Agent execution waits for a separately authorized loop integration.
- Offline fixture conformance does not establish live provider compatibility, reliability improvement, task quality, or an accepted project fact.

## Acceptance record

An independent Regulator inspected the source and retained fixtures, added negative probes, reran focused and repository tests plus the outer acceptance gate, and issued an accepted Verdict on WorkOrder #4 on 2026-08-25. The Human accepted this ADR on 2026-08-25. This acceptance does not promote a Verified Project Fact.

## Detailed design

- [`../design/translation-adapter.md`](../design/translation-adapter.md)
- [`../../workspace_agent_harness/translation.py`](../../workspace_agent_harness/translation.py)
- [`../../workspace_agent_harness/deepseek_translation.py`](../../workspace_agent_harness/deepseek_translation.py)
- [`../../tests/test_translation_adapter.py`](../../tests/test_translation_adapter.py)
