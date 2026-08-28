# Canonical conversation

- Type: verified-learning-fact
- Verification: triangulated
- Source: three materially independent pinned codebases inspected directly on 2026-08-25 — Pi `a1f955e9f47fd3379b44f4aace65ab916c80519a` (`packages/ai/src/types.ts:427-467`, `packages/ai/src/api/openai-completions.ts:1284-1351`), Codex `44e95c857f37f81a5731eab72c32a3d334d0e2c4` (`codex-rs/protocol/src/models.rs:807-1017`, `codex-rs/core/src/context_manager/history.rs:279-486`), DeerFlow `88252e9b318d34e7e1867155ad2c77993320788e` (`backend/packages/harness/deerflow/models/openai_codex_provider.py:157-171,345-385`) — plus this repository's `workspace_agent_harness/translation.py:23-99` and design candidate `docs/design/translation-adapter.md` / ADR-0013
- Updated: 2026-08-25

## Verified facts

Definition adopted by this Wiki: **every agent system defines its own canonical conversation — a typed internal conversation state plus pairing/validation rules. The harness owns it as the source of truth; the provider wire format is only its projection at the boundary, and a provider response must pass decoding and validation to re-enter it.**

Supporting observations, each inspected at the pinned locators above:

- Pi keeps a typed `Message = UserMessage | AssistantMessage | ToolResultMessage` union with `ToolResultMessage.toolCallId`, and converts to provider `tool_calls` / `tool_call_id` wire only at the API layer.
- Codex keeps typed `FunctionCall` / `FunctionCallOutput` items keyed by `call_id` with reasoning items separated, and its history module enforces pairing invariants ("paired outputs must have a corresponding call").
- DeerFlow converts LangChain `AIMessage.tool_calls` / `ToolMessage.tool_call_id` into provider-native items inside its provider layer.
- This repository's candidate `translation.py` defines `UserMessage`, `AssistantToolCall(CanonicalToolCall(call_id, tool_name, arguments), reasoning?)`, `ToolResultMessage`, and `AssistantFinalMessage`, with `CanonicalConversation` as an append-only typed tuple; missing, duplicate, reused, mismatched, or orphan correlation IDs are rejected before transport.
- The rules themselves differ per system and encode engineering stance: Pi can synthesize missing tool results, Codex can insert an `aborted` placeholder output, and this repository deliberately rejects both normalizations in favor of fail-closed exposure of corrupt history.
- Two properties follow from the formulation and are checkable in the local design: the same canonical state can be serialized into more than one wire carrier (legacy JSON text versus native tool calls), so canonical state is not a processed wire dump; and a malformed provider response yields no canonical action and no next history, so canonical state is curated, not accumulated provider output.

## Boundaries

- There is no industry-standard canonical form; each system's state and rules are private expressions of its engineering stance. The definition generalizes from four systems and must not be read as a claim about all agent systems.
- This repository's Translation Adapter, ADR-0013, and `translation.py` are a Working Agent candidate for WorkOrder #4 pending an independent Regulator Verdict; this page records the formulation as this repository's design stance, not as a Verified Project Fact, and offline fixture conformance proves no provider acceptance, reliability improvement, or task success.
- The user's original session phrasing — canonical conversation as "provider tokens processed by agreed rules" — was refined before admission: the provider exchange is structured messages, not tokens, and the causal direction is harness-owned state projecting to wire, not wire accumulating into state. Earlier phrasings remain only in session history.
- The Pi/Codex normalization behaviors (synthesized results, `aborted` placeholders) are recorded from the pinned files and the design candidate's inspection notes; this page does not evaluate whether those choices are wrong, only that they differ.

## Links

- [Harness Engineering](harness-engineering.md) — the harness supplies what the stateless model call cannot; canonical conversation is the state layer of that claim.
- [Trace versus thought trajectory](trace-vs-thought-trajectory.md) — the local rule that reasoning never enters executable arguments.
- [Earendil: What is a harness](../sources/2026-08-23-earendil-what-is-a-harness.md) — the "translation layer across models" is the product-level statement of the same boundary.
- [Fixed-context DeepSeek action-protocol reliability](../experiments/2026-08-23-protocol-reliability-v1.md) — L3 canonical action as the measurement yardstick across two wire protocols.
- Design candidate: `../../docs/design/translation-adapter.md` and ADR-0013 (not yet independently accepted).
- [Provider tool-call envelopes](../sources/2026-08-28-provider-tool-envelopes.md) — concrete dialect diversity (Anthropic blocks vs OpenAI two generations) that motivates the canonical layer.
