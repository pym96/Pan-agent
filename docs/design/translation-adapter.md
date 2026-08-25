# Typed Native-History Translation Adapter

Status: WorkOrder #4's offline candidate passed its independent Regulator Gate and ADR-0013 was Human-accepted on 2026-08-25. This document is a design contract, not a Verified Project Fact or a provider result.

## Problem

The Phase 0 `DeepSeekJsonAdapter` gave `AgentLoop` a text-only action document and replayed every tool result as a synthetic user message such as `Observation from bash`. `protocol-reliability-v1` then compared that legacy carrier with Strict Function Calling only at the current response. The provider never received a complete native history containing the prior assistant tool call and its paired tool result.

That leaves three facts coupled:

1. the canonical Agent state was an untyped text transcript;
2. the provider transport owned a different tool-call protocol;
3. the request ceiling came from an experiment/global `2,048` default rather than the selected model configuration.

Before a later Behavioral Eval interprets Agent behavior, the Harness needs one deep Translation Adapter Module that absorbs those protocol details behind a small typed Interface.

## Selected seam

The provider-neutral Interface lives in [`../../workspace_agent_harness/translation.py`](../../workspace_agent_harness/translation.py):

```text
CanonicalConversation + ActionTool[]
            |
            | TranslationAdapter.encode_request(...)
            v
ProviderRequest.payload -> injected TranslationTransport -> RetainedProviderResponse
            |
            | TranslationAdapter.decode_response(...)
            v
AssistantToolCall | AssistantFinalMessage | attributable TranslationFailure
            |
            v
next CanonicalConversation
```

The DeepSeek implementation lives in [`../../workspace_agent_harness/deepseek_translation.py`](../../workspace_agent_harness/deepseek_translation.py). The deterministic four-cell enumeration lives in [`../../workspace_agent_harness/translation_diagnostics.py`](../../workspace_agent_harness/translation_diagnostics.py).

The Interface has two operations because the provider exchange is the true external dependency: encode the full typed history, then decode an exact retained response. An injected transport is the only second implementation needed by the current slice; the contract tests use fixture transport and make no network call. `AgentLoop`, an evaluator, Trace consumer, or future TUI consumes canonical values and failure codes; it does not parse `choices`, `tool_calls`, `function.arguments`, or provider roles.

## Canonical conversation

The canonical state is a tuple of four typed messages:

- `UserMessage(content)`;
- `AssistantToolCall(CanonicalToolCall(call_id, tool_name, arguments), reasoning?, provider_metadata?)`;
- `ToolResultMessage(call_id, tool_name, content, is_error, provider_metadata?)`;
- `AssistantFinalMessage(content, reasoning?, provider_metadata?)`.

Executable arguments never contain reasoning. Correlation is explicit: an assistant call creates one `call_id`; the next tool result must use the same ID and name. Missing, duplicate, reused, mismatched, or orphan IDs reject the request before transport. The current action contract permits exactly one action per assistant turn.

Native-history encoding produces:

```json
{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"bash","arguments":"{\"command\":\"pwd\"}"}}]}
{"role":"tool","tool_call_id":"call_1","name":"bash","content":"/testbed\n"}
```

It never serializes a canonical action as assistant JSON text and never turns a tool result into a synthetic user observation. The legacy diagnostic carrier remains selectable and intentionally reproduces those old forms so a later causal matrix can isolate history carrier without changing canonical state.

## Independently selectable diagnostic factors

The implementation keeps, but does not choose between, two axes:

| Factor | Diagnostic values | Adapter-owned difference |
|---|---|---|
| history carrier | `legacy-json-text`, `native-tool-calls` | encoding of prior assistant action and paired result |
| reasoning carrier | `thought-in-arguments`, `command-only` | system instruction, tool schema, prior-history wire representation, response validation |

For `thought-in-arguments`, the Adapter temporarily injects canonical `reasoning` into the diagnostic wire schema and extracts it again when decoding. For `command-only`, the schema contains only the executable argument and a returned `thought` is rejected. Thus visible reasoning cannot leak back into `CanonicalToolCall.arguments`.

Run the enumeration without a provider call:

```bash
PYTHONPATH=. python3 scripts/dry_run_translation_matrix.py
```

The output contains exactly four cells. All four bind the same model, endpoint, canonical Context identity, tool-set identity, temperature, thinking setting, repetition plan, and `ModelProfile` identity. `live_calls` is `0` and `causal_result` is `null`; the dry-run is not evidence for either factor.

## ModelProfile owns the output request

`ModelProfile.max_output_tokens` is a required discriminated value:

- a positive integer emits exactly that value as DeepSeek `max_tokens`;
- `ProviderControlledOutput(reason)` omits `max_tokens` and records that explicit state in profile identity;
- `None`, a non-positive number, and an unknown state are invalid.

