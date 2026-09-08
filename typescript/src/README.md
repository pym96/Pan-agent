# Product source map

Root [`cli.ts`](cli.ts) owns concrete composition and the existing source CLI invocation. [`index.ts`](index.ts) is the public export facade. Each implementation has one location; old source wrappers are not retained.

| Module | Entry |
|---|---|
| Shared protocol and Interfaces | [protocol](protocol/README.md) |
| Session and Native execution | [runtime](runtime/README.md) |
| Model implementations | [providers](providers/README.md) |
| Local tools | [tools](tools/README.md) |
| Durable memory | [memory](memory/README.md) |
| Terminal presentation | [tui](tui/README.md) |

The [#41 design](../../docs/design/native-module-layout.md) and [source map](../../docs/design/workorder-41-relocations.json) specify preservation and dependency checks. The #42 [presentation guide](../../docs/design/native-compact-tui.md) describes the subsequent Native UI change; core Modules remain unchanged.

#44 [streaming design](../../docs/design/native-streaming-tui.md): protocol adds ModelTextDelta/ModelProgressSink; concrete Adapters emit text, Runtime correlates run/turn, TUI alone owns provisional rendering.
