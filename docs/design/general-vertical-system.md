# General Runtime and Vertical Domain Packs

Status: Human-accepted architecture; the ordinary Runtime/Campaign and two bounded seed paths passed a separate same-model Regulator review within the operator-trusted Pack boundary. High-risk security claims, malicious-process resistance, project facts, and resume disclosure remain unaccepted.

Historical design-gate marker, closed by HF-20260819-021: `状态：待 Working Agent 完成，未验收。` It is retained only for migration-validator compatibility and does not describe the current phase.

## Decision snapshot

Use one deep **General Agent Runtime** Module with two caller entry points:

```python
runtime = GeneralAgentRuntime.create(
    config=runtime_config,
    adapters=runtime_adapters,
    packs=[data_analysis_pack, workspace_coding_pack],
)

report = runtime.run(
    RunRequest(
        pack=PackSelector("data-analysis", "1.0.0", "sha256:..."),
        task={"case_id": "paid-revenue-by-region"},
        authority=caller_grant,
        limits=RunLimitOverrides(),
    )
)
```

Packs are registered, validated, fingerprinted, and frozen at Runtime creation. A run selects one exact `pack_id/version/content_hash`; callers never pass a live pack object into `run`, and there is no implicit `latest` selection.

The **Vertical Domain Pack** Interface has one immutable manifest and two behavioral entries:

```python
class VerticalDomainPack(Protocol):
    manifest: PackManifest

    def content_material(self) -> JsonValue: ...

    def compile_task(self, raw_task: JsonValue) -> DomainRunSpec: ...

    def evaluate(self, evidence: EvaluationEvidence) -> EvaluationVerdict: ...
```

The Runtime owns ordering. Callers cannot separately invoke admission, policy resolution, workspace staging, the Agent loop, artifact freezing, evaluation, or terminalization.

## Problem and callers

The Module must let three callers use one Interface:

1. a future CLI that selects a pack and submits a bounded task;
2. product/integration code that executes the same request shape;
3. contract tests that use the same external seam with local stand-ins for true external dependencies.

Pack authors need a stable seam for domain task contracts, guidance, requested capabilities, policy restrictions, fixtures, and deterministic evaluation. They must not learn or receive Runtime lifecycle collaborators, provider credentials, Trace writers, checkpoint stores, or unrestricted host paths.

The dependency categories are:

- packs: in-process and operator-trusted for v1;
- workspace and fixtures: local-substitutable;
- model provider: true external;
- current Trace storage: local-substitutable;
- future owned remote persistence: remote-owned and deferred until a real second Adapter exists.

## Interface alternatives

验收边界：至少比较两种不同的 Interface 形态；本候选实际比较以下三种，并在比较后综合选择。

### Alternative A: pass a pack on every run

```python
runtime.run(request, pack) -> RunReport
```

This has the fewest symbols and makes ad hoc testing easy. It hides the execution pipeline, but it makes every caller responsible for pack construction and lets validation, version selection, and hashing drift across call sites. A mutable or replaced pack object can also make execution and later evaluation refer to different content. The Interface is small but its locality is weak, so this alternative is rejected.

### Alternative B: expose the full pack lifecycle

```python
harness.compile_pack(source)
harness.validate_pack(candidate)
harness.install_pack(candidate, receipt)
harness.execute(request)
harness.evaluate(run_ref)
```

This shape gives strong content-addressing, stale-validation, and installation semantics. Each stage does real work, but callers must learn and preserve the correct order and can omit evaluation. It also commits the first implementation to a candidate store, validation receipts, policy epochs, atomic installation, and evaluator replay Interface before the two proof packs exist. Those concerns may become a separate operator Module later; exposing them now would reduce Depth at the Runtime seam. This alternative is deferred, not rejected permanently.

### Alternative C: locked task registry optimized for CLI use

```python
runtime = Runtime.open("harness.toml")
report = runtime.run("data-analysis/paid-revenue", Path("orders.csv"))
```

This gives the common caller an excellent shorthand and centralizes pack selection. Its cost is that task registry, pack build/install, lock-file resolution, single-input positional sugar, and filesystem configuration become product commitments immediately. The useful part is startup-time pack compilation and exact selection; the task-ref shorthand can be layered into a CLI after the typed Python Interface is stable.

### Comparison and synthesis

