# DeepSeek JSON Output and Strict Function Calling

- Type: verified-learning-fact
- Verification: source-located
- Source: [DeepSeek Chat Completions API](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/); [DeepSeek Tool Calls guide](https://api-docs.deepseek.com/zh-cn/guides/tool_calls); [DeepSeek JSON Output guide](https://api-docs.deepseek.com/zh-cn/guides/json_mode)
- Updated: 2026-08-23

## Verified facts

- DeepSeek Chat Completions accepts `response_format={"type":"json_object"}` and requires an accompanying instruction to produce JSON.
- The API documentation warns that JSON mode can run into output-length truncation and that the resulting content must still be inspected.
- Tool Calls return function arguments as JSON text that callers should validate before execution.
- Strict Function Calling is a Beta feature enabled through the `https://api.deepseek.com/beta` base URL. Every supplied function must set `strict: true`.
- Strict mode validates the supplied function JSON Schema. Every object property must be required and every object must set `additionalProperties: false`.
- Strict mode is available with both thinking and non-thinking modes.

## Boundaries

- Documentation support does not establish the empirical reliability of either transport for this project's prompts or contexts.
- Strict schema compliance does not establish that the chosen action is useful or task-correct.
- Beta behavior may change, so results require a dated measurement window and provider fingerprint retention.

## Links

- [Protocol Reliability v1 design](../../docs/design/protocol-reliability-v1.md)
- [ReAct versus Act-only experiment](../experiments/2026-08-23-react-vs-act-swebench.md)

