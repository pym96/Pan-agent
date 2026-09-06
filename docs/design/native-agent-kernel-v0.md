# Native Agent Kernel v0

Status: WorkOrder #28 Builder candidate on accepted base `255da3c043bdddde28b5f94d549725edddee2ff6`; pending independent Regulator Verdict.

Criteria-Version: `1.0` (`C-KER-01`…`C-KER-10`).

## Outcome and boundary

`GeneralAgentSession` now delegates iterative semantics through one small `AgentKernel` Interface. The session remains responsible for task admission, per-run Runbook binding, archive creation before model/tool effects, archive sealing, and product cleanup. A Kernel owns retained typed Context, iterative model exchange, ToolCall/ToolResult correlation, deterministic scheduling, cancellation, model-turn/tool-step budgets, terminal classification, and canonical model/tool observations.

The seam deliberately excludes Provider wire translation, concrete read/write/edit/bash implementations, durable-memory formats, TUI control, retrospective/runbook policy, evaluation, and product composition. Those existing modules are reused without a Kernel-specific copy.

```text
TUI / CLI composition (`--kernel pi|native`, default pi)
                       |
                GeneralAgentSession
             admission | runbook | archive
                       |
                  AgentKernel
                 /           \
      PiKernel (default)   NativeKernel (explicit)
        Pi Agent loop       repository loop
                 \           /
          same Adapter + AgentTool contracts
```

## Interface and implementations

`AgentKernel.runTask(...)` accepts a run identity, task, fully bound system prompt, and canonical observation sink. It returns one classified outcome with final public text, recomputable model/tool counts, and accumulated usage. `cancel()`, `close()`, `isRunning`, and `contextMessageCount` complete the existing session needs.

`PiKernel` is the compatibility implementation and the only source module that constructs Pi's `Agent`. Omission of `--kernel` and explicit `--kernel pi` select the same implementation. Its accepted 64-model-turn default remains, and the tool-step default is effectively unbounded for compatibility; an explicit smaller positive budget activates the shared atomic preflight.

`NativeKernel` directly invokes the existing `PiModelAdapter.streamFn` contract and existing `AgentTool` implementations. It does not instantiate Pi `Agent`, call Pi's agent loop, or invoke Python. Provider-neutral Pi AI message/tool types and validation utilities remain the translation/tool contracts rather than orchestration. The Native loop retains ordered `user`, `assistant`, and `toolResult` messages without flattening them into synthetic user JSON.

## Native turn semantics

For each admitted task, NativeKernel appends one typed user message and repeats:

1. reject a requested next exchange when the model-turn budget is exhausted;
2. emit one model-turn start, invoke the Adapter once, retain the complete assistant message, accumulate reported usage, and emit one settlement;
3. classify aborted, error, or length stops immediately;
4. preflight every ToolCall ID and the entire batch budget before any tool invocation;
5. execute admitted calls sequentially in assistant-declared order, append exactly one correlated ToolResult per call, and expose validation/execution failures as typed error results;
6. wait for the entire batch before the next model exchange, or complete when the assistant emits no ToolCall.

Duplicate ToolCall identities and invalid seeded Context are terminal protocol failures before tool effects. Unknown or schema-invalid calls do not invoke an implementation; each produces exactly one correlated error result that the next model exchange can observe. A batch that would exceed `maxToolSteps` is rejected atomically with `incomplete/step_limit`. Cancellation aborts the active Adapter/tool signal, prevents later exchanges or batch calls, and settles once as `cancelled`.

## Conformance and claim boundary

[`../../conformance/fixtures/kernel-v1/manifest.json`](../../conformance/fixtures/kernel-v1/manifest.json) enumerates implementation-neutral cases for C-KER-02…08. The same runner executes every case through public `GeneralAgentSession` behavior against `pi` and `native`. It observes typed messages, tool effects, canonical events, returned outcomes, and sealed archives; it never inspects hidden thinking or Pi internals. The previously accepted `conformance/fixtures/v1` bytes are protected by fixed SHA-256 assertions.

All #28 development and checks use deterministic Faux Adapters. Provider calls, credential reads, balance queries, and paid cost remain exactly `0 / 0 / 0 / CNY 0`. This candidate does not establish live-model quality, default-cutover readiness, sandboxing, benchmark performance, or a Verified Project Fact. Human Native use and any default change require later WorkOrder #29 plus its own Evidence and acceptance.
