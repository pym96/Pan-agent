# DeepSeek provider contract: Thinking Mode × Tool Calls (for the v3 lock)

- Type: verified-learning-fact
- Verification: source-located
- Source: official DeepSeek docs fetched 2026-08-29 via curl (Docusaurus SSR, article bodies extracted; WebFetch was domain-blocked) — [Thinking Mode guide](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode), [Tool Calls guide](https://api-docs.deepseek.com/zh-cn/guides/tool_calls), [Chat Completions reference](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion), [thinking+tool-call example](https://api-docs.deepseek.com/zh-cn/api_samples/thinking_mode_api_example_tool_call); accepted project Evidence: [Issue #11 Regulator Verdict](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5461826495)
- Updated: 2026-08-29

## Verified facts

### Evidence table (every statement: exact locator + capture date)

| # | Statement | Source (captured 2026-08-29) | Status |
|---|---|---|---|
| 1 | Thinking mode supports tool calls since DeepSeek-V3.2; the model may interleave multiple thinking/tool-call rounds before a final answer | Tool Calls guide, thinking-mode section | Documented |
| 2 | Strict mode (`strict: true` per function, `/beta` base URL) works in both thinking and non-thinking modes | Tool Calls guide, strict-mode section | Documented |
| 3 | With `tools` present, **all** historical `reasoning_content` must be fully replayed in every subsequent request — even turns without a tool call; the docs state failure to replay returns **400**. Without `tools`, `reasoning_content` is ignored if sent | Thinking Mode guide, parameters and tool-calls sections | Documented |
| 4 | `tool_choice` semantics: `none` = never call tools; `auto` = model may answer or call; `required` = must call one or more tools; named form `{"type":"function","function":{"name":…}}` forces a specific tool. Default: `none` without tools, `auto` with tools | Chat Completions reference, `tool_choice` field | Documented |
| 5 | The official thinking+tool-call example passes `tools`, `reasoning_effort="high"`, `extra_body={"thinking":{"type":"enabled"}}` against `base_url="https://api.deepseek.com"` (stable), and never sends `tool_choice` (zero occurrences on both the guide and the example page) | thinking+tool-call example; Thinking Mode guide | Documented (absence) |
| 6 | Thinking mode does not support `temperature`/`top_p`/`presence_penalty`/`frequency_penalty` — setting them does not error but has no effect; the general reference further marks `frequency_penalty`/`presence_penalty` as deprecated | Thinking Mode guide, parameters section; Chat Completions reference | Documented |
| 7 | Thinking defaults to **on** with `reasoning_effort` default `high`; request→actual effort mapping for `deepseek-v4-flash`/`deepseek-v4-pro`: `low→low, medium→high, high→high, xhigh→high, max→max` | Thinking Mode guide, control-parameters section | Documented |
| 8 | `thinking=enabled` + `reasoning_effort=high` + `tool_choice="required"` was rejected by the **stable** endpoint with HTTP 400 `invalid_request_error`: *"Thinking mode does not support this tool_choice"* — retained request/response bodies hash-verified by an independent Regulator | [Issue #11 Verdict](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5461826495) | **Experiment-observed, independently accepted, dated to the v2 lock window** |
| 9 | Strict mode is a Beta feature requiring `base_url="https://api.deepseek.com/beta"`; thinking parameters ride the stable endpoint via `extra_body` in the official examples | Tool Calls guide (strict section); example code | Documented |

### Two `required`s that must not be conflated

- JSON Schema `required` **inside** a tool definition (`parameters.required`) lists which arguments a function call must contain — a property of the tool schema.
- Request-level `tool_choice: "required"` forces the model to emit at least one tool call instead of a text answer — a property of the request.

The v2-lock 400 concerns only the latter. Nothing in the docs forbids schema-level `required` under thinking mode.

### General availability ≠ Thinking-Mode compatibility

The Chat Completions schema lists `none`/`auto`/`required` without mode annotations (row 4), but the observed 400 (row 8) proves that **a parameter value's presence in the general schema does not establish its combinability with Thinking Mode**. Documented support and observed rejection must be recorded as separate rows, never collapsed into "all combinations work".

### Unknown without another live call (v3 input)

- Whether `thinking=enabled` + `tools` + omitted/`auto` `tool_choice` succeeds end to end (the candidate v3 repair).
- Whether the named form `tool_choice={"type":"function",…}` is also rejected under thinking.
- Whether the `/beta` endpoint behaves differently for the same combination.
- Whether `tool_choice="none"` with tools present is accepted under thinking.

## Boundaries

- Row 8 is a single dated observation at the frozen v2 configuration (stable endpoint, deepseek-v4 family, effort high); it is not a general provider law, and the fix is a new frozen lock requiring fresh human authorization per the Issue #11 Verdict.
- Docs captured from the Chinese locale on 2026-08-29; provider behavior is dated and may change.
- This page is a learning artifact for the future v3 WorkOrder: it constrains what may be claimed, and makes no implementation decision.
- Nothing here is a Verified Project Fact or resume evidence.

## Links

- [DeepSeek JSON Output and Strict Function Calling](2026-08-23-deepseek-structured-output.md)
- [Canonical conversation](../concepts/canonical-conversation.md) — the `reasoning` field whose replay row 3 mandates.
- [Provider tool-call envelopes](2026-08-28-provider-tool-envelopes.md)
- [Fixed-context DeepSeek action-protocol reliability](../experiments/2026-08-23-protocol-reliability-v1.md) — the earlier thinking-disabled lane.