Alternative A has the smallest method count but leaks composition responsibility. Alternative B has the strongest future supply-chain story but exposes lifecycle ordering and premature operator state. Alternative C has the easiest common call but makes registry/CLI choices part of the core seam.

The selected Interface combines A's single deep execution call with C's startup-time frozen registry. It takes B's exact identity and immutable evaluation binding, while deferring dynamic compile/install/receipt methods. This concentrates change in the Runtime, gives callers a small correct-by-construction surface, and leaves pack packaging replaceable behind `create`.

## Selected Runtime Interface

The target types below are an Interface contract, not current source.

```python
@dataclass(frozen=True)
class PackSelector:
    pack_id: str
    version: str
    content_hash: str


@dataclass(frozen=True)
class RunRequest:
    pack: PackSelector
    task: JsonValue
    authority: AuthorityGrant
    limits: RunLimitOverrides = RunLimitOverrides()
    metadata: Mapping[str, JsonScalar] = field(default_factory=dict)


class GeneralAgentRuntime:
    @classmethod
    def create(
        cls,
        *,
        config: RuntimeConfig,
        adapters: RuntimeAdapters,
        packs: Sequence[VerticalDomainPack],
    ) -> "GeneralAgentRuntime": ...

    def run(self, request: RunRequest) -> RunReport: ...
```

`create` is the v1 installation boundary: the operator composition root supplies packs; Runtime validates unique identity, Interface version, declared resources, evaluator identity, and content hash, then freezes registration records. Each repository-local Pack exposes canonical `content_material()`; Runtime hashes that material together with inspectable class/module source and rejects a declared/recomputed mismatch. Runtime clones `compile_task`, `evaluate`, and same-module helper functions into a private globals snapshot used by the registered execution path; later live module-global rebinding cannot change that frozen path. Before every run it also revalidates the exact manifest digest, Pack content, and original bound methods, so post-creation instance drift fails before admission. This is reproducibility validation for operator-trusted Pack code, not a malicious-code sandbox. There is no runtime hot reload, network installation, marketplace, or mutable `latest` pointer.

### Configuration and external Adapters

```python
@dataclass(frozen=True)
class RuntimeConfig:
    interface_version: int
    authority_ceiling: AuthorityGrant
    default_limits: RunLimits
    hard_limits: RunLimits
    control_root: Path
    workspace_root: Path
    trace_schema_version: int
    evaluator_limits: EvaluatorLimits


@dataclass(frozen=True)
class RuntimeAdapters:
    model: ModelAdapter
    capabilities: Mapping[str, Tool]
    workspaces: WorkspaceFactory | None = None
    traces: TraceStore | None = None
```

`control_root` and `workspace_root` must resolve to disjoint canonical roots. The default local workspace and JSONL Trace Adapters use those roots; contract tests use real temporary roots, while a caller may inject another local-substitutable Adapter without changing `run`. Credentials are owned by concrete Adapters and never enter pack data, model context, or Trace. A future `CheckpointStore` or remote persistence port stays private until recovery is accepted and two real Adapters justify that seam.

Every Runtime Model, Tool, and Workspace Adapter must expose canonical, secret-free `identity_material()`. It includes behavior-affecting configuration such as provider/model name, endpoint profile, temperature, retry policy, tool configuration, or fixture digests, while excluding credentials and mutable counters. Runtime hashes the explicit material with inspectable implementation source and revalidates it before every run; an absent declaration or post-creation configuration drift fails before admission. Heuristic scans of public/private `__dict__` state are not provenance.

Callers may request smaller limits, never larger ones. Effective limits are resolved per field and capped by `RuntimeConfig.hard_limits`. Pack defaults are recommendations; a pack cannot select a model/provider, enable network, inject credentials, change Trace schema, or override evaluator limits.

### Run report and success semantics

```python
@dataclass(frozen=True)
class RunReport:
    pack: PackSelector
    initial_fixture: ProtectedFixtureRef
    result: RunResult
    evaluation: EvaluationRecord
    usage: RunUsage
    artifacts: ArtifactSnapshotRef
    trace: TraceRef
    provenance: RuntimeProvenance

    @property
    def passed(self) -> bool:
        return (
            self.result.status is RunStatus.SUCCEEDED
            and self.evaluation.status is EvaluationStatus.PASSED
        )
```

`RunResult` remains the one explicit terminal execution result. `SUCCEEDED` means the bounded Agent execution produced a final response; it does not mean the domain task passed. `EvaluationRecord` is separate:

