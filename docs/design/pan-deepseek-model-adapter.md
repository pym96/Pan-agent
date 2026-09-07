# Direct Pan-owned DeepSeek ModelAdapter

Current #34 transition: `typescript/` is Product with required explicit `--kernel native`; omission fails before setup. Pi integration is independently installed Frozen Reference under `references/pi/`. Prior default-Pi descriptions below record the accepted #28–#33 baseline, prospectively superseded for selection/package placement by [ADR-0017](../adr/0017-product-isolation-and-frozen-pi.md). Core behavior and historical Evidence are unchanged. #29/#35/#36 remain separate.


Status: WorkOrder #33 Builder candidate on accepted base `2ed4cee780e36f1e33845d66b9065381f775d6d2`; pending independent Regulator Verdict.

Criteria-Version: `1.0` (`C-PFREE-C101`…`C-PFREE-C108`).

## Outcome and deep boundary

The explicit Native product path now composes one deep Pan-owned model Module:

```text
GeneralAgentSession -> NativeKernel -> ModelAdapter
                                      |
                       PanDeepSeekModelAdapter
                       request codec | private reasoning state
                       SSE assembler | typed failure map
                                      |
                         DeepSeekTransport (internal)
                                      |
                    inert-until-send Fetch implementation
```

[`pan-deepseek-model-adapter.ts`](../../typescript/src/providers/deepseek/pan-deepseek-model-adapter.ts) accepts canonical Context and returns one fully assembled canonical response or failure. [`deepseek-transport.ts`](../../typescript/src/providers/deepseek/deepseek-transport.ts) is a narrow internal seam for one HTTP request and a byte stream. Authentication, Provider JSON, SSE fragments, finish reasons, and private reasoning never cross `ModelAdapter`. Explicit `native` selects this Module directly; omitted or explicit `pi` retains the accepted PiKernel and Pi Provider route.

The transport constructor is inert. Only `send(...)` resolves `DEEPSEEK_API_KEY` and invokes Fetch. Import, CLI help/validation, and Adapter construction therefore touch neither credential nor network. There is no automatic retry: one admitted `exchange(...)` starts at most one transport request.

## Frozen Provider contract

The blocking semantic subset was retrieved from official DeepSeek documentation on 2026-09-07 and frozen by the #33 activation:

| Contract | Official URL | Retrieved-byte SHA-256 |
|---|---|---|
| Chat completion | <https://api-docs.deepseek.com/api/create-chat-completion/> | `67b6a6c8ab70f51ad56f6018077ac58768d95f73b53639b4d00b3f6d57a4fad9` |
| Thinking mode | <https://api-docs.deepseek.com/guides/thinking_mode/> | `f28c43248d26db1f27af0cb082abb00326c957d560d33a21839736edd1d10724` |
| Tool calls | <https://api-docs.deepseek.com/guides/tool_calls/> | `41420d8609a15ff13afd5b82a66ea1b2a5440a59787718ade7f48230b660bcfa` |
| Error classes | <https://api-docs.deepseek.com/quick_start/error_codes/> | `0dd0c3c189933e69d1de6be900f6a1653ab2b543dd3a720baf1eb48c19dff916` |

The implemented subset is `POST /chat/completions`, `stream=true`, usage on the terminal completion chunk, SSE `data:` records ending once in `[DONE]`, text-only system/user/assistant/tool history, function Tool definitions, and `stop | length | tool_calls | content_filter | insufficient_system_resource`. It deliberately omits `tool_choice`, sampling controls, output limits, timestamps, ToolResult details, and unrelated canonical metadata. Canonical image input is rejected before transport because the selected profiles are text-only.

## Exact semantic mapping

Canonical Tool definitions remain ordered functions. Assistant ToolCalls become ordered Provider calls with unchanged IDs, names, and JSON-object arguments; ToolResults become `role=tool` messages carrying the matching `tool_call_id`. The decoder joins text and argument fragments exactly once, orders calls by Provider index, and admits them only after a unique terminal, complete object arguments, consistent response identity, terminal usage, and `[DONE]` have all arrived.

Byte boundaries carry no meaning. The fixture suite runs every valid SSE body unsplit and at every byte boundary, including within UTF-8 text and fragmented JSON arguments. Malformed JSON/UTF-8, missing or repeated settlement markers, data after settlement, identity drift, unknown finish reason, incomplete calls, invalid/non-object arguments, and truncation all return a typed protocol failure; no partial assistant response is admitted.

DeepSeek `reasoning_content` is Provider-private continuation state. The Adapter records it per session and exact assistant-history identity, exposes only canonical `diagnostics.reasoning.state=present`, and replays the exact private string only when the matching later Context includes Tools. It is never public message text, a Tool field, an Event/Archive value, a log, or an error detail. Missing/inconsistent history fails before transport rather than fabricating continuation state.

Provider-reported prompt, completion, total, cache-hit, and optional reasoning Tokens map directly to canonical usage. DeepSeek does not report Pan cache-write or cost values, so those fields remain absent rather than becoming zero or reusing cache-miss. Provider, model, response ID, and optional backend fingerprint retain explicit `reported | unavailable` meaning and must remain consistent across chunks.

## Cancellation and failure table

Pre-abort starts zero transport. An active AbortSignal reaches Fetch/body iteration; partial bytes and tentative private state are discarded. Transport errors and HTTP bodies are reduced to safe finite classifications, so credentials, body messages, and private reasoning cannot enter returned details.

| Input | Canonical category | Retryable |
|---|---|---:|
| HTTP 400 + exact `context_length_exceeded` or `context_overflow` | `context_overflow` | no |
| other HTTP 400 | `provider` | no |
| HTTP 401 | `authentication` | no |
| HTTP 402 | `provider` (`balance`) | no |
| HTTP 422 | `provider` | no |
| HTTP 429 | `rate_limit` | yes |
| HTTP 500 / 503 | `provider` | yes |
| other HTTP | `provider` | only 5xx |
| request/body transport rejection | `transport` | yes |
| active abort | `cancelled` | no |

The table is Adapter attribution, not retry middleware. NativeKernel receives the failure unchanged and retains its accepted terminal behavior.

## Deterministic verification and limits

[`pan-deepseek-adapter.test.ts`](../../typescript/test/pan-deepseek-adapter.test.ts) and the [content-hashed fixture manifest](../../typescript/test/fixtures/pan-deepseek-v1/manifest.json) cover construction, exact encoding, three Thinking levels, interleaved private continuation, every-byte fragmentation, malformed streams, usage/identity, cancellation, HTTP/transport failure, CLI selection, and the public `GeneralAgentSession -> NativeKernel -> Pan Tool -> Event -> sealed Archive` path.

All #33 checks are offline. Provider calls, Provider credential reads, balance queries, paid/formal Runs, and cost are `0 / 0 / 0 / 0 / CNY 0`. This candidate does not remove Pi, change the default Kernel, modify Kernel/Tool/TUI/Archive semantics, establish live-provider behavior, create benchmark Evidence, or establish a Verified Project Fact.
