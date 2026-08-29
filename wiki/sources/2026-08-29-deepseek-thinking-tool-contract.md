# DeepSeek thinking-mode tool-call contract: combination constraints and history replay

- Type: verified-learning-fact
- Verification: source-located
- Source: [DeepSeek Thinking Mode guide](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode) and [Tool Calls guide](https://api-docs.deepseek.com/zh-cn/guides/tool_calls) (fetched 2026-08-29 via curl; Docusaurus SSR pages, article bodies extracted); the empirical 400 observation comes from the project's live Stage A session (Working-level, not yet independently verified)
- Updated: 2026-08-29

## Verified facts

From the official guides:

- Thinking mode supports tool calls since DeepSeek-V3.2; the model may interleave multiple thinking/tool-call rounds before a final answer. Strict mode (`strict: true` functions via the `/beta` base URL) works in **both** thinking and non-thinking modes.
- Thinking mode does not support `temperature`, `top_p`, `presence_penalty`, or `frequency_penalty`; setting them does not error but has no effect.
- Thinking defaults to **on**, with `reasoning_effort` defaulting to `high`; the documented request-to-actual effort mapping for `deepseek-v4-flash`/`deepseek-v4-pro` is `low→low, medium→high, high→high, xhigh→high, max→max`.
- **History replay requirement**: whether `reasoning_content` must be replayed depends on whether the request carries `tools`:
  - With `tools`: all historical `reasoning_content` **must** be fully replayed in every subsequent request — even for turns where the model made no tool call — and it is concatenated into context. The docs state that failing to replay it correctly makes the API return **400**.
  - Without `tools`: `reasoning_content` need not be replayed; if sent, it is ignored and not concatenated.
- The official thinking+tools example passes `tools`, `reasoning_effort`, and `thinking=enabled`, and the token `tool_choice` appears **zero times** in the entire thinking-mode guide — the documented combination leaves `tool_choice` at its default (`auto` when tools are present, per the Chat Completions reference).

Empirical addition from the project's live Stage A session (Working-level): a real request combining `thinking=enabled` + `tools` + `tool_choice="required"` was rejected with HTTP 400; the candidate fix is to omit `tool_choice` and let the provider default to `auto`. This combination constraint is **not** in the official docs; it is a provider-contract observation awaiting independent reproduction.

Design consequence for this repository: the canonical history's `reasoning` field is not optional decoration on the DeepSeek path — the provider contract requires replaying it whenever tools are present, which is exactly what the `reasoning_content-restricted` carrier in `deepseek_live.py` encodes. The current live adapter sends `tool_choice: "required"` (`deepseek_live.py:287`), which intersects the empirical 400 finding.

## Boundaries

- The 400 combination constraint (`thinking=enabled` + `tool_choice="required"`) is a single-session empirical observation, not documentation and not yet independently reproduced; the documented 400 trigger is the reasoning_content replay violation, a different failure.
- Provider behavior is dated (docs fetched 2026-08-29) and may change; effort mappings and defaults are per the current docs for v4-flash/v4-pro.
- Docs were fetched from the Chinese locale; the English page content may differ in wording.
- Nothing here is a Verified Project Fact or resume evidence.

## Links

- [DeepSeek JSON Output and Strict Function Calling](2026-08-23-deepseek-structured-output.md)
- [Canonical conversation](../concepts/canonical-conversation.md) — the `reasoning` field whose replay this contract mandates.
- [Provider tool-call envelopes](2026-08-28-provider-tool-envelopes.md) — the dialect map this contract extends.
- [Fixed-context DeepSeek action-protocol reliability](../experiments/2026-08-23-protocol-reliability-v1.md) — the earlier experiments ran with thinking disabled; this contract governs the thinking-enabled lane.