```python
class EvaluationStatus(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    NOT_RUN = "not_run"


@dataclass(frozen=True)
class EvaluationRecord:
    status: EvaluationStatus
    evaluator: EvaluatorIdentity
    checks: tuple[CheckResult, ...]
    measurements: Mapping[str, JsonScalar]
    error: FailureAttribution | None = None
```

A wrong artifact can therefore produce `RunStatus.SUCCEEDED` plus `EvaluationStatus.FAILED`. An evaluator crash produces `EvaluationStatus.ERROR` without rewriting the execution result. `RunReport.passed` is the only combined convenience result.

`RunUsage` is Runtime-owned observation data for evaluation callers. It records wall time, model requests, tool calls, provider-reported Token fields, and observed cost plus its source. Missing provider data stays `None`, never zero. The accepted historical `ModelAdapter.respond(...) -> str` can be wrapped with unknown usage during migration; a real provider Adapter must return structured response and usage data before Token or cost Claims are allowed.

## Selected Domain Pack Interface

### Manifest

```python
@dataclass(frozen=True)
class PackManifest:
    interface_version: int
    identity: PackSelector
    task_schema: JsonSchemaRef
    required_runtime_features: frozenset[str]
    guidance_resources: tuple[ResourceDigest, ...]
    requested_capabilities: tuple[CapabilityRequirement, ...]
    authority_ceiling: AuthorityRequest
    fixture_resources: tuple[ResourceDigest, ...]
    evaluator: EvaluatorIdentity
```

Authority values are capability-scoped and use logical resource selectors, not host paths:

```python
@dataclass(frozen=True)
class CapabilityGrant:
    capability_id: str
    resources: tuple[str, ...]
    constraints: Mapping[str, JsonScalar] = field(default_factory=dict)


@dataclass(frozen=True)
class AuthorityGrant:
    capabilities: tuple[CapabilityGrant, ...]


@dataclass(frozen=True)
class CapabilityRequirement:
    capability_id: str
    required: bool
    resources: tuple[str, ...]
    constraints: Mapping[str, JsonScalar] = field(default_factory=dict)


@dataclass(frozen=True)
class AuthorityRequest:
    capabilities: tuple[CapabilityRequirement, ...]
```

`pack_id` and `version` are human-readable; `content_hash` is the reproducibility identity and covers the canonical Pack material, class/module implementation source, task contract, capability declarations, fixtures, and evaluator resources. The Pack's `EvaluatorIdentity.content_hash` is bound to that exact bundle hash so evaluator helper, hidden-case, public-fixture, or AST-policy changes cannot preserve the old evaluator identity. Runtime recomputes the Pack digest at registration and before each run; Trace/reports pin the exact hash.

An in-process pack is operator-trusted code. The v1 authority claim applies to guidance, model actions, task payloads, and bound tools; it does not claim to sandbox a malicious Python pack implementation.

### Task compilation

```python
@dataclass(frozen=True)
class DomainRunSpec:
    task_id: str
    normalized_task: JsonValue
    agent: AgentProjection
    control: ControlProjection
    authority_request: AuthorityRequest
    limit_defaults: RunLimits | None


@dataclass(frozen=True)
class AgentProjection:
    goal: str
    guidance: tuple[GuidanceRef, ...]
    requested_capabilities: tuple[str, ...]
    visible_inputs: tuple[FixtureMount, ...]
    expected_artifacts: tuple[ArtifactContract, ...]


@dataclass(frozen=True)
class ControlProjection:
    fixture: ProtectedFixtureRef
    evaluator: EvaluatorIdentity
    protected_checks: tuple[ProtectedCheckSpec, ...]
```

`compile_task` validates and normalizes one raw task. It must be deterministic for the same task and pack content, perform no model/network call, read no credential, and mutate no workspace. Only `AgentProjection` can reach model context or tool descriptions. `ControlProjection` stays in the Runtime control path.

### Domain evaluation

```python
@dataclass(frozen=True)
class EvaluationEvidence:
    task_id: str
    pack: PackSelector
    execution: RunResult
    initial_fixture: ReadOnlySnapshotRef
    final_artifacts: ReadOnlySnapshotRef
    trace: ReadOnlyTraceRef


@dataclass(frozen=True)
class EvaluationVerdict:
    passed: bool
    checks: tuple[CheckResult, ...]
    measurements: Mapping[str, JsonScalar]
```

