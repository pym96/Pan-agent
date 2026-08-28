# Provider tool-call envelopes: Anthropic content blocks versus OpenAI tool_calls

- Type: verified-learning-fact
- Verification: source-located
- Source: [Anthropic tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) (fetched 2026-08-28); [OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling) (fetched 2026-08-28); catalyst: a user-shared GPT-5.6 conversation comparing the two envelopes (its claims verified against these primary sources; its own citation pointed at an unrelated customer-support guide and is discarded)
- Updated: 2026-08-28

## Verified facts

**Anthropic Messages API — content-block architecture:**

- Assistant output is a list of typed content blocks; a tool call is one block kind: `{"type": "tool_use", "id": "toolu_…", "name": "…", "input": {…}}`, where `input` is already a structured object — no second `json.loads` of an arguments string is needed.
- Text and `tool_use` blocks interleave freely in one assistant message; a tool-using turn ends with `stop_reason: "tool_use"`.
- Tool results return as `{"type": "tool_result", "tool_use_id": "toolu_…", "content": …}` blocks placed inside a **user-role** message; the full assistant content is replayed back verbatim in the next request.
- Anthropic also supports `strict: true` on custom tool definitions to "ensure Claude's tool calls always match your schema exactly" (Strict tool use), and `tool_choice` with `disable_parallel_tool_use` to force at most one call per turn.
- Tools split by execution location: client tools run in the caller's application; server tools (web search, code execution, etc.) run on Anthropic infrastructure.

**OpenAI — two envelope generations:**

- Current docs lead with the **Responses API**: function calls are items in the response `output` array, `{"type": "function_call", "call_id": "call_…", "name": "…", "arguments": "{\"location\":\"Paris\"}"}` — `arguments` is a JSON-encoded **string** that callers must parse. Results return as `{"type": "function_call_output", "call_id": …, "output": …}` items appended to the next request's `input`.
- The older **Chat Completions** envelope uses `message.tool_calls[].function.{name, arguments}` with results as `role: "tool"` messages keyed by `tool_call_id`; the OpenAI guide itself notes these are Chat Completions concepts. DeepSeek's tool-call API (already ingested) follows the Chat Completions shape.

**Synthesis for this repository:** provider wire dialects differ along at least four axes — envelope shape (content blocks vs tool_calls vs output items), argument encoding (structured object vs JSON string), result correlation (`tool_use_id` in a user message vs `tool_call_id` in a tool message vs `call_id` in an output item), and multi-call packaging. This is a second concrete confirmation of the Translation Adapter's reason to exist: the harness's canonical state must not speak any one provider's dialect.

## Boundaries

- The GPT-5.6 catalyst text described only the Chat Completions generation and missed Anthropic's strict mode and the Responses API generation; its content was accurate as far as it went, but it is not itself an admitted source.
- Envelope shapes are dated documentation facts (fetched 2026-08-28); providers version their APIs and shapes may change.
- Nothing here is a Verified Project Fact; this repository's Translation Adapter is DeepSeek-only, and no Anthropic/OpenAI adapter exists or is claimed.

## Links

- [Canonical conversation](../concepts/canonical-conversation.md) — the provider-neutral state these dialects project from; this page is its dialect-diversity evidence.
- [DeepSeek JSON Output and Strict Function Calling](2026-08-23-deepseek-structured-output.md) — the Chat-Completions-generation dialect this repository actually speaks.
- [Harness, MCP, and skills: three capability layers](../concepts/harness-mcp-skills.md)
