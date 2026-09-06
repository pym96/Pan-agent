# TypeScript/Pi General Agent Working Stack

Status: WorkOrder #23's tracer bullet, WorkOrder #25's three-lane memory implementation, and WorkOrder #24's authoritative cutover are independently accepted and landed. WorkOrder #28 adds a pending-review Native Agent Kernel v0 while preserving PiKernel as default.

## Decision and scope

The TypeScript General Agent Working Stack is the authoritative product direction; the accepted Python stack is reference-only. The product supplies one TUI, one `GeneralAgentSession`, a default PiKernel and explicitly selected NativeKernel behind one AgentKernel seam, one real DeepSeek Adapter, one deterministic Faux Adapter for tests, four Pi-maintained tools including a clearly labelled trusted-local shell, observable outcomes, and three distinct memory lanes.

WorkOrder #24 changes authority, navigation, and conformance ownership without deleting history or porting the reference AgentLoop. It does not import LangGraph, execute an evaluation matrix, change historical Evidence/VPF/Wiki claims, or make a paid model call.

## Module and Interface

```text
Human TUI
    |
    | task / cancellation / normalized observations
    v
GeneralAgentSession Module
    |-- admission + Runbook binding + durable archive settlement
    `-- AgentKernel Seam (default pi | explicit native)
          |-- PiKernel: Pi Agent loop + full transcript
          |-- NativeKernel: repository loop + typed Context
          |-- PiModelAdapter Seam
          |     |-- DeepSeek Adapter (real, construction is offline)
          |     `-- Faux Adapter (deterministic tests)
          `-- AgentTool Seam
                |-- read / write / edit
                `-- trusted-local bash
                            |
                            `-- Pi NodeExecutionEnv Implementation