Runtime calls `pack.evaluate` only after closing tool execution and freezing artifacts. It attempts evaluation for every terminal execution whose artifact snapshot can be frozen, including policy, timeout, and budget Bad Cases; `RunReport.passed` remains false unless execution itself succeeded. If no trustworthy snapshot can be produced, evaluation is `NOT_RUN` with an attributable reason. Evaluation receives artifact/Trace references, not the agent workspace, Model Adapter, agent tools, secrets, policy mutators, or Trace writer. The local implementation runs the trusted evaluator in a separate `fork` process, enforces output size before transfer, and terminates/kills the process on timeout so it cannot continue late side effects. This process boundary is not a general malicious-code or OS sandbox. Runtime converts evaluator exceptions, invalid output, timeout, or resource exhaustion into `EvaluationStatus.ERROR`.

## Pack lifecycle through the Interface

- **Install:** explicit pack registration at `GeneralAgentRuntime.create`; dynamic installation is deferred.
- **Validate:** Runtime validates identity, hash, Interface version, resources, task schema, evaluator binding, unique IDs, and required Runtime features before returning an instance.
- **Select:** every `RunRequest` uses an exact `PackSelector`; an absent or mismatched hash is rejected before admission.
- **Execute:** one `run` method owns the full lifecycle and internally wraps the current `AgentLoop`.
- **Identify:** `PackSelector` appears in the Trace header, terminal execution event, `RunReport`, and evaluator record.
- **Evaluate:** Runtime invokes the evaluator bound to the selected frozen pack; callers cannot inject or swap one.

## Authority algebra

Pack policy is a restriction, never a grant:

```text
effective authority
  = Runtime host ceiling
  ∩ caller Run grant
  ∩ pack authority ceiling
  ∩ compiled task request/restrictions
```

There is no union or last-writer-wins override. A required capability outside the intersection rejects admission. An optional capability is omitted only when the pack declares a deterministic fallback. Guidance, task prose, model output, domain events, and evaluator output cannot alter authority.

Enforcement happens twice:

1. capability resolution exposes only allowed tools and normalized resource scopes;
2. every tool dispatch re-normalizes its concrete resource and checks the same immutable run-scoped authority before calling the underlying Adapter.

An execution-time violation becomes `RunStatus.POLICY_BLOCKED`; it is not reported as a tool crash. The denied Adapter is not invoked, and the Trace records the capability and canonical resource without secrets.

## Ordering and ownership

The Runtime owns this non-skippable order:

1. select the exact frozen pack;
2. validate task size and schema;
3. call `compile_task` and validate the returned `DomainRunSpec`;
4. resolve effective limits and authority;
5. reject unavailable required capabilities;
6. stage source material and protected fixture without exposing control paths;
7. admit the run, allocate `run_id`, and create a non-overwriting Trace;
8. emit a Runtime-owned start event containing pack version/hash;
9. construct model context from `AgentProjection` only;
10. run the bounded Agent loop with authorized tools;
11. produce exactly one terminal `RunResult` using first-terminal-wins semantics;
12. close tool execution and freeze the final artifact snapshot;
13. evaluate immutable Evidence in the protected control path;
14. write the evaluation record and return one `RunReport`.

Pre-admission failures raise typed errors and create no Run: invalid Runtime config, duplicate/invalid pack, exact pack not found, task contract error, unsatisfied capability, root overlap, or source-staging failure. After admission, provider, parse, tool, policy, timeout, budget, workspace, Trace, or internal failures converge to one attributable terminal `RunResult`; evaluator failures remain in `EvaluationRecord`.

The existing seven `RunStatus` values are preserved initially. Target additions are `POLICY_BLOCKED` and `RUNTIME_ERROR`; they remain design claims until implemented and independently accepted. Cancellation and durable recovery statuses are deferred with their mechanisms.

## Trace contract

- Runtime alone allocates sequence numbers and writes `runtime.*` lifecycle events.
- A pack may declare validated `domain.<pack-id>.*` event schemas; it cannot write `runtime.*` or terminal events.
- The start and terminal execution events include exact pack ID, version, hash, task ID, Trace schema, and effective-authority digest.
- Tool, policy, Runtime, and evaluator failures use distinct origin/code fields.
- Model-response and terminal records preserve structured usage fields and their availability; missing Token/cost data is explicit.
- Model output that resembles a Trace event is ordinary untrusted content.
- The execution terminal event occurs once before evaluation. Evaluation events follow it, and one report-completed event closes the new Trace schema.
- The existing Trace loader remains a historical-schema reader; migration must version the new order instead of silently changing schema 1.

