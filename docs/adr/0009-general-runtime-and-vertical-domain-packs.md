# ADR-0009: Place the domain seam behind one General Agent Runtime

- Status: Accepted
- Date: 2026-08-18
- Decision owner: human direction in HF-20260813-011; repository conformance pending independent Regulator review

## Context

The accepted implementation baseline contains a bounded `AgentLoop`, explicit execution terminal states, a JSONL Trace boundary, and tests with replaceable fake model/tool Adapters. It does not contain a General Agent Runtime, Vertical Domain Pack Interface, cross-domain evaluation, policy enforcement, or proof of generality.

The current product direction requires one Runtime to support two materially different domains without editing Runtime source for each domain:

- `data-analysis`, with structured-data capabilities and an exact artifact evaluator;
- `workspace-coding`, with repository mutation, a declared test command, hidden tests, and diff policy.

The design must keep Runtime lifecycle, budgets, authority, Trace, workspace, and evaluation ordering local while preventing pack guidance from becoming an authority source. It must also avoid importing DeerFlow's product breadth or committing the first implementation to a marketplace, remote sandbox, subagents, memory, or distributed persistence.

## Decision

If accepted, the project will expose one deep `GeneralAgentRuntime` Module:

```python
runtime = GeneralAgentRuntime.create(config=..., adapters=..., packs=[...])
report = runtime.run(RunRequest(pack=exact_pack_selector, task=..., authority=...))
```

Packs are registered and frozen at the composition root. Runtime validates each pack at creation and selects it by exact ID, version, and content hash for every run. Dynamic installation, hot reload, and implicit `latest` selection are outside this decision.

A Vertical Domain Pack supplies one immutable manifest plus:

```python
compile_task(raw_task) -> DomainRunSpec
evaluate(EvaluationEvidence) -> EvaluationVerdict
```

`DomainRunSpec` has two projections. The agent projection contains only the goal, guidance, requested capabilities, visible inputs, and expected artifacts. The control projection contains protected fixture and evaluator references and never reaches the model or agent tools.

Runtime owns the non-skippable order from exact pack selection through task compilation, authority resolution, admission, workspace staging, bounded Agent execution, terminalization, artifact freezing, protected evaluation, and final report creation.

Execution and domain success remain separate:

- exactly one `RunResult` records the terminal execution outcome;
- one `EvaluationRecord` records `passed`, `failed`, `error`, or `not_run`;
- `RunReport.passed` is true only when execution succeeded and evaluation passed.

Effective authority is always the intersection of the Runtime ceiling, caller grant, pack ceiling, and compiled task restrictions. Pack guidance, model output, task prose, evaluator output, and domain events cannot grant authority. Runtime filters capabilities during assembly and rechecks the canonical resource before every tool call.

Runtime alone writes `runtime.*` Trace events and sequence numbers. Pack events use validated `domain.<pack-id>.*` names. The Trace pins pack version/hash and keeps execution, policy, tool, Runtime, and evaluator failures attributable.

## Seam placement

The external seam is above pack selection and the complete run/evaluate lifecycle. CLI, product code, and tests cross the same `GeneralAgentRuntime.run` Interface.

The Domain Pack seam is inside Runtime creation and run preparation. The two proof packs are the two concrete Adapters that make this seam real. Runtime depends only on the pack Interface and must not import either concrete vertical pack.

Model provider variation remains a true-external internal port. Workspace, fixture, Trace, and future persistence variation remain private Runtime seams; they are not exposed as caller-controlled lifecycle hooks.

## Alternatives

### Pass a pack object to every run

Rejected because pack construction, validation, version selection, and evaluator binding would spread across callers. A mutable or replaced object could also break the identity relation between execution and evaluation.

### Expose compile, validate, install, execute, and evaluate as five public methods

Deferred because it gives callers a skippable ordering contract and requires candidate storage, validation receipts, policy epochs, and atomic installation before a real operator/marketplace use case exists. Content addressing is retained; the operator workflow is not yet a public Module.

### Use a CLI-first locked task registry as the core Interface

Rejected as the core seam because it would freeze task-ref syntax, pack build/install commands, lock-file behavior, and single-source positional conventions too early. A CLI may later translate its shorthand into the typed `RunRequest` without changing Runtime.

### Put CSV and coding branches inside Runtime

Rejected because it fails the source-edit invariant, duplicates domain logic in the execution core, and makes tests pass without proving a real pack seam.

