# TypeScript/Pi General Agent Working Stack tracer bullet

Status: WorkOrder #23 tracer bullet, independently accepted and landed at `4ebf660` ([Verdict](https://github.com/pym96/Pan-agent/issues/23#issuecomment-5492593755)). WorkOrder #25's candidate adds the three-lane memory contract (ADR-0015) on top; it is pending independent review and is documented in the divergence section below.

## Decision and scope

The Human/Master supersession on WorkOrder #23 makes a TypeScript/Pi General Agent Working Stack the active product direction and retains the accepted Python #21 stack as a reference. This candidate delivers the smallest Human-usable vertical slice: one TUI, one persistent Pi session, one real DeepSeek Adapter, one deterministic Faux Adapter for tests, four Pi tools including a clearly labelled trusted-local shell, observable outcomes, and no Builder Provider call.

This WorkOrder does not implement #22 security isolation or #24 cutover. It does not delete, reorganize, or classify the Python implementation; import LangGraph; execute an evaluation matrix; create Evidence/VPF/Wiki/resume claims; or make a paid model call.

## Module and Interface

```text
Human TUI
    |
    | task / cancellation / normalized observations
    v
GeneralAgentSession Module
    |-- Pi Agent: loop + maintained full transcript + typed validation
    |-- PiModelAdapter Seam
    |      |-- DeepSeek Adapter (real, construction is offline)
    |      `-- Faux Adapter (deterministic tests)
    `-- AgentTool Seam
           |-- read / write / edit
           `-- trusted-local bash
                    |
                    `-- Pi NodeExecutionEnv Implementation
```

`GeneralAgentSession.runTask(task)` is the deep Module's primary Interface. The Module hides Pi event reduction, transcript ownership, tool correlation, cancellation, per-task accounting, and terminal classification. `cancel()`, `close()`, `isRunning`, and the retained Context message count complete the Human-session needs without exposing a second Agent loop.

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

One TUI process creates one `GeneralAgentSession`. Successive task prompts call the same Pi `Agent`; Pi retains the full user/assistant/ToolResult transcript and supplies it to the next exchange. The application installs no arbitrary message slicing, character cutoff, semantic compressor, or transcript rewrite. A 64-turn task ceiling stops runaway orchestration without deleting Context.

Every assistant message contributes a distinct model-settled observation containing public text, Provider/model/response identity when reported, stop reason, and usage. Thinking blocks are intentionally excluded from the display projection. Every ToolCall emits a start observation and every result emits a correlated settlement with `isError`; a nonzero shell exit therefore becomes an attributable error Observation that the Agent can react to, not a Harness crash.

Malformed parameters and unknown tool names are rejected by Pi before the selected Implementation can execute. Tools run sequentially. Ctrl-C delegates to `Agent.abort()`; Pi propagates the AbortSignal into `NodeExecutionEnv`, which terminates the active shell process tree and produces an explicit `cancelled` Run terminal.

## Trusted-local shell boundary

The shell intentionally answers the earlier no-shell product limitation: it can run code and configure a task environment from observations. It is equally intentionally not called safe or sandboxed.

- authority: current host user;
- default cwd: the Human-selected workspace;
- path containment: none; Pi read/write/edit and shell may address absolute paths;
- process/network isolation: none;
- child environment: explicit ordinary-variable allowlist, with Provider credentials omitted;
- cancellation: best-effort process-tree termination through Pi's Node Implementation.

The startup display, confirmation prompt, tool label, package README, and system prompt all repeat this boundary. Stronger workspace/path/network/process policy is deferred to #22; changing the authoritative implementation/default and Python classification is deferred to #24.

## Deterministic acceptance surface

`typescript/test/general-agent.test.ts` uses Pi's Faux Provider with no network or credentials and verifies through the public session Interface:

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

These tests establish deterministic candidate behavior only. They do not prove DeepSeek live quality, shell security, Context-window reliability, budget enforcement, benchmark performance, or independent acceptance.

## Deliberate divergence from the Python reference

The Python #21 stack remains unchanged and runnable. It has a bounded workspace/no-shell tool boundary, durable Run Event Logs, replay/views, semantic compaction, and Context-overflow recovery. This TypeScript tracer instead establishes the active Pi working stack and trusted-local shell. WorkOrder #25's candidate adds the three-lane memory contract (ADR-0015): per-run append-only sealed Run Archives with hash-chain integrity and zero-effect `:runs`/`:replay` inspection, an append-only supersedes-only Retrospective Ledger linked to sealed archive identities, and a version-controlled Runbook whose content-hash revision is resolved per run and bound into each archive; durable replay and memory persistence are therefore no longer absent, while checkpoint/resume across processes, compaction, overflow recovery, call/cost budgets, domain evaluators, and OS isolation remain open. Those differences are visible product limits, not hidden equivalence claims.
