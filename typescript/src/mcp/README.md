# Local report client

[Operator guide and installed demo](../../README.md#local-mcp-reports) · [packaged regression](../../../scripts/runtime-ci/README.md)

`localReports({server, tool?, workspace?, home?, signal?})` is the operator-facing adapter exported from `pan-agent`. A list opens one peer to discover eligible reports. A call opens one peer, discovers current eligibility and invokes the named report once. Both return the operator's server alias, revision and eligible names. A successful call also returns text blocks and any structured JSON value. Errors reject after shutdown. UI callers should supply their actual workspace for the policy overlap check, leave home at its operator default and render untrusted output safely. The optional home override is for trusted embedders and isolation tests.

- [mcp-reports.ts](mcp-reports.ts) reads the fixed operator policy, checks discovery and validates supported tools and results.
- [mcp-stdio.ts](mcp-stdio.ts) supervises one child and correlates newline-framed JSON-RPC requests.
- [report-tool.ts](report-tool.ts) binds one operator-selected report to a fixed TUI AgentTool and uses Pan approval for each invocation.
- [mcp-cli.ts](mcp-cli.ts) maps explicit CLI actions and process cancellation to the adapter.
- [mcp-report-example.mjs](../../bin/mcp-report-example.mjs) is the synthetic peer installed with the package.

Protocol source for the pinned revision: [discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover), [stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio), [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [cache hints](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching), [versioned schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts).

## Synthetic wire observation

The Builder ran the real stdio client against the separate test peer. Each line below contains one captured JSON-RPC message, alternating client and peer. The first page offers a tool outside the operator selection. The second page contains the authorized report. Current installed regression records fresh receipts for each case.

```jsonl
{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"pan-agent","version":"0.1.9"},"io.modelcontextprotocol/clientCapabilities":{}}}}
{"jsonrpc":"2.0","id":1,"result":{"resultType":"complete","supportedVersions":["2026-07-28"],"capabilities":{"tools":{}},"ttlMs":0,"cacheScope":"public"}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"pan-agent","version":"0.1.9"},"io.modelcontextprotocol/clientCapabilities":{}}}}
{"jsonrpc":"2.0","id":2,"result":{"resultType":"complete","tools":[{"name":"denied","annotations":{"readOnlyHint":true},"inputSchema":{"type":"object"}}],"nextCursor":"second-page","ttlMs":0,"cacheScope":"public"}}
{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{"cursor":"second-page","_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"pan-agent","version":"0.1.9"},"io.modelcontextprotocol/clientCapabilities":{}}}}
{"jsonrpc":"2.0","id":3,"result":{"resultType":"complete","tools":[{"name":"summary","annotations":{"readOnlyHint":true},"inputSchema":{"type":"object"}}],"ttlMs":0,"cacheScope":"public"}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"summary","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"pan-agent","version":"0.1.9"},"io.modelcontextprotocol/clientCapabilities":{}}}}
{"jsonrpc":"2.0","id":4,"result":{"resultType":"complete","content":[{"type":"text","text":"完成"}],"structuredContent":{"jobs":2}}}
```

The first candidate omitted cache hints inherited from the shared result schema. Independent inspection of the packaged example caught the omission. The installed regression now records the example’s own discovery and list frames and checks their hints directly.

## Installed TUI calls

The model receives a Pan-owned `mcp_report` declaration with empty arguments. The server alias and remote tool come from the operator's launch options and the external command comes from the fixed home policy. Startup discovery closes its child. A call starts a separate child only after Pan's operation-scoped approval. If the selected executable or its arguments change, a fresh TUI selection is required.

The JSON-RPC sequence starts over with each child. A wire ID by itself cannot identify which Pan request produced the call. Pan therefore sends the unique approval request ID in `tools/call` metadata and archives it alongside the model call ID, run ID, server, tool and wire ID. The [PTY regression](../../../scripts/runtime-ci/mcp-tui.py) checks that join against the child's actual receipt. Each run generates a fresh report reason so the fixture model must read the result to answer.
