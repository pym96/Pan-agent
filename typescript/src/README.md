# Product source map

Root [`cli.ts`](cli.ts) owns concrete composition and the existing source CLI invocation. [`index.ts`](index.ts) is the public export facade. Each implementation has one location; old source wrappers are not retained.

| Module | Entry |
|---|---|
| Shared protocol and Interfaces | [protocol](protocol/README.md) |
| Session and Native execution | [runtime](runtime/README.md) |
| Model implementations | [providers](providers/README.md) |
| Native startup and operator fallback | [sandbox/fallback.ts](sandbox/fallback.ts) |
| Public document transport | [native network](sandbox/native/network.ts) and [macOS system proxy selection](sandbox/native/system-proxy.ts) |
| Local tools | [tools](tools/README.md) |
| Durable memory | [memory](memory/README.md) |
| Terminal presentation | [tui](tui/README.md) |

The [#41 design](../../docs/design/native-module-layout.md) and [source map](../../docs/design/workorder-41-relocations.json) record preservation and dependency checks for that fixed revision. [Current verification and historical proof](../../docs/design/current-regression-history.md) explains which assertions run today and how to reproduce the original checks. The #42 [presentation guide](../../docs/design/native-compact-tui.md) records the subsequent Native UI change.

#44 [streaming design](../../docs/design/native-streaming-tui.md): protocol adds ModelTextDelta/ModelProgressSink; concrete Adapters emit text, Runtime correlates run/turn, TUI alone owns provisional rendering.

[input/](input/README.md) prepares explicit file snapshots above `GeneralAgentSession.runTask(string)`; Runtime, Protocol, Provider, Tools and memory remain unchanged.

- [execution/](execution/README.md): shared admission, scheduler, goal verification and supervised installed CLI (#150 candidate).

`config/workspace-trust.ts` validates the optional native workspace declaration, maintains operator-owned trust receipts and binds a selected read-only resource to an exact command or the first task.

[Local MCP reports](mcp/README.md) contains the operator-authorized stdio report client, process transport and CLI mapping.
