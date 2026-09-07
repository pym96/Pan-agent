# Pan-owned canonical protocol and model/tool seams

Current #34 transition: `typescript/` is Product with required explicit `--kernel native`; omission fails before setup. Pi integration is independently installed Frozen Reference under `references/pi/`. Prior default-Pi descriptions below record the accepted #28–#33 baseline, prospectively superseded for selection/package placement by [ADR-0017](../adr/0017-product-isolation-and-frozen-pi.md). Core behavior and historical Evidence are unchanged. #29/#35/#36 remain separate.


Status: WorkOrder #31 accepted after independent Verdict and Human high-risk review; landed unchanged at `72de8e5866196d7a55d7d1cd8ce02c60d1cf8122` on 2026-09-06. WorkOrder #32's concrete Faux/Tool follow-up is accepted at `2ed4cee780e36f1e33845d66b9065381f775d6d2`; WorkOrder #33's direct DeepSeek implementation is a separate Builder candidate.

Criteria-Version: `1.0` (`C-PFREE-A01`…`C-PFREE-A07`).

## Outcome and ownership

This slice moves semantic ownership below `NativeKernel` into three repository-owned Modules:

- [`canonical-protocol.ts`](../../typescript/src/protocol/canonical-protocol.ts) owns `Message`, `ToolCall`, `ToolResult`, `Usage`, `ModelResponse`, `ResponseIdentity`, typed `ModelFailure`, and their runtime invariants;
- [`model-adapter-contract.ts`](../../typescript/src/protocol/model-adapter-contract.ts) owns the single `ModelAdapter.exchange(...)` Interface used by NativeKernel;
- [`agent-tool.ts`](../../typescript/src/protocol/agent-tool.ts) owns Tool identity, JSON parameter schema, explicit validation, cancellation-aware invocation, and typed execution result.

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

`Usage` and each response-identity field use explicit `reported | unavailable` states. A reported numeric zero is therefore different from an absent Provider report. Provider-specific optional values such as cache-write remain absent when they were not reported, and an optional provider-neutral backend fingerprint retains the same availability semantics. Aggregation becomes unavailable if any contributing exchange is unavailable instead of silently treating the missing exchange as zero; an optional numeric component is aggregated only when every exchange reported it. A failure is a separate typed outcome with category, safe detail, retryability, usage, and identity; it is never converted into fake assistant content.

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

This is a real seam: `NativeKernel` uses the Interface, #31 tests supply a separate scripted Adapter, #32 supplies the reusable Faux Adapter, and the #33 candidate supplies a direct Pan-owned DeepSeek Adapter. The Pi-backed bridge remains only in the transitional Pi compatibility/reference boundary.

## AgentTool admission

An `AgentTool` exposes one schema, one pure admission method, and one effectful method. NativeKernel resolves the Tool name, runs `validate(arguments)`, checks cancellation, and only then calls `execute({ toolCallId, arguments, signal })`. Unknown Tools, schema-invalid arguments, and cancellation effective before execution produce zero implementation calls. Successful and failed executions produce one correlated canonical ToolResult for the next model exchange.

The deterministic #31 Tools live only in test code at the accepted commit. WorkOrder #32 supplies the reusable Faux Adapter and direct Pan-owned Tool implementations for explicit Native composition; default Pi compatibility remains until its later migration.

## Transitional Pi compatibility

[`pi-compatibility.ts`](https://github.com/pym96/Pan-agent/blob/workorder/34-candidate/references/pi/src/pi-compatibility.ts) isolates temporary Pan↔Pi conversion used by the default Pi reference path and deterministic cross-Kernel tests. The #33 candidate removes it from explicit Native product composition, while `PiKernel` remains the unchanged default and sole Pi orchestration implementation.

```text
GeneralAgentSession
  ├─ default PiKernel ─────────────── Pi orchestration
  └─ explicit NativeKernel
       ├─ Pan ModelAdapter Interface ─ Faux Adapter
       │                              direct DeepSeek Adapter (#33 candidate)
       └─ Pan AgentTool Interface ─── direct Pan product Tools (#32 accepted)
```

The current package keeps its pinned Pi dependencies. #31 neither removes those dependencies nor claims a Pi-free install/runtime graph.

## Deterministic Evidence and limits

[`pan-contracts.test.ts`](../../typescript/test/pan-contracts.test.ts) exercises structural round-trip, malformed JSON/correlation, missing versus zero usage, missing response identity, typed failure, final completion, ToolCall→ToolResult→final, cancellation reaching an active Adapter, and zero-effect Tool rejection through the public `GeneralAgentSession`/NativeKernel/Event/Archive path. Existing shared conformance continues to run against both Kernels.

All #31 execution used deterministic local adapters and tools. Provider calls, credential reads, balance queries, paid/formal runs, and cost were `0 / 0 / 0 / 0 / CNY 0`. Its accepted scope did not deliver reusable Faux infrastructure, Pan-owned production Tools, direct DeepSeek transport, dependency removal, a packed consumer, a live Run, default cutover, Verified Project Facts, Wiki facts, or resume facts; those remain separately governed follow-ups.