## Dependency and Adapter strategy

The pack seam is real because `data-analysis` and `workspace-coding` are two materially different Adapters. Runtime must not import either concrete pack; only the composition root may depend on Runtime plus both packs.

The Model Adapter remains a true-external port with a real provider Adapter later and scripted Adapter in contract tests. The current `ModelAdapter.respond` can be wrapped during migration.

Workspace, fixture, Trace, and future checkpoint behavior use private internal seams. Tests use real temporary directories or local stand-ins and assert through `GeneralAgentRuntime.run`; these collaborators do not become test-only public methods. A remote persistence port is added only after a real owned remote implementation exists.

Tool implementations are capability Adapters. Runtime wraps each selected Adapter in an authority-enforcing tool; packs request stable capability IDs and never receive the raw catalog.

## AgentLoop migration

Current accepted facts remain limited to the bounded `AgentLoop`, replaceable fake model/tool Interfaces, seven terminal statuses, JSONL Trace behavior, and 15 tests.

- **Preserve:** bounded loop control, model-call/step/timeout budgets, action parsing initially, model/tool variation, and current terminal meanings.
- **Wrap:** `AgentLoop.run` inside Runtime admission, workspace, policy, artifact, and evaluation stages.
- **Split:** raw tool dispatch gains an authority wrapper; `_TraceWriter` becomes a Runtime recorder; task prompt construction moves to the selected pack projection.
- **Replace:** caller-supplied `trace_path`, arbitrary tool assembly, and `Task.prompt` as the product-level task contract.
- **Keep outside:** Domain Evaluator remains outside AgentLoop and cannot change loop terminal state.
- **Defer:** real provider, CLI, checkpoint/recovery, subagents, memory, remote sandbox, streaming, and distributed persistence until this design is accepted.

Existing tests remain characterization tests and cannot prove the new Interface. New contract tests cross `GeneralAgentRuntime.run`; no `run_for_test`, evaluator shortcut, or test-only public Interface is allowed.

## Proof domains and red tests

[`proof-domains.md`](proof-domains.md) freezes one bounded data-analysis case and one workspace-coding case, their capability requests, policy ceilings, and deterministic evaluators. The red contract tests require:

1. both packs through the same Runtime instance and `run` method;
2. exact pack identity/hash in report and Trace;
3. guidance that requests forbidden authority cannot expose or execute it;
4. traversal toward protected evaluator material is blocked without changing a sentinel;
5. execution success plus incorrect artifact yields failed evaluation;
6. evaluator error remains distinct from execution status;
7. evaluator time/output limits cannot rewrite the execution result;
8. Runtime Trace uses schema 2, pins Pack provenance, and orders one execution terminal event before evaluation.

The generic contracts now exercise the accepted external seam and are green; by themselves they cannot establish concrete proof Packs or implementation acceptance. The separate two-Pack integration and independent ordinary Regulator review provide those bounded checks, while high-risk security and fact gates remain separate.

## Evaluation campaigns stay above Runtime

[`benchmark-strategy.md`](benchmark-strategy.md) and accepted ADR-0010 place PinchBench compatibility and the 30-case vertical campaign in an external Evaluation Campaign Module. That Module receives an already-created Runtime and calls only `run`; it cannot inject an alternate evaluator, call tools directly, or add benchmark lifecycle methods to this Interface. PinchBench task translation and campaign aggregation therefore do not reduce Runtime Depth or create domain branches in Runtime source.

## DeerFlow attribution and omissions

[`deerflow-mechanism-map.md`](deerflow-mechanism-map.md) records the fixed commit, inspected paths, borrowed problems, smaller local Interfaces, and intentional omissions. The reproducible checkout path from the repository root is `../../30-已有资产与参考/candidate-projects/deer-flow/` at commit `88252e9b318d34e7e1867155ad2c77993320788e`.

No DeerFlow code was copied. LangGraph, middleware extension, dynamic skill discovery, memory, subagents, Gateway, vendor tracing, remote sandboxing, multi-worker leases, and marketplace installation are deliberately absent from this design.