### Give packs lifecycle hooks or arbitrary middleware

Rejected because packs could reorder or bypass policy, Trace, terminalization, or evaluation. It would expose Runtime Implementation instead of a deep Interface.

## Scope

This decision includes:

- exact startup-time pack registration and selection;
- a typed pack manifest and task compilation contract;
- agent/control projection separation;
- capability requests and authority intersection;
- one public blocking `run` call;
- one execution result plus one separate domain evaluation record;
- Runtime/domain Trace namespaces and pack provenance;
- `data-analysis` and `workspace-coding` as the only proof domains;
- failing contract tests at the proposed external seam.

This decision excludes:

- implementation before independent design acceptance;
- real provider, CLI, UI, memory, subagents, or arbitrary workflows;
- dynamic pack installation, marketplace, hot reload, or untrusted-pack sandboxing;
- arbitrary shell, browser/computer use, remote sandbox, multi-user or multi-worker operation;
- durable checkpoint/recovery, remote persistence, streaming, or cancellation Interface;
- a third domain or a general-agent implementation claim;
- benchmark campaign orchestration or an official PinchBench compatibility claim; those concerns are proposed separately in ADR-0010 above the Runtime seam;
- any reality-resume or factual-ledger change.

## Migration

1. Preserve the accepted 15-test baseline as characterization Evidence.
2. Add expected-red contract tests for pack interchangeability and authority/evaluator isolation without changing Runtime source.
3. After independent acceptance, add `GeneralAgentRuntime` as a façade around the existing `AgentLoop` rather than rewriting loop control first.
4. Move task prompt construction to pack task compilation and wrap selected tools with Runtime authority enforcement.
5. Move Trace ownership and path allocation out of the `AgentLoop` constructor while retaining a legacy JSONL Adapter for old tests.
6. Add protected workspace staging, artifact freezing, and the two deterministic evaluators outside AgentLoop.
7. Make both proof packs pass the same Runtime contract with the same model/runtime configuration.
8. Only after the new contract is stable, decide whether the old public `AgentLoop` becomes a deprecated compatibility Adapter or is removed.

If this ADR is accepted, it supersedes ADR-0008's assumption that one Local Workspace Agent is the sole product boundary. ADR-0008 remains a historical task/evaluation source for the `workspace-coding` pack. ADR-0002's single-user local-first deployment boundary and ADR-0004/0005's isolation intent remain compatible, subject to this ADR's updated product language.

## Consequences

- Callers learn a small Interface and cannot skip evaluation or policy stages.
- Adding a pack changes composition and pack code, not Runtime source.
- Pack authors gain a stronger contract but must separate agent-visible and protected control material.
- Runtime becomes responsible for pack provenance, authority algebra, ordering, and failure attribution.
- In-process pack code remains operator-trusted; this design does not claim protection from malicious pack implementation code.
- Freezing packs at creation sacrifices hot reload for reproducibility and stable evaluation binding.
- Artifact freezing and protected evaluation add local I/O, which is accepted in exchange for agent-immutable verdicts.
- Existing `RunStatus.SUCCEEDED` remains execution success only; recruitment or benchmark claims must use domain evaluation Evidence instead.
- Runtime reports must preserve usage availability for later campaign aggregation, but campaign versioning, repetitions, eligibility, and score aggregation remain outside Runtime.

## Acceptance evidence required

An independent Regulator must inspect the primary design and DeerFlow references, add or rerun negative tests, and reject this ADR unless:

1. the Interface defines methods plus invariants, ordering, errors, configuration, and performance limits;
2. both proof domains make the seam materially real;
3. guidance and task payloads cannot widen authority;
4. evaluator/fixture controls remain outside the writable workspace;
5. Runtime, policy, tool, and evaluator failures are distinguishable;
6. contract tests cross the same seam intended for callers and are expected-red before implementation;
7. no DeerFlow code or capability claim was copied;
8. no project or resume fact was promoted by this design handoff.

## Detailed design

- [`../design/general-vertical-system.md`](../design/general-vertical-system.md)
- [`../design/proof-domains.md`](../design/proof-domains.md)
- [`../design/deerflow-mechanism-map.md`](../design/deerflow-mechanism-map.md)
- [`0010-external-and-vertical-evaluation-lanes.md`](0010-external-and-vertical-evaluation-lanes.md)