There is no `2,048` default on this translated path. The Phase 0 and protocol-reliability locks retain their historical `2,048` values and the old `DeepSeekJsonAdapter` remains a reproducibility path for those completed experiments; WorkOrder #4 does not rewrite their identity or results.

A per-response model ceiling answers only “how much output may this model call request?” It does not:

- compress or summarize input Context;
- bound total Run Tokens or model-call count;
- limit bash execution time, steps, or wall time;
- repair malformed output;
- make a larger ceiling a quality improvement.

Context compression and Run budgets therefore remain separate future Modules and decisions.

## Provider responsibilities and fail-closed boundary

| Owner | Responsibilities | Explicitly does not own |
|---|---|---|
| canonical model | typed conversation, executable arguments, correlation IDs, optional reasoning/metadata | DeepSeek roles, `choices`, JSON argument strings |
| DeepSeek Adapter | message/tool schema, legacy/native carrier, `max_tokens` mapping, response envelope parsing, validation, canonicalization | HTTP credentials, retries, tool execution, task grading |
| injected transport | send the encoded payload and retain exact status/body | action parsing, repair policy |
| Agent loop/tool layer | decide when to call and execute only a validated canonical action | provider wire translation |

Response failures are classified at `response-envelope`, `response-action`, or `correlation`. HTTP/decode failures, `finish_reason=length`, malformed argument JSON, unexpected fields, missing/duplicate/reused IDs, and multiple calls all return no canonical action and no next history. A failure retains response SHA-256, finish reason when present, stage, code, details, and a repair-eligibility flag. Repair is deliberately absent: a separately governed controller may use this classification for at most one additional call and must account for it.

## Retained fixture and Evidence boundary

Secret-free fixtures are indexed by [`../../tests/fixtures/translation/manifest.json`](../../tests/fixtures/translation/manifest.json). The positive fixtures cover command-only decoding and complete native multi-turn replay. Negative fixtures cover malformed JSON, missing/duplicate IDs, orphan results, distinct multi-call output, schema drift, and a minimized DSML-in-arguments runaway.

The DSML fixture is structurally reduced from retained attempt `prv1-c23-ddce1f540e19-strict-max16384-r1`, whose ignored raw response hash is `sha256:c99c37f5537a652a915c891efecfffd29c6a9679a1ab8efd581a027a638a97ad`. It retains the provider envelope, `finish_reason=length`, 16,384 completion-token usage, malformed argument shape, and representative markers while removing task text and repeated payload. The source remains Working Agent candidate Evidence from a dated five-Context sensitivity experiment; neither the fixture nor these tests restate it as a Verified Project Fact.

Offline conformance proves only that the local Adapter maps and rejects the declared shapes deterministically. It does not show that DeepSeek accepts the payload, that native history improves reliability, that command-only improves behavior, or that any task is solved.

## Pinned mechanism references

All references were inspected read-only at their local pinned commits:

- Pi `a1f955e9f47fd3379b44f4aace65ab916c80519a`: `packages/ai/src/types.ts` keeps assistant tool calls and `ToolResultMessage.toolCallId` typed; `packages/ai/src/api/openai-completions.ts` converts them to native assistant `tool_calls` and tool messages. We adopt typed call/result correlation. We reject Pi's `transform-messages.ts` behavior that can synthesize missing results because this diagnostic seam must expose corrupt history rather than normalize it away.
- Codex `44e95c857f37f81a5731eab72c32a3d334d0e2c4`: `codex-rs/protocol/src/models.rs` separates function calls, call IDs, outputs, and reasoning items; `codex-rs/core/src/context_manager/history.rs` declares call/output pairing invariants. We adopt typed pairing and separate reasoning. We intentionally fail closed instead of inserting an `aborted` output during translation.
- DeerFlow `88252e9b318d34e7e1867155ad2c77993320788e`: `backend/packages/harness/deerflow/models/openai_codex_provider.py` converts `AIMessage.tool_calls` and `ToolMessage.tool_call_id` to provider-native items; `assistant_payload_replay.py` uses stable content/tool-ID signatures to restore provider fields. We adopt provider-owned conversion and explicit metadata retention, but not its LangChain dependency, streaming, UI event model, or heuristic field restoration.

These projects are mechanism evidence, not specifications and not implementation claims for this repository.

## Deferred work

- live DeepSeek/Kimi calls or a paid 2×2 causal matrix;
- one-repair orchestration and cost accounting;
- evented `AgentLoop`, Behavioral Eval v0, Trace/TUI/CLI integration;
- Context compression or Run-budget redesign;
- SWE-style ACI changes or task benchmarks;
- project-fact, Wiki, resume, or disclosure promotion.
