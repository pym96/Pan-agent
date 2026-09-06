# Pan-owned canonical protocol and model/tool seams

Status: WorkOrder #31 Builder candidate on accepted base `895aa65654405cf7f96cf4ec31dbb5f1031b13e2`; pending independent Regulator Verdict.

Criteria-Version: `1.0` (`C-PFREE-A01`…`C-PFREE-A07`).

## Outcome and ownership

This slice moves semantic ownership below `NativeKernel` into three repository-owned Modules:

- [`canonical-protocol.ts`](../../typescript/src/canonical-protocol.ts) owns `Message`, `ToolCall`, `ToolResult`, `Usage`, `ModelResponse`, `ResponseIdentity`, typed `ModelFailure`, and their runtime invariants;
- [`model-adapter-contract.ts`](../../typescript/src/model-adapter-contract.ts) owns the single `ModelAdapter.exchange(...)` Interface used by NativeKernel;
- [`agent-tool.ts`](../../typescript/src/agent-tool.ts) owns Tool identity, JSON parameter schema, explicit validation, cancellation-aware invocation, and typed execution result.

These are semantic contracts. They contain no Pi import, Provider request/response envelope, SDK model object, stream event, authentication option, or hidden-reasoning text. The deletion test is intentional: removing these Modules would force Context meaning, missing-data policy, correlation, Tool admission, and failure classification back into the loop and every Adapter.

## Canonical meaning

`Message` is a discriminated union of typed user, assistant, and ToolResult history. Assistant content retains text and structured ToolCalls side by side; a model may therefore explain a planned action and emit it in the same response. Tool arguments remain JSON-compatible objects and ToolResults remain correlated semantic objects. Neither is flattened into synthetic JSON text.

Runtime validation enforces the open-domain invariants:

1. ToolCall IDs and names are non-empty;
2. arguments are finite, acyclic JSON-compatible objects;
3. one active Context never repeats a ToolCall ID;
4. every ToolResult settles exactly one preceding ToolCall with the same Tool name;
5. a model response cannot announce a Tool-call stop without a call, or carry a call under a non-Tool stop;
6. optional reasoning metadata records only `present | redacted`; reasoning text cannot occupy message content, Tool identity, arguments, or a control field.

`Usage` and each response-identity field use explicit `reported | unavailable` states. A reported numeric zero is therefore different from an absent Provider report. Aggregation becomes unavailable if any contributing exchange is unavailable instead of silently treating the missing exchange as zero. A failure is a separate typed outcome with category, safe detail, retryability, usage, and identity; it is never converted into fake assistant content.

## ModelAdapter seam

NativeKernel makes one call per admitted model turn:

```text
ModelAdapter.exchange({
  sessionId,
  context: { systemPrompt, messages, tool definitions },
  signal
}) -> ModelResponse | ModelFailure
```

The input is canonical Context plus description-only Tool definitions. The result is one fully assembled semantic outcome. Streaming assembly, wire serialization, credentials, HTTP and Provider error decoding stay behind the Adapter and are intentionally absent from this Interface. The `AbortSignal` is the single cancellation path.

This is a real seam even before production migration completes: `NativeKernel` uses the Interface, while #31 tests supply a separate scripted Adapter. The production Pi-backed bridge is transitional and belongs outside this Interface; #33 replaces that bridge with a direct Pan-owned DeepSeek Adapter.

## AgentTool admission

An `AgentTool` exposes one schema, one pure admission method, and one effectful method. NativeKernel resolves the Tool name, runs `validate(arguments)`, checks cancellation, and only then calls `execute({ toolCallId, arguments, signal })`. Unknown Tools, schema-invalid arguments, and cancellation effective before execution produce zero implementation calls. Successful and failed executions produce one correlated canonical ToolResult for the next model exchange.

The deterministic #31 Tools live only in test code. Current production Pi Tool implementations cross the explicitly named transitional compatibility module; #32 owns their replacement and the reusable Faux Adapter.

## Transitional Pi compatibility

[`pi-compatibility.ts`](../../typescript/src/pi-compatibility.ts) is the only temporary Pan↔Pi conversion Module used by explicit Native production composition. It converts semantic history and outcomes at the edge while `PiKernel` remains the unchanged default and sole Pi orchestration implementation. It is deliberately named and documented as transitional rather than hidden behind a Pan production claim.

```text
GeneralAgentSession
  ├─ default PiKernel ─────────────── Pi orchestration
  └─ explicit NativeKernel
       ├─ Pan ModelAdapter Interface ─ scripted test Adapter
       │                              transitional Pi transport bridge (#33 replaces)
       └─ Pan AgentTool Interface ─── scripted test Tool
                                      transitional Pi Tool bridge (#32 replaces)
```

The current package keeps its pinned Pi dependencies. #31 neither removes those dependencies nor claims a Pi-free install/runtime graph.

## Deterministic Evidence and limits

[`pan-contracts.test.ts`](../../typescript/test/pan-contracts.test.ts) exercises structural round-trip, malformed JSON/correlation, missing versus zero usage, missing response identity, typed failure, final completion, ToolCall→ToolResult→final, cancellation reaching an active Adapter, and zero-effect Tool rejection through the public `GeneralAgentSession`/NativeKernel/Event/Archive path. Existing shared conformance continues to run against both Kernels.

All #31 execution uses deterministic local adapters and tools. Provider calls, credential reads, balance queries, paid/formal runs, and cost are `0 / 0 / 0 / 0 / CNY 0`. This candidate does not deliver reusable Faux infrastructure, Pan-owned production Tools, direct DeepSeek transport, dependency removal, a packed consumer, a live Run, default cutover, Verified Project Facts, Wiki facts, or resume facts.
