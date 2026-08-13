# ADR-0006: Keep one bounded run interface with model and tool seams

- Status: Accepted
- Date: 2026-08-12

## Context

The first implementation must prove an end-to-end Task Run without pulling provider, workflow-framework, shell, recovery, or evaluation concerns into every caller. The public interface also needs to survive replacement of fake adapters with real providers and constrained tools.

Three alternatives were considered:

1. Build directly on LangGraph. This would provide graph persistence and orchestration, but the first tracer bullet would test framework configuration as much as the Harness's terminal-state and Trace semantics.
2. Fork an existing SWE agent. This would provide a mature coding loop, but would import a product boundary centered on repository issue solving rather than bounded Task Runs and Protected Control Plane rules.
3. Keep a small Harness-owned run interface and place provider/tool variation at two seams.

## Decision

Use one external interface:

```text
AgentLoop(...).run(Task, RunLimits) -> RunResult
```

`ModelAdapter.respond(context)` and `Tool.execute(arguments)` are the only variation seams in the tracer bullet. Task, limits, actions, terminal result, and persisted Trace events are typed Harness concepts. Tests cross the same `AgentLoop.run` interface as callers; system-boundary fakes implement the two seams and do not mock internal collaborators.

The deletion test supports this shape: deleting `AgentLoop` would force every caller to reimplement budgets, action parsing, tool dispatch, terminal classification, and Trace recording. Deleting either seam would spread provider/tool conditionals into the loop.

## Consequences

- The core loop stays model- and tool-independent and can be tested offline.
- LangGraph or an existing SWE agent may later be used behind an adapter or as a benchmark comparison, but is not the v1 domain model.
- This decision does not claim sandboxing, checkpoint/recovery, provider compatibility, or production reliability. Those require separate implementations and acceptance evidence.
