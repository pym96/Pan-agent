# Behavioral Eval Runtime v0 implementation

- Status: Working Agent candidate; pending independent WorkOrder #9 Regulator review
- Date: 2026-08-27
- Design authority: accepted [`agent-loop-behavioral-eval-v0.md`](agent-loop-behavioral-eval-v0.md) and [`ADR-0014`](../adr/0014-evented-agent-loop-and-behavioral-eval.md)
- Scope: deterministic local implementation only; no Provider, network, external benchmark, or result-promotion authority

## Delivered boundary

`workspace_agent_harness.behavioral_eval` adds one Behavioral Eval campaign Module above the existing evented Runtime. It does not implement a second Agent loop:

```text
frozen 12-case manifest
        |
        v
BehavioralEvalCampaign
        |
        +-- Domain Environment + typed local Tool Adapters
        +-- deterministic ModelGateway
        |
        v
existing AgentLoop.run(Task, RunLimits)
        |
        v
run-event/v1 logs ----> protected exact oracle ----> deterministic report
        |
        +-------------------------------------------> zero-call reconstruction
```

Every original Run crosses the same `AgentLoop.run(...)`, `ModelGateway.exchange(...)`, Context projector, admission, Canonical History, tool execution, terminal settlement, and `JsonlRunEventLog` path used by the Python TUI. The evaluator is a consumer after terminal settlement. It cannot admit candidates, execute tools, mutate Runtime state, or change the Runtime terminal status.

## Frozen manifest and preflight

The shipped lock is [`agent-loop-behavioral-eval-v0.json`](../../workspace_agent_harness/benchmark_configs/agent-loop-behavioral-eval-v0.json), with suite identity:

```text
sha256:026543baf0a1d48d640b695ee21c7aaab5713e75cef437024a48fb0e66f180f8
```

It contains the accepted ordered case set `IA-01..03`, `DO-01..03`, `RC-01..03`, and `SA-01..03`, exactly three cases in each family. Each case content-hashes its prompt, visible inputs, protected initial fixture, closed tool schemas, deterministic transition table, protected oracle, terminal rule, fixed limits, and policy identities.

Loading fails closed on unknown fields, case count/order/identity drift, family distribution drift, missing oracle criteria, non-local or network-capable tools, open or malformed parameter schemas, limit drift, policy identity drift, and any request to collect or score reasoning prose. The configured manifest identity is checked after semantic validation. The campaign then compares the supplied immutable manifest object with a freshly loaded lock before constructing the first Gateway, so an in-memory fixture or oracle replacement cannot reuse an old identity.

All v0 cases keep the accepted limits:

- four tool steps;
- five model exchanges;
- 30 seconds;
- one action per settled turn;
- zero protocol repair;
- at most one Context-overflow recovery.

## Typed Domain Adapter

The frozen tool definitions contain closed object schemas with all fields required, no additional properties, `local_only=true`, and `network_capability=false`. The existing `ActionTool` carrier from WorkOrder #4 has one string argument, so the Domain Adapter exposes one canonical-JSON `input` string to that unchanged Runtime seam and validates the decoded object against the frozen schema before any transition. This is a bounded schema bridge, not a relaxation: malformed JSON, missing/extra fields, or non-string v0 values become attributable Tool Adapter failures.

Expected task-level errors remain successful Runtime tool exchanges with typed, model-visible failure observations. For example, `not_found`, `conflict`, and `busy` enter Canonical History and permit a later ordinary model exchange. They do not become `tool_error`; only an Adapter defect or invalid typed input does.

The reference `ModelGateway` is credential-free and emits only observable tool calls or final dispositions. It receives the same bounded `PreparedModelTurn` as any other Gateway. Protected fixture and oracle objects are never added to the task prompt, tool descriptions, or Model Context.

## Oracle and failure attribution

The Domain evaluator consumes the protected initial fixture, the final Domain state, and committed Run events. It scores exact action order, tool outcomes, final state, and typed terminal disposition/reason code. Final prose is ignored.

Runtime status and evaluator verdict are separate fields:

| Layer | Report category |
|---|---|
| Gateway/Provider failure | `provider.failure` |
| candidate admission failure | `protocol.failure` |
| projection or Context overflow failure | `context.failure` |
| Tool Adapter failure | `tool.failure` |
| authority-policy behavioral failure | `policy.failure` |
| exact task-oracle failure | `task.failure` |
| budget, cancellation, or other Runtime failure | `runtime.failure` |
| evaluator exception | `evaluator.failure` |

A `completed` or `abstained` Run can therefore receive `failed`, while a Runtime failure receives `not_scored`. The report never relabels a Provider, protocol, Context, or Tool failure as a task failure merely to fill a denominator.

## Report and replay

The report retains every selected planned slot, case/family/content identity, exact denominator counts, family results, terminal and evaluator counts, failure attribution, tool sequence, model-visible tool failures, Run ID, Event IDs, Event Log path/hash, and compaction/overflow Event references.

The campaign constructs the landed `SemanticContextProjector` for every case with a verified 32,768-Token local window, 4,096-Token requested output room, frozen estimator/protocol overhead provenance, and the exact case tool-set identity. Every per-case projected policy hash is frozen in the manifest. These small reference tasks fit without proactive compaction, while a classified overflow still reaches #8's one semantic compact-and-retry path.

`stable_summary_json()` deliberately excludes Run/Event identities, Event Log locators/hashes, and timing while keeping semantic case outcomes and Context event types. With deterministic Gateway, tools, Run IDs, and clocks, the current full reference report is byte-stable as well; callers must rely only on the documented stable summary contract.

`reconstruct_behavioral_eval_report(...)` validates the Event Log hash/sequence/causal chain, replays only the pure frozen transition reducer for completed retained tool events, verifies each retained observation, and re-runs the protected oracle. It constructs neither a `ModelGateway` call nor a Tool Adapter call.

## Explicit limits

The 12/12 deterministic reference result proves the test harness and reference scripts agree with their frozen exact oracles. It is not a model-quality result, a comparison between `observation-feedback-v0` and `act-once-v0`, a SWE-bench/PinchBench score, or evidence for any public claim. Real-Provider repetitions and causal comparison remain WorkOrder #11 scope. TUI navigation remains #10; durable recovery and later features remain #12–#16.
