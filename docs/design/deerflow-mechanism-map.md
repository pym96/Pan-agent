# DeerFlow Mechanism Map

Status: Working Agent design evidence; not accepted architecture and not an implementation claim.

## Inspection boundary

- Read-only checkout: `../../30-已有资产与参考/工具与方法参考/deer-flow/`
- Pinned commit: `88252e9b318d34e7e1867155ad2c77993320788e`
- Inspected orientation: `AGENTS.md`, `backend/AGENTS.md`, and `backend/README.md`
- Inspected implementation entry points:
  - `backend/packages/harness/deerflow/agents/lead_agent/agent.py`
  - `backend/packages/harness/deerflow/runtime/runs/manager.py`
  - `backend/packages/harness/deerflow/sandbox/sandbox.py`
  - `backend/packages/harness/deerflow/skills/catalog.py`
  - `backend/packages/harness/deerflow/subagents/executor.py`

The map records mechanism evidence only. No DeerFlow code, type, prompt, middleware list, or dependency is copied into this repository.

## Decision rule

- **Adopt now** means preserve the problem-solving principle in a smaller local Interface.
- **Defer** means the mechanism may become useful after both proof domains pass the same Runtime contract.
- **Reject for this design** means it does not belong in the current General Runtime seam; it may still be valid for DeerFlow's product boundary.

## Mechanism map

| Concern | DeerFlow source and observed mechanism | Problem it solves | Decision | Smaller local Interface | Intentional omissions |
|---|---|---|---|---|---|
| Run lifecycle | `runtime/runs/manager.py`: `RunRecord`, atomic admission, pending/running/terminal transitions, cancellation, persistence retry, leases, and orphan reconciliation | Keeps concurrent and durable runs attributable across workers and failure races | **Adopt now**: explicit admission boundary, one terminal `RunResult`, and attributable lifecycle errors. **Defer**: durable multi-worker ownership. | `GeneralAgentRuntime.create(...)`; `runtime.run(RunRequest) -> RunReport`; internal lifecycle state machine | Database rows, thread multitask strategies, leases, heartbeats, remote cancellation, orphan takeover, and Gateway-specific delivery receipts |
| Ordered cross-cutting behavior | `agents/lead_agent/agent.py`: `build_middlewares()` composes a strict order for context, skills, policy, budgets, terminal handling, and clarification | Ordering-sensitive concerns otherwise leak into the agent factory and become inconsistent | **Adopt now** as private Runtime stages with declared ordering invariants; **reject** a public arbitrary-middleware extension point | Internal `admit -> prepare -> execute -> finalize -> evaluate` pipeline behind `run` | LangChain middleware types, extension-contributed middleware, title/vision/clarification behavior, and configurable reordering |
| Skills and guidance | `skills/catalog.py`: immutable searchable catalog; `agent.py`: skill activation and skill-tool policy are separate stages | Makes guidance discoverable without granting every tool or loading every instruction eagerly | **Adopt now**: pack guidance is versioned content and never an authority source. **Defer** discovery and activation. | `DomainPack.compile(TaskEnvelope) -> DomainCase`; `DomainCase.guidance`; capability requests resolved by Runtime policy | Search ranking, slash activation, deferred loading, per-user skill stores, skill installation, and LLM-selected packs |
| Sandbox / workspace | `sandbox/sandbox.py`: replaceable command and file Interface with local and remote adapters described in `backend/AGENTS.md` | Separates agent-visible paths and execution from host storage | **Adopt now**: an internal workspace Adapter and protected evaluator/fixture roots. **Defer** OS/process isolation. | Local-substitutable `WorkspaceFactory` and tool Adapters hidden behind Runtime; pack sees logical fixture references, not host paths | Docker/Kubernetes/AIO providers, arbitrary bash, uploads, binary artifacts, virtual mount compatibility, and remote provisioning |
| Memory | `agent.py` plus `backend/AGENTS.md`: optional middleware or tools inject and update durable user memory | Retains user context across conversations | **Reject for this design**: it is unrelated to the cross-domain generality proof and risks hidden state contamination | Run-local state only; future checkpoint state must be explicit in `RunRequest`/Trace provenance | User profiles, fact extraction, global summaries, debounced writes, and memory tools |
| Subagents | `subagents/executor.py`: tool filtering, isolated event-loop execution, explicit terminal status, cooperative cancellation, token accounting, and parent trace correlation | Delegates concurrent work while keeping status and resource use visible | **Defer** until a single agent passes both proof domains; it is not evidence of a real Domain Pack seam | No public subagent Interface in ADR-0009 | Background registries, thread pools, delegated agents, concurrency limits, parent/child trace trees, and partial-result recovery |
| Persistence and recovery | `runtime/runs/manager.py`: optional `RunStore`, bounded retry, status fencing, and ownership-aware writes | Makes run state survive restarts without stale writers overwriting terminal outcomes | **Adopt now**: trace/checkpoint storage as an internal replaceable Adapter and explicit failure attribution. **Defer** distributed durability. | Local-substitutable `TraceStore` / future `CheckpointStore` internal seams, exercised through `run` | SQL stores, retry taxonomy, worker fencing, checkpoint channel modes, multi-process consistency, and migrations |
| Policy and authority | `agent.py`: assembly-time tool authorization; `backend/AGENTS.md`: execution-time authorization/guardrail and sandbox audit | Prevents visible or requested tools from bypassing operator authority | **Adopt now**: fail-closed capability resolution plus execution-time enforcement. Pack defaults and guidance may only narrow authority. | `effective_authority = host_grant ∩ request_grant ∩ pack_ceiling`; Runtime maps allowed capability IDs to internal tool Adapters | RBAC roles, OAuth identity, external guardrail providers, MCP authorization, webhook-specific policy, and command-risk heuristics |
| Trace / observability | `agent.py`: callbacks attached at the graph invocation root; `backend/AGENTS.md`: request correlation and root trace metadata | Produces one correlated trace instead of disconnected or duplicated model/tool spans | **Adopt now**: one Runtime-owned event stream with pack identity/version/hash and separate Runtime/domain namespaces. **Defer** vendor exporters. | `RunReport.trace_ref`; Runtime-only `runtime.*` events; validated `domain.<pack-id>.*` events | LangSmith, Langfuse, Monocle/OpenTelemetry, HTTP correlation headers, callbacks, and external dashboards |

## Local consequences

1. DeerFlow's breadth argues for keeping our external Runtime Interface smaller, not for importing its public surface.
2. Policy enforcement must occur both when tools are made available and immediately before execution. Guidance text is never parsed as authority.
3. Evaluator and fixture access belongs to the protected control path after the terminal `RunResult`; neither is mounted in the agent-writable workspace.
4. Trace correlation starts at the Runtime run root. Pack identity and hash are provenance, while domain events remain distinguishable from Runtime lifecycle events.
5. Memory, subagents, remote sandboxes, vendor tracing, and multi-worker persistence do not contribute to the first Generality Proof and stay out of ADR-0009.

## Source-path correction

Earlier drafts used `../../../../30-已有资产与参考/工具与方法参考/deer-flow/` from the repository root. That path is invalid. The reproducible repository-relative locator is `../../30-已有资产与参考/工具与方法参考/deer-flow/`.