```

`GeneralAgentSession.runTask(task)` is the product Module's primary Interface. It hides Kernel selection, event reduction, transcript ownership, tool correlation, cancellation, per-task accounting, terminal classification, and archive settlement. `cancel()`, `close()`, `isRunning`, the selected Kernel identity, and retained Context message count complete the Human-session needs. The narrower AgentKernel Interface beneath it owns iterative semantics without absorbing Provider translation, tools, memory formats, TUI, or evaluation.

PiKernel remains the default and is the only implementation allowed to construct Pi's `Agent`. NativeKernel directly drives the existing model Adapter and AgentTool contracts while preserving typed `user`, `assistant`, and `toolResult` history; it never instantiates Pi Agent orchestration or invokes Python. The detailed contract is in [`native-agent-kernel-v0.md`](native-agent-kernel-v0.md).

The `PiModelAdapter` Seam has two real consumers: the production DeepSeek Adapter and a Faux Provider Adapter in deterministic tests. Both cross the same Pi `streamFn` and model contract. The tool-binding Adapter supplies one `NodeExecutionEnv` context to Pi's exported harness-tool Implementations; it does not fork or copy those Implementations.

## Pi dependency and source provenance

The direct packages are exact pins:

- `@earendil-works/pi-agent-core@0.84.4`, npm integrity `sha512-HyUnjaOXj6oN/6SNcr8A1J/ElRQA50FtIE0XUTSKAQVqmdlb9qdojOyUQwF/jULE5+yOEtGuVgi/N1RnBiNG+g==`;
- `@earendil-works/pi-ai@0.84.4`, npm integrity `sha512-AClAZxf5+c4RRu44NJPS6wyQy+Nmq+Mzyyrdvm4ZVMNuixelO02RZX4G4Aq1F145Yzp43wnM5S+hLlSI7ypfVw==`.

The full dependency graph is content-addressed by `typescript/package-lock.json`. Before implementation, the read-only local Pi checkout was inspected at commit `853a80d26c90a14c1886f0ebb8ffaae133ca2185`:

- `packages/agent/src/agent.ts` and `agent-loop.ts`: stateful transcript, event loop, typed ToolCall validation, sequential tool execution, and cancellation;
- `packages/agent/src/harness/tools/{read,write,edit,bash}.ts`: maintained tool schemas and Implementations;
- `packages/agent/src/harness/env/nodejs.ts`: host filesystem/shell Implementation and process-tree cancellation;
- `packages/ai/src/providers/deepseek.ts`: DeepSeek Provider factory and environment-key authentication;
- `packages/ai/src/providers/faux.ts`: deterministic test Provider.

The experimental `AgentHarness.prompt()` path was deliberately not selected because the inspected Pi version marks that path unfinished. The lower-level exported `Agent` Interface already supplies the maintained loop/session behavior required by this tracer bullet.

## Runtime behavior

One TUI process creates one `GeneralAgentSession`. Successive task prompts use the same selected Kernel, which retains the full user/assistant/ToolResult transcript and supplies it to the next exchange. The application installs no arbitrary message slicing, character cutoff, semantic compressor, or transcript rewrite. A 64-turn task ceiling stops runaway orchestration without deleting Context; explicit positive tool-step limits are preflighted atomically.

Every assistant message contributes a distinct model-settled observation containing public text, Provider/model/response identity when reported, stop reason, and usage. Thinking blocks are intentionally excluded from the display projection. Every ToolCall emits a start observation and every result emits a correlated settlement with `isError`; a nonzero shell exit therefore becomes an attributable error Observation that the Agent can react to, not a Harness crash.

Malformed parameters and unknown tool names become correlated typed error results before the selected Implementation can execute. Tools run sequentially. Ctrl-C delegates to the selected Kernel's cancellation control; both propagate the AbortSignal into the active tool, and `NodeExecutionEnv` terminates an active shell process tree before the session produces an explicit `cancelled` Run terminal.

## Trusted-local shell boundary

The shell intentionally answers the earlier no-shell product limitation: it can run code and configure a task environment from observations. It is equally intentionally not called safe or sandboxed.

- authority: current host user;
- default cwd: the Human-selected workspace;
- path containment: none; Pi read/write/edit and shell may address absolute paths;
- process/network isolation: none;
- child environment: explicit ordinary-variable allowlist, with Provider credentials omitted;
- cancellation: best-effort process-tree termination through Pi's Node Implementation.

The startup display, confirmation prompt, tool label, package README, and system prompt all repeat this boundary. Stronger workspace/path/network/process isolation is not claimed by the authoritative product.

## Deterministic acceptance surface

`typescript/test/general-agent.test.ts`, `typescript/test/kernel-conformance.test.ts`, and the language-neutral fixtures in `conformance/` use Pi's Faux Provider with no network or credentials and verify through the public session Interface. The prior v1 cases preserve the accepted product contract, while `fixtures/kernel-v1` runs C-KER-02…08 against both Kernels and pins every prior fixture byte.

1. a full read -> write -> edit -> shell -> final task;
2. a nonzero shell exit retained as a typed error Observation;
3. malformed and unknown ToolCalls rejected before filesystem effect;
4. successive tasks retaining Pi-owned Context;
5. hidden thinking absent from observable projection;
6. Provider credentials absent from the trusted-local child environment;
7. cancellation settling an active shell task and preventing the late effect;
8. Provider failure producing an attributable `model_error` terminal;
9. real DeepSeek Adapter construction selecting the pinned Pi profile without network access;
10. the TUI returning control across successive tasks in one Pi session;
11. TUI confirmation rejection closing with zero Provider calls;
12. `--help` returning before Adapter construction with zero Provider calls.

These tests establish deterministic candidate behavior only. They do not prove DeepSeek live quality, shell security, Context-window reliability, Native default-cutover readiness, benchmark performance, or independent acceptance.

## Deliberate divergence from the Python reference

The Python stack remains unchanged and runnable as reference-only. It has a bounded workspace/no-shell profile, durable Run Event Logs, replay/views, semantic compaction, and Context-overflow recovery. The authoritative TypeScript product instead uses the selected TypeScript Kernel and trusted-local tools plus the accepted three-lane memory contract (ADR-0015): per-run append-only sealed Run Archives with hash-chain integrity and zero-effect `:runs`/`:replay`, an append-only supersedes-only Retrospective Ledger, and a version-controlled Runbook bound by revision into each run. Checkpoint/resume across processes, compaction, overflow recovery, paid call/cost budgets, domain evaluators, and OS isolation remain open. Those differences are visible limits, not equivalence claims.
