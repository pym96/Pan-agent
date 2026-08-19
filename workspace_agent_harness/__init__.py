from __future__ import annotations

import json
import hashlib
import inspect
import multiprocessing
import os
import re
import signal
import time
import types
import uuid
from dataclasses import dataclass, field, fields, is_dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from types import MappingProxyType
from typing import Any, Callable, Mapping, Protocol, Sequence, cast


class RunStatus(StrEnum):
    SUCCEEDED = "succeeded"
    MODEL_ERROR = "model_error"
    PARSE_ERROR = "parse_error"
    TOOL_ERROR = "tool_error"
    STEP_LIMIT = "step_limit"
    TIMEOUT = "timeout"
    BUDGET_EXCEEDED = "budget_exceeded"
    POLICY_BLOCKED = "policy_blocked"
    RUNTIME_ERROR = "runtime_error"


@dataclass(frozen=True)
class Task:
    task_id: str
    prompt: str


@dataclass(frozen=True)
class RunLimits:
    max_steps: int
    max_model_calls: int
    timeout_seconds: float


@dataclass(frozen=True)
class RunResult:
    run_id: str
    task_id: str
    status: RunStatus
    output: str | None
    steps: int
    model_calls: int
    error: str | None = None


@dataclass(frozen=True)
class PackSelector:
    pack_id: str
    version: str
    content_hash: str

    def __post_init__(self) -> None:
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", self.pack_id):
            raise ValueError("pack_id must use lowercase letters, digits, and hyphens")
        if not self.version:
            raise ValueError("pack version cannot be empty")
        _validate_sha256(self.content_hash, field_name="pack content_hash")


@dataclass(frozen=True)
class CapabilityGrant:
    capability_id: str
    resources: tuple[str, ...]
    constraints: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.capability_id:
            raise ValueError("capability_id cannot be empty")
        object.__setattr__(self, "resources", tuple(self.resources))
        object.__setattr__(
            self, "constraints", MappingProxyType(dict(self.constraints))
        )


@dataclass(frozen=True)
class AuthorityGrant:
    capabilities: tuple[CapabilityGrant, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "capabilities", tuple(self.capabilities))
        _reject_duplicate_capabilities(self.capabilities)


@dataclass(frozen=True)
class CapabilityRequirement:
    capability_id: str
    required: bool
    resources: tuple[str, ...]
    constraints: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.capability_id:
            raise ValueError("capability_id cannot be empty")
        object.__setattr__(self, "resources", tuple(self.resources))
        object.__setattr__(
            self, "constraints", MappingProxyType(dict(self.constraints))
        )


@dataclass(frozen=True)
class AuthorityRequest:
    capabilities: tuple[CapabilityRequirement, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "capabilities", tuple(self.capabilities))
        _reject_duplicate_capabilities(self.capabilities)


@dataclass(frozen=True)
class EvaluatorIdentity:
    evaluator_id: str
    version: str
    content_hash: str

    def __post_init__(self) -> None:
        if not self.evaluator_id or not self.version:
            raise ValueError("evaluator identity fields cannot be empty")
        _validate_sha256(self.content_hash, field_name="evaluator content_hash")


@dataclass(frozen=True)
class ProtectedFixtureRef:
    fixture_id: str
    content_hash: str

    def __post_init__(self) -> None:
        if not self.fixture_id:
            raise ValueError("fixture_id cannot be empty")
        _validate_sha256(self.content_hash, field_name="fixture content_hash")


@dataclass(frozen=True)
class AgentProjection:
    goal: str
    guidance: tuple[object, ...]
    requested_capabilities: tuple[str, ...]
    visible_inputs: tuple[object, ...]
    expected_artifacts: tuple[object, ...]

    def __post_init__(self) -> None:
        if not self.goal:
            raise ValueError("agent goal cannot be empty")
        for name in (
            "guidance",
            "requested_capabilities",
            "visible_inputs",
            "expected_artifacts",
        ):
            object.__setattr__(self, name, tuple(getattr(self, name)))


@dataclass(frozen=True)
class ControlProjection:
    fixture: ProtectedFixtureRef
    evaluator: EvaluatorIdentity
    protected_checks: tuple[object, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "protected_checks", tuple(self.protected_checks))


@dataclass(frozen=True)
class DomainRunSpec:
    task_id: str
    normalized_task: object
    agent: AgentProjection
    control: ControlProjection
    authority_request: AuthorityRequest
    limit_defaults: RunLimits | None

    def __post_init__(self) -> None:
        if not self.task_id:
            raise ValueError("task_id cannot be empty")


@dataclass(frozen=True)
class PackManifest:
    interface_version: int
    identity: PackSelector
    task_schema: object
    required_runtime_features: frozenset[str]
    guidance_resources: tuple[object, ...]
    requested_capabilities: tuple[CapabilityRequirement, ...]
    authority_ceiling: AuthorityRequest
    fixture_resources: tuple[object, ...]
    evaluator: EvaluatorIdentity

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "required_runtime_features", frozenset(self.required_runtime_features)
        )
        for name in (
            "guidance_resources",
            "requested_capabilities",
            "fixture_resources",
        ):
            object.__setattr__(self, name, tuple(getattr(self, name)))
        _reject_duplicate_capabilities(self.requested_capabilities)


@dataclass(frozen=True)
class RunLimitOverrides:
    max_steps: int | None = None
    max_model_calls: int | None = None
    timeout_seconds: float | None = None


@dataclass(frozen=True)
class EvaluatorLimits:
    timeout_seconds: float
    max_output_bytes: int


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


class WorkspaceFactory(Protocol):
    def stage(self, fixture: ProtectedFixtureRef, destination: Path) -> None: ...


@dataclass(frozen=True)
class RuntimeAdapters:
    model: ModelAdapter
    capabilities: Mapping[str, Tool]
    workspaces: WorkspaceFactory | None = None
    traces: object | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "capabilities", MappingProxyType(dict(self.capabilities))
        )


class EvaluationStatus(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    NOT_RUN = "not_run"


@dataclass(frozen=True)
class EvaluationVerdict:
    passed: bool
    checks: tuple[object, ...]
    measurements: Mapping[str, object]

    def __post_init__(self) -> None:
        object.__setattr__(self, "checks", tuple(self.checks))
        object.__setattr__(
            self, "measurements", MappingProxyType(dict(self.measurements))
        )


@dataclass(frozen=True)
class EvaluationRecord:
    status: EvaluationStatus
    evaluator: EvaluatorIdentity
    checks: tuple[object, ...]
    measurements: Mapping[str, object]
    error: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "checks", tuple(self.checks))
        object.__setattr__(
            self, "measurements", MappingProxyType(dict(self.measurements))
        )


@dataclass(frozen=True)
class RunUsage:
    wall_time_seconds: float
    model_requests: int
    input_tokens: int | None
    output_tokens: int | None
    cache_read_tokens: int | None
    cache_write_tokens: int | None
    tool_calls: int
    cost_usd: float | None
    cost_source: str | None


@dataclass(frozen=True)
class ArtifactSnapshotRef:
    snapshot_id: str
    content_hash: str | None
    path: Path | None
    error: str | None = None


@dataclass(frozen=True)
class TraceRef:
    trace_id: str
    schema_version: int
    path: Path


@dataclass(frozen=True)
class ComponentIdentity:
    role: str
    implementation: str
    content_hash: str

    def __post_init__(self) -> None:
        if not self.role or not self.implementation:
            raise ValueError("component identity fields cannot be empty")
        _validate_sha256(self.content_hash, field_name="component content_hash")


@dataclass(frozen=True)
class RuntimeProvenance:
    runtime: ComponentIdentity
    configuration_digest: str
    model: ComponentIdentity
    tools: tuple[ComponentIdentity, ...]
    workspace: ComponentIdentity | None
    registered_packs: tuple[PackSelector, ...]
    evaluators: tuple[EvaluatorIdentity, ...]
    protected_roots: tuple[Path, ...]

    def __post_init__(self) -> None:
        _validate_sha256(
            self.configuration_digest, field_name="Runtime configuration_digest"
        )
        object.__setattr__(self, "tools", tuple(self.tools))
        object.__setattr__(self, "registered_packs", tuple(self.registered_packs))
        object.__setattr__(self, "evaluators", tuple(self.evaluators))
        object.__setattr__(self, "protected_roots", tuple(self.protected_roots))


@dataclass(frozen=True)
class EvaluationEvidence:
    task_id: str
    pack: PackSelector
    execution: RunResult
    initial_fixture: ProtectedFixtureRef
    final_artifacts: ArtifactSnapshotRef
    trace: TraceRef


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


@dataclass(frozen=True)
class FinalAction:
    output: str


@dataclass(frozen=True)
class ToolAction:
    tool: str
    arguments: dict[str, object]


@dataclass(frozen=True)
class TraceEvent:
    schema_version: int
    run_id: str
    task_id: str
    sequence: int
    event_type: str
    payload: dict[str, object]


class TraceValidationError(ValueError):
    pass


class _TraceWriter:
    def __init__(self, path: Path, *, run_id: str, task_id: str) -> None:
        self._path = path
        self._run_id = run_id
        self._task_id = task_id
        self._sequence = 0
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8"):
            pass

    def record(self, event_type: str, payload: dict[str, object]) -> None:
        event = {
            "schema_version": 1,
            "run_id": self._run_id,
            "task_id": self._task_id,
            "sequence": self._sequence,
            "event_type": event_type,
            "payload": payload,
        }
        with self._path.open("a", encoding="utf-8") as trace:
            trace.write(json.dumps(event, sort_keys=True) + "\n")
        self._sequence += 1


class _RuntimeTraceWriter:
    def __init__(
        self,
        path: Path,
        *,
        run_id: str,
        task_id: str,
        pack: PackSelector,
        schema_version: int,
    ) -> None:
        self._path = path
        self._run_id = run_id
        self._task_id = task_id
        self._pack = pack
        self._schema_version = schema_version
        self._sequence = 0
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8"):
            pass

    def record(self, event_type: str, payload: Mapping[str, object]) -> None:
        if not event_type.startswith("runtime."):
            raise ValueError("Runtime Trace events must use the runtime namespace")
        event = {
            "schema_version": self._schema_version,
            "run_id": self._run_id,
            "task_id": self._task_id,
            "sequence": self._sequence,
            "event_type": event_type,
            "pack": _jsonable(self._pack),
            "payload": _jsonable(dict(payload)),
        }
        with self._path.open("a", encoding="utf-8") as trace:
            trace.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
        self._sequence += 1


class ModelAdapter(Protocol):
    def respond(self, context: tuple[dict[str, object], ...]) -> str: ...


class Tool(Protocol):
    name: str

    def execute(self, arguments: dict[str, object]) -> str: ...


class VerticalDomainPack(Protocol):
    manifest: PackManifest

    def content_material(self) -> object: ...

    def compile_task(self, raw_task: object) -> DomainRunSpec: ...

    def evaluate(self, evidence: EvaluationEvidence) -> EvaluationVerdict: ...


class _RuntimeRunner(Protocol):
    @property
    def provenance(self) -> RuntimeProvenance: ...

    def run(self, request: object) -> object: ...


class LocalFixtureWorkspace:
    """Stage content-addressed, operator-supplied fixtures into a run workspace."""

    def __init__(
        self,
        fixtures: Mapping[str, Mapping[str, str | bytes]],
    ) -> None:
        frozen: dict[str, Mapping[str, bytes]] = {}
        for fixture_id, files in fixtures.items():
            if not fixture_id:
                raise ValueError("fixture_id cannot be empty")
            normalized: dict[str, bytes] = {}
            for relative_path, content in files.items():
                _validate_relative_workspace_path(relative_path)
                normalized[relative_path] = (
                    content.encode("utf-8") if isinstance(content, str) else bytes(content)
                )
            frozen[fixture_id] = MappingProxyType(normalized)
        self._fixtures = MappingProxyType(frozen)

    def identity_material(self) -> object:
        return {
            "adapter": "local-fixture-workspace",
            "fixtures": {
                fixture_id: _fixture_content_digest(files)
                for fixture_id, files in sorted(self._fixtures.items())
            },
        }

    def fixture_ref(self, fixture_id: str) -> ProtectedFixtureRef:
        files = self._fixtures.get(fixture_id)
        if files is None:
            raise ValueError(f"unknown fixture_id: {fixture_id}")
        return ProtectedFixtureRef(
            fixture_id=fixture_id,
            content_hash=_fixture_content_digest(files),
        )

    def stage(self, fixture: ProtectedFixtureRef, destination: Path) -> None:
        files = self._fixtures.get(fixture.fixture_id)
        if files is None:
            raise ValueError(f"unknown fixture_id: {fixture.fixture_id}")
        if _fixture_content_digest(files) != fixture.content_hash:
            raise ValueError("protected fixture content hash mismatch")
        for relative_path, content in files.items():
            target = _workspace_path(destination, "workspace:" + relative_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as fixture_file:
                fixture_file.write(content)


class LocalWorkspaceWriteTool:
    """Write text to the Runtime-resolved path of one authorized resource."""

    def __init__(self, name: str) -> None:
        if not name:
            raise ValueError("tool name cannot be empty")
        self.name = name

    def identity_material(self) -> object:
        return {"adapter": "local-workspace-write", "name": self.name}

    def execute(self, arguments: dict[str, object]) -> str:
        target = arguments.get("_resolved_path")
        content = arguments.get("content")
        if not isinstance(target, Path):
            raise ValueError("Runtime did not resolve a workspace path")
        if not isinstance(content, str):
            raise ValueError("workspace write content must be text")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"wrote {len(content.encode('utf-8'))} bytes"


class _PolicyViolation(RuntimeError):
    pass


class AgentLoop:
    """Run a bounded task and record every observable transition as JSONL."""

    def __init__(
        self,
        *,
        model: ModelAdapter,
        tools: Sequence[Tool],
        trace_path: Path,
        monotonic: Callable[[], float] = time.monotonic,
        run_id: str | None = None,
    ) -> None:
        self._model = model
        self._tools = {tool.name: tool for tool in tools}
        self._trace_path = trace_path
        self._monotonic = monotonic
        self._run_id = run_id

    def run(self, task: Task, limits: RunLimits) -> RunResult:
        run_id = self._run_id or uuid.uuid4().hex
        steps = 0
        model_calls = 0
        context: list[dict[str, object]] = [{"role": "user", "content": task.prompt}]
        trace = _TraceWriter(self._trace_path, run_id=run_id, task_id=task.task_id)
        started_at = self._monotonic()

        def finish(
            status: RunStatus,
            *,
            output: str | None = None,
            error: str | None = None,
        ) -> RunResult:
            result = RunResult(
                run_id=run_id,
                task_id=task.task_id,
                status=status,
                output=output,
                steps=steps,
                model_calls=model_calls,
                error=error,
            )
            trace.record("run_completed", {"result": _result_payload(result)})
            return result

        trace.record("run_started", {"limits": vars(limits), "prompt": task.prompt})
        while True:
            if self._monotonic() - started_at >= limits.timeout_seconds:
                return finish(RunStatus.TIMEOUT, error="run timeout reached")
            if model_calls >= limits.max_model_calls:
                return finish(
                    RunStatus.BUDGET_EXCEEDED,
                    error="maximum model call budget reached",
                )
            model_calls += 1
            try:
                raw_response = self._model.respond(tuple(context))
            except Exception as error:
                return finish(RunStatus.MODEL_ERROR, error=str(error))
            trace.record("model_output", {"content": raw_response})
            try:
                action = _parse_action(raw_response)
            except ValueError as error:
                return finish(RunStatus.PARSE_ERROR, error=str(error))
            if isinstance(action, FinalAction):
                return finish(RunStatus.SUCCEEDED, output=action.output)

            tool = self._tools.get(action.tool)
            if tool is None:
                message = f"unknown tool: {action.tool}"
                trace.record("tool_failed", {"tool": action.tool, "error": message})
                return finish(RunStatus.TOOL_ERROR, error=message)
            try:
                observation = tool.execute(action.arguments)
            except _PolicyViolation as error:
                trace.record("tool_failed", {"tool": tool.name, "error": str(error)})
                return finish(RunStatus.POLICY_BLOCKED, error=str(error))
            except Exception as error:
                trace.record("tool_failed", {"tool": tool.name, "error": str(error)})
                return finish(RunStatus.TOOL_ERROR, error=str(error))
            steps += 1
            trace.record(
                "tool_completed",
                {"tool": tool.name, "observation": observation, "step": steps},
            )
            context.extend(
                [
                    {"role": "assistant", "content": raw_response},
                    {"role": "tool", "name": tool.name, "content": observation},
                ]
            )
            if steps >= limits.max_steps:
                return finish(RunStatus.STEP_LIMIT, error="maximum tool steps reached")


class _AuthorizedTool:
    def __init__(
        self,
        delegate: Tool,
        grant: CapabilityGrant,
        *,
        workspace: Path,
    ) -> None:
        self.name = grant.capability_id
        self._delegate = delegate
        self._resources = grant.resources
        self._workspace = workspace

    def execute(self, arguments: dict[str, object]) -> str:
        resource = arguments.get("resource")
        if not isinstance(resource, str):
            raise _PolicyViolation(
                f"capability {self.name!r} requires a logical resource"
            )
        if not _resource_allowed(resource, self._resources):
            raise _PolicyViolation(
                f"capability {self.name!r} denied resource {resource!r}"
            )
        resolved_arguments = dict(arguments)
        if resource.startswith("workspace:"):
            resolved_arguments["_resolved_path"] = _workspace_path(
                self._workspace, resource
            )
        return self._delegate.execute(resolved_arguments)


@dataclass(frozen=True)
class _RegisteredPack:
    instance: VerticalDomainPack
    manifest: PackManifest
    manifest_digest: str
    content_material: Callable[[], object]
    compile_binding: Callable[[object], DomainRunSpec]
    evaluate_binding: Callable[[EvaluationEvidence], EvaluationVerdict]
    compile_task: Callable[[object], DomainRunSpec]
    evaluate: Callable[[EvaluationEvidence], EvaluationVerdict]


class GeneralAgentRuntime:
    """Execute an exact frozen Domain Pack through one non-skippable lifecycle."""

    @staticmethod
    def identity_material() -> object:
        return {
            "runtime": "general-agent-runtime",
            "interface_version": 1,
            "trace_schema": 2,
        }

    def __init__(
        self,
        *,
        config: RuntimeConfig,
        adapters: RuntimeAdapters,
        packs: Mapping[PackSelector, _RegisteredPack],
        provenance: RuntimeProvenance,
    ) -> None:
        self._config = config
        self._adapters = adapters
        self._packs = MappingProxyType(dict(packs))
        self._provenance = provenance

    @property
    def provenance(self) -> RuntimeProvenance:
        return self._provenance

    @classmethod
    def create(
        cls,
        *,
        config: RuntimeConfig,
        adapters: RuntimeAdapters,
        packs: Sequence[VerticalDomainPack],
    ) -> "GeneralAgentRuntime":
        _validate_runtime_config(config)
        control_root = config.control_root.resolve()
        workspace_root = config.workspace_root.resolve()
        control_root.mkdir(parents=True, exist_ok=True)
        workspace_root.mkdir(parents=True, exist_ok=True)

        registry: dict[PackSelector, _RegisteredPack] = {}
        for pack in packs:
            manifest = getattr(pack, "manifest", None)
            if not isinstance(manifest, PackManifest):
                raise TypeError("every pack must expose a PackManifest")
            if manifest.interface_version != config.interface_version:
                raise ValueError(
                    f"unsupported pack interface version: {manifest.interface_version}"
                )
            if manifest.required_runtime_features:
                raise ValueError(
                    "required Runtime features are not implemented: "
                    + ", ".join(sorted(manifest.required_runtime_features))
                )
            if manifest.identity in registry:
                raise ValueError(f"duplicate pack identity: {manifest.identity!r}")
            compile_task = getattr(pack, "compile_task", None)
            if not callable(compile_task):
                raise TypeError("pack compile_task must be callable")
            evaluate = getattr(pack, "evaluate", None)
            if not callable(evaluate):
                raise TypeError("pack evaluate must be callable")
            content_material = getattr(pack, "content_material", None)
            if not callable(content_material):
                raise TypeError("pack content_material must be callable")
            expected_hash = pack_content_hash(type(pack), content_material())
            if manifest.identity.content_hash != expected_hash:
                raise ValueError(
                    "pack content hash mismatch: "
                    f"declared {manifest.identity.content_hash}, recomputed {expected_hash}"
                )
            frozen_compile_task, frozen_evaluate = _freeze_pack_execution(
                compile_task,
                evaluate,
            )
            registry[manifest.identity] = _RegisteredPack(
                instance=pack,
                manifest=manifest,
                manifest_digest=_content_digest(manifest),
                content_material=content_material,
                compile_binding=compile_task,
                evaluate_binding=evaluate,
                compile_task=frozen_compile_task,
                evaluate=frozen_evaluate,
            )
        if not registry:
            raise ValueError("at least one Domain Pack is required")
        provenance = _build_runtime_provenance(
            config=config,
            adapters=adapters,
            registered_packs=tuple(registry),
            evaluators=tuple(
                registration.manifest.evaluator
                for registration in registry.values()
            ),
        )
        return cls(
            config=config,
            adapters=adapters,
            packs=registry,
            provenance=provenance,
        )

    def run(self, request: RunRequest) -> RunReport:
        _revalidate_runtime_adapters(self._adapters, self._provenance)
        registered_pack = self._packs.get(request.pack)
        if registered_pack is None:
            raise ValueError(f"exact pack identity is not registered: {request.pack!r}")
        _revalidate_registered_pack(registered_pack, request.pack)
        manifest = registered_pack.manifest
        _validate_task_schema(request.task, manifest.task_schema)
        spec = registered_pack.compile_task(request.task)
        if not isinstance(spec, DomainRunSpec):
            raise TypeError("pack compile_task must return DomainRunSpec")
        _validate_compiled_spec(spec, manifest)
        limits = _resolve_limits(
            request.limits,
            pack_defaults=spec.limit_defaults,
            defaults=self._config.default_limits,
            hard=self._config.hard_limits,
        )
        authority = _resolve_authority(
            runtime=self._config.authority_ceiling,
            caller=request.authority,
            pack=manifest.authority_ceiling,
            task=spec.authority_request,
            available=self._adapters.capabilities,
        )

        run_id = uuid.uuid4().hex
        run_workspace = self._config.workspace_root.resolve() / run_id
        run_workspace.mkdir(parents=True, exist_ok=False)
        workspace_adapter = self._adapters.workspaces
        if workspace_adapter is not None:
            stage = getattr(workspace_adapter, "stage", None)
            if not callable(stage):
                raise TypeError("workspace Adapter stage must be callable")
            stage(spec.control.fixture, run_workspace)
        elif spec.agent.visible_inputs:
            raise ValueError("visible inputs require a workspace Adapter")
        tools = tuple(
            _AuthorizedTool(
                self._adapters.capabilities[grant.capability_id],
                grant,
                workspace=run_workspace,
            )
            for grant in authority.capabilities
        )

        runtime_trace_path = (
            self._config.control_root.resolve()
            / "traces"
            / f"{run_id}.jsonl"
        )
        agent_loop_trace_path = (
            self._config.control_root.resolve()
            / "agent-loop-traces"
            / f"{run_id}.jsonl"
        )
        task = Task(task_id=spec.task_id, prompt=_agent_prompt(spec))
        runtime_trace = _RuntimeTraceWriter(
            runtime_trace_path,
            run_id=run_id,
            task_id=spec.task_id,
            pack=manifest.identity,
            schema_version=self._config.trace_schema_version,
        )
        runtime_trace.record(
            "runtime.run_started",
            {
                "limits": limits,
                "effective_authority_digest": _content_digest(authority),
                "configuration_digest": self._provenance.configuration_digest,
            },
        )
        started_at = time.monotonic()
        result = AgentLoop(
            model=self._adapters.model,
            tools=tools,
            trace_path=agent_loop_trace_path,
            run_id=run_id,
        ).run(task, limits)
        wall_time = max(0.0, time.monotonic() - started_at)
        runtime_trace.record(
            "runtime.execution_completed", {"result": _result_payload(result)}
        )

        artifact_path = (
            self._config.control_root.resolve() / "artifacts" / result.run_id
        )
        trace = TraceRef(
            trace_id=result.run_id,
            schema_version=self._config.trace_schema_version,
            path=runtime_trace_path,
        )
        try:
            artifact_hash = _freeze_workspace(run_workspace, artifact_path)
            artifacts = ArtifactSnapshotRef(
                snapshot_id=f"artifact:{result.run_id}",
                content_hash=artifact_hash,
                path=artifact_path,
            )
        except Exception as error:
            artifacts = ArtifactSnapshotRef(
                snapshot_id=f"artifact:{result.run_id}",
                content_hash=None,
                path=None,
                error=str(error),
            )
            runtime_trace.record(
                "runtime.artifact_freeze_failed", {"error": str(error)}
            )
            evaluation = EvaluationRecord(
                status=EvaluationStatus.NOT_RUN,
                evaluator=manifest.evaluator,
                checks=(),
                measurements={},
                error=f"artifact snapshot unavailable: {error}",
            )
        else:
            evidence = EvaluationEvidence(
                task_id=spec.task_id,
                pack=manifest.identity,
                execution=result,
                initial_fixture=spec.control.fixture,
                final_artifacts=artifacts,
                trace=trace,
            )
            try:
                verdict = _run_evaluator(
                    registered_pack.evaluate,
                    evidence,
                    timeout_seconds=self._config.evaluator_limits.timeout_seconds,
                    max_output_bytes=self._config.evaluator_limits.max_output_bytes,
                )
                if not isinstance(verdict, EvaluationVerdict):
                    raise TypeError("pack evaluate must return EvaluationVerdict")
                verdict_bytes = json.dumps(
                    {
                        "passed": verdict.passed,
                        "checks": verdict.checks,
                        "measurements": dict(verdict.measurements),
                    },
                    default=str,
                    ensure_ascii=False,
                    sort_keys=True,
                ).encode("utf-8")
                if len(verdict_bytes) > self._config.evaluator_limits.max_output_bytes:
                    raise ValueError("evaluator output exceeded max_output_bytes")
                evaluation = EvaluationRecord(
                    status=(
                        EvaluationStatus.PASSED
                        if verdict.passed
                        else EvaluationStatus.FAILED
                    ),
                    evaluator=manifest.evaluator,
                    checks=verdict.checks,
                    measurements=verdict.measurements,
                )
            except Exception as error:
                evaluation = EvaluationRecord(
                    status=EvaluationStatus.ERROR,
                    evaluator=manifest.evaluator,
                    checks=(),
                    measurements={},
                    error=str(error),
                )
        runtime_trace.record(
            "runtime.evaluation_completed",
            {
                "status": evaluation.status.value,
                "evaluator": evaluation.evaluator,
                "error": evaluation.error,
            },
        )
        usage = RunUsage(
            wall_time_seconds=wall_time,
            model_requests=result.model_calls,
            input_tokens=None,
            output_tokens=None,
            cache_read_tokens=None,
            cache_write_tokens=None,
            tool_calls=result.steps,
            cost_usd=None,
            cost_source=None,
        )
        report = RunReport(
            pack=manifest.identity,
            initial_fixture=spec.control.fixture,
            result=result,
            evaluation=evaluation,
            usage=usage,
            artifacts=artifacts,
            trace=trace,
            provenance=self._provenance,
        )
        runtime_trace.record(
            "runtime.report_completed",
            {"passed": report.passed, "usage": usage},
        )
        return report


@dataclass(frozen=True)
class RunRequest:
    pack: PackSelector
    task: object
    authority: AuthorityGrant
    limits: RunLimitOverrides = field(default_factory=RunLimitOverrides)
    metadata: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "metadata", MappingProxyType(dict(self.metadata)))


@dataclass(frozen=True)
class SuiteSelector:
    suite_id: str
    version: str
    content_hash: str

    def __post_init__(self) -> None:
        if not self.suite_id or not self.version:
            raise ValueError("suite identity fields cannot be empty")
        _validate_sha256(self.content_hash, field_name="suite content_hash")


@dataclass(frozen=True)
class SuiteManifest:
    identity: SuiteSelector
    lane: str
    source_revision: str
    source_digest: str
    cases_hash: str
    transform_descriptor: object
    transform_hash: str
    metric_schema_version: int
    required_packs: tuple[PackSelector, ...]

    def __post_init__(self) -> None:
        if not self.lane or not self.source_revision:
            raise ValueError("suite lane and source_revision cannot be empty")
        _validate_sha256(self.source_digest, field_name="suite source_digest")
        _validate_sha256(self.cases_hash, field_name="suite cases_hash")
        _validate_sha256(self.transform_hash, field_name="suite transform_hash")
        if self.metric_schema_version <= 0:
            raise ValueError("metric_schema_version must be positive")
        object.__setattr__(self, "required_packs", tuple(self.required_packs))
        if len(self.required_packs) != len(set(self.required_packs)):
            raise ValueError("suite required_packs cannot contain duplicates")


class CaseEligibility(StrEnum):
    ELIGIBLE = "eligible"
    INELIGIBLE = "ineligible"


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    source_case_id: str
    request: object
    eligibility: CaseEligibility
    ineligibility_reason: str | None = None

    def __post_init__(self) -> None:
        if not self.case_id or not self.source_case_id:
            raise ValueError("benchmark case identity fields cannot be empty")
        if self.eligibility is CaseEligibility.ELIGIBLE:
            if self.ineligibility_reason is not None:
                raise ValueError("eligible case cannot have an ineligibility reason")
        elif not self.ineligibility_reason:
            raise ValueError("ineligible case requires a stable reason")


@dataclass(frozen=True)
class CampaignRequest:
    suite: SuiteSelector
    repetitions: int
    case_ids: tuple[str, ...] | None = None

    def __post_init__(self) -> None:
        if self.repetitions <= 0:
            raise ValueError("campaign repetitions must be positive")
        if self.case_ids is not None:
            frozen = tuple(self.case_ids)
            if len(frozen) != len(set(frozen)):
                raise ValueError("campaign case_ids cannot contain duplicates")
            object.__setattr__(self, "case_ids", frozen)


@dataclass(frozen=True)
class CampaignAttempt:
    suite: SuiteSelector
    case_id: str
    source_case_id: str
    repetition: int
    request: object
    transform_hash: str
    passed: bool
    usage: RunUsage | None
    report: object | None
    configuration_digest: str
    started_at: str
    finished_at: str
    duration_seconds: float
    failure_attribution: str | None
    error: str | None = None


@dataclass(frozen=True)
class CampaignCaseRecord:
    case_id: str
    source_case_id: str
    eligibility: CaseEligibility
    ineligibility_reason: str | None
    attempts: tuple[CampaignAttempt, ...]


@dataclass(frozen=True)
class CampaignSummary:
    attempted: int
    passed: int
    failed: int
    errors: int
    ineligible: int
    pass_rate: float | None
    cost_per_task_usd: float | None
    cost_per_success_usd: float | None
    cost_observed_attempts: int
    cost_measurement_coverage: float | None
    usage_observed_attempts: int
    usage_measurement_coverage: float | None
    wall_time_seconds: float
    model_requests: int
    input_tokens: int | None
    output_tokens: int | None
    cache_read_tokens: int | None
    cache_write_tokens: int | None
    tool_calls: int
    token_measurement_coverage: float | None
    failure_attribution: Mapping[str, int]

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "failure_attribution",
            MappingProxyType(dict(self.failure_attribution)),
        )


@dataclass(frozen=True)
class CampaignArtifactRef:
    campaign_id: str
    directory: Path
    report_path: Path


@dataclass(frozen=True)
class CampaignProvenance:
    runtime_configurations: tuple[str, ...]
    runtimes: tuple[ComponentIdentity, ...]
    models: tuple[ComponentIdentity, ...]
    tools: tuple[ComponentIdentity, ...]
    workspaces: tuple[ComponentIdentity, ...]
    evaluators: tuple[EvaluatorIdentity, ...]
    pricing_sources: tuple[str, ...]


@dataclass(frozen=True)
class CampaignReport:
    request: CampaignRequest
    configuration_digest: str
    suite: SuiteManifest
    provenance: CampaignProvenance
    cases: tuple[CampaignCaseRecord, ...]
    attempts: tuple[CampaignAttempt, ...]
    summary: CampaignSummary
    artifacts: CampaignArtifactRef


@dataclass(frozen=True)
class _FrozenSuite:
    manifest: SuiteManifest
    cases: tuple[BenchmarkCase, ...]


class EvaluationCampaign:
    """Freeze suite provenance and aggregate calls through Runtime.run only."""

    def __init__(
        self,
        *,
        runtime: _RuntimeRunner,
        runtime_provenance: RuntimeProvenance,
        suites: Mapping[SuiteSelector, _FrozenSuite],
        artifacts_root: Path,
    ) -> None:
        self._runtime = runtime
        self._runtime_provenance = runtime_provenance
        self._suites = MappingProxyType(dict(suites))
        self._artifacts_root = artifacts_root

    @classmethod
    def create(
        cls,
        *,
        runtime: object,
        suites: Sequence[object],
        artifacts_root: Path,
    ) -> "EvaluationCampaign":
        if not callable(getattr(runtime, "run", None)):
            raise TypeError("campaign runtime must expose a callable run method")
        runtime_provenance = getattr(runtime, "provenance", None)
        if not isinstance(runtime_provenance, RuntimeProvenance):
            raise TypeError("campaign runtime must expose RuntimeProvenance")
        registry: dict[SuiteSelector, _FrozenSuite] = {}
        for suite in suites:
            manifest = getattr(suite, "manifest", None)
            if not isinstance(manifest, SuiteManifest):
                raise TypeError("every suite must expose a SuiteManifest")
            cases_method = getattr(suite, "cases", None)
            if not callable(cases_method):
                raise TypeError("suite cases must be callable")
            source_material = getattr(suite, "source_material", None)
            if not callable(source_material):
                raise TypeError("suite source_material must be callable")
            cases = tuple(cases_method())
            if any(not isinstance(case, BenchmarkCase) for case in cases):
                raise TypeError("suite cases must contain BenchmarkCase values")
            case_ids = [case.case_id for case in cases]
            if len(case_ids) != len(set(case_ids)):
                raise ValueError("suite contains duplicate case_id values")
            if benchmark_source_hash(source_material()) != manifest.source_digest:
                raise ValueError("suite source content hash mismatch")
            if benchmark_cases_hash(cases) != manifest.cases_hash:
                raise ValueError("suite case content hash mismatch")
            if (
                benchmark_transform_hash(manifest.transform_descriptor)
                != manifest.transform_hash
            ):
                raise ValueError("suite transform content hash mismatch")
            expected_suite_hash = suite_content_hash(
                suite_id=manifest.identity.suite_id,
                version=manifest.identity.version,
                lane=manifest.lane,
                source_revision=manifest.source_revision,
                source_digest=manifest.source_digest,
                cases_hash=manifest.cases_hash,
                transform_hash=manifest.transform_hash,
                metric_schema_version=manifest.metric_schema_version,
                required_packs=manifest.required_packs,
            )
            if expected_suite_hash != manifest.identity.content_hash:
                raise ValueError("suite identity content hash mismatch")
            if manifest.identity in registry:
                raise ValueError(f"duplicate suite identity: {manifest.identity!r}")
            if manifest.required_packs:
                missing_packs = tuple(
                    selector
                    for selector in manifest.required_packs
                    if selector not in runtime_provenance.registered_packs
                )
                if missing_packs:
                    raise ValueError(f"required pack is not registered: {missing_packs!r}")
            registry[manifest.identity] = _FrozenSuite(manifest, cases)
        if not registry:
            raise ValueError("at least one Benchmark Suite is required")
        root = Path(artifacts_root).resolve()
        if any(
            _paths_overlap(root, protected_root)
            for protected_root in runtime_provenance.protected_roots
        ):
            raise ValueError("campaign artifacts_root overlaps a Runtime protected root")
        root.mkdir(parents=True, exist_ok=True)
        return cls(
            runtime=cast(_RuntimeRunner, runtime),
            runtime_provenance=runtime_provenance,
            suites=registry,
            artifacts_root=root,
        )

    def run(self, request: CampaignRequest) -> CampaignReport:
        suite = self._suites.get(request.suite)
        if suite is None:
            raise ValueError(
                f"exact suite identity is not registered: {request.suite!r}"
            )
        selected_ids = (
            None if request.case_ids is None else frozenset(request.case_ids)
        )
        known_ids = {case.case_id for case in suite.cases}
        if selected_ids is not None:
            unknown = sorted(selected_ids - known_ids)
            if unknown:
                raise ValueError("unknown campaign case_ids: " + ", ".join(unknown))
        selected = tuple(
            case
            for case in suite.cases
            if selected_ids is None or case.case_id in selected_ids
        )
        runtime_provenance = self._runtime_provenance
        campaign_configuration_digest = _content_digest(
            {
                "schema": "workspace-agent-harness/campaign-configuration/v1",
                "request": request,
                "suite": suite.manifest,
                "runtime": runtime_provenance,
                "selected_case_ids": tuple(case.case_id for case in selected),
            }
        )

        campaign_id = uuid.uuid4().hex
        campaign_directory = self._artifacts_root / f"campaign-{campaign_id}"
        attempts_directory = campaign_directory / "attempts"
        attempts_directory.mkdir(parents=True, exist_ok=False)
        artifacts = CampaignArtifactRef(
            campaign_id=campaign_id,
            directory=campaign_directory,
            report_path=campaign_directory / "report.json",
        )

        attempts: list[CampaignAttempt] = []
        records: list[CampaignCaseRecord] = []
        for case in selected:
            case_attempts: list[CampaignAttempt] = []
            if case.eligibility is CaseEligibility.ELIGIBLE:
                for repetition in range(1, request.repetitions + 1):
                    started_at = datetime.now(UTC).isoformat()
                    started_monotonic = time.monotonic()
                    try:
                        run_report = self._runtime.run(case.request)
                        usage = getattr(run_report, "usage", None)
                        if usage is not None and not isinstance(usage, RunUsage):
                            raise TypeError("Runtime report usage must be RunUsage")
                        failure_attribution = _attempt_failure_attribution(run_report)
                        finished_at = datetime.now(UTC).isoformat()
                        attempt = CampaignAttempt(
                            suite=suite.manifest.identity,
                            case_id=case.case_id,
                            source_case_id=case.source_case_id,
                            repetition=repetition,
                            request=case.request,
                            transform_hash=suite.manifest.transform_hash,
                            passed=bool(getattr(run_report, "passed", False)),
                            usage=usage,
                            report=run_report,
                            configuration_digest=campaign_configuration_digest,
                            started_at=started_at,
                            finished_at=finished_at,
                            duration_seconds=max(
                                0.0, time.monotonic() - started_monotonic
                            ),
                            failure_attribution=failure_attribution,
                        )
                    except Exception as error:
                        finished_at = datetime.now(UTC).isoformat()
                        attempt = CampaignAttempt(
                            suite=suite.manifest.identity,
                            case_id=case.case_id,
                            source_case_id=case.source_case_id,
                            repetition=repetition,
                            request=case.request,
                            transform_hash=suite.manifest.transform_hash,
                            passed=False,
                            usage=None,
                            report=None,
                            configuration_digest=campaign_configuration_digest,
                            started_at=started_at,
                            finished_at=finished_at,
                            duration_seconds=max(
                                0.0, time.monotonic() - started_monotonic
                            ),
                            failure_attribution="runtime.exception",
                            error=str(error),
                        )
                    case_attempts.append(attempt)
                    attempts.append(attempt)
                    _write_json_exclusive(
                        attempts_directory / f"attempt-{len(attempts):06d}.json",
                        _campaign_attempt_payload(attempt),
                    )
            records.append(
                CampaignCaseRecord(
                    case_id=case.case_id,
                    source_case_id=case.source_case_id,
                    eligibility=case.eligibility,
                    ineligibility_reason=case.ineligibility_reason,
                    attempts=tuple(case_attempts),
                )
            )

        attempted = len(attempts)
        passed = sum(attempt.passed for attempt in attempts)
        errors = sum(
            _is_error_attribution(attempt.failure_attribution)
            for attempt in attempts
        )
        failed = attempted - passed - errors
        ineligible = sum(
            case.eligibility is CaseEligibility.INELIGIBLE for case in selected
        )
        observed_costs = [
            attempt.usage.cost_usd
            for attempt in attempts
            if attempt.usage is not None and attempt.usage.cost_usd is not None
        ]
        cost_observed = len(observed_costs)
        complete_cost = attempted > 0 and cost_observed == attempted
        total_cost = sum(observed_costs) if complete_cost else None
        observed_usage = [
            attempt.usage for attempt in attempts if attempt.usage is not None
        ]
        usage_observed = len(observed_usage)
        complete_tokens = [
            usage
            for usage in observed_usage
            if usage.input_tokens is not None
            and usage.output_tokens is not None
            and usage.cache_read_tokens is not None
            and usage.cache_write_tokens is not None
        ]
        token_observed = len(complete_tokens)
        all_tokens_observed = attempted > 0 and token_observed == attempted
        failure_counts: dict[str, int] = {}
        for attempt in attempts:
            if attempt.failure_attribution is not None:
                failure_counts[attempt.failure_attribution] = (
                    failure_counts.get(attempt.failure_attribution, 0) + 1
                )
        summary = CampaignSummary(
            attempted=attempted,
            passed=passed,
            failed=failed,
            errors=errors,
            ineligible=ineligible,
            pass_rate=passed / attempted if attempted else None,
            cost_per_task_usd=(
                total_cost / attempted if total_cost is not None else None
            ),
            cost_per_success_usd=(
                total_cost / passed
                if total_cost is not None and passed > 0
                else None
            ),
            cost_observed_attempts=cost_observed,
            cost_measurement_coverage=(
                cost_observed / attempted if attempted else None
            ),
            usage_observed_attempts=usage_observed,
            usage_measurement_coverage=(
                usage_observed / attempted if attempted else None
            ),
            wall_time_seconds=sum(
                attempt.duration_seconds for attempt in attempts
            ),
            model_requests=sum(usage.model_requests for usage in observed_usage),
            input_tokens=(
                sum(cast(int, usage.input_tokens) for usage in complete_tokens)
                if all_tokens_observed
                else None
            ),
            output_tokens=(
                sum(cast(int, usage.output_tokens) for usage in complete_tokens)
                if all_tokens_observed
                else None
            ),
            cache_read_tokens=(
                sum(cast(int, usage.cache_read_tokens) for usage in complete_tokens)
                if all_tokens_observed
                else None
            ),
            cache_write_tokens=(
                sum(cast(int, usage.cache_write_tokens) for usage in complete_tokens)
                if all_tokens_observed
                else None
            ),
            tool_calls=sum(usage.tool_calls for usage in observed_usage),
            token_measurement_coverage=(
                token_observed / attempted if attempted else None
            ),
            failure_attribution=failure_counts,
        )
        campaign_provenance = _campaign_provenance(
            attempts,
            baseline=self._runtime_provenance,
        )
        report = CampaignReport(
            request=request,
            configuration_digest=campaign_configuration_digest,
            suite=suite.manifest,
            provenance=campaign_provenance,
            cases=tuple(records),
            attempts=tuple(attempts),
            summary=summary,
            artifacts=artifacts,
        )
        _write_json_exclusive(
            artifacts.report_path,
            {
                "campaign_id": campaign_id,
                "request": _jsonable(request),
                "configuration_digest": campaign_configuration_digest,
                "suite": _jsonable(suite.manifest),
                "provenance": _jsonable(campaign_provenance),
                "cases": _jsonable(tuple(records)),
                "summary": _jsonable(summary),
                "attempt_files": [
                    f"attempts/attempt-{index:06d}.json"
                    for index in range(1, len(attempts) + 1)
                ],
            },
        )
        return report


def _validate_sha256(value: str, *, field_name: str) -> None:
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", value):
        raise ValueError(f"{field_name} must be a lowercase sha256 digest")


def _campaign_attempt_payload(attempt: CampaignAttempt) -> dict[str, object]:
    return {
        "suite": _jsonable(attempt.suite),
        "case_id": attempt.case_id,
        "source_case_id": attempt.source_case_id,
        "repetition": attempt.repetition,
        "request": _jsonable(attempt.request),
        "transform_hash": attempt.transform_hash,
        "passed": attempt.passed,
        "configuration_digest": attempt.configuration_digest,
        "started_at": attempt.started_at,
        "finished_at": attempt.finished_at,
        "duration_seconds": attempt.duration_seconds,
        "failure_attribution": attempt.failure_attribution,
        "usage": _jsonable(attempt.usage),
        "report": _jsonable(attempt.report),
        "error": attempt.error,
    }


def _attempt_failure_attribution(run_report: object) -> str | None:
    if bool(getattr(run_report, "passed", False)):
        return None
    result = getattr(run_report, "result", None)
    result_status = getattr(result, "status", None)
    if result_status is not None:
        status_value = getattr(result_status, "value", str(result_status))
        if status_value != RunStatus.SUCCEEDED.value:
            return f"execution.{status_value}"
    evaluation = getattr(run_report, "evaluation", None)
    evaluation_status = getattr(evaluation, "status", None)
    if evaluation_status is not None:
        status_value = getattr(evaluation_status, "value", str(evaluation_status))
        return f"evaluation.{status_value}"
    return "evaluation.failed"


def _is_error_attribution(attribution: str | None) -> bool:
    return attribution in {
        "runtime.exception",
        "evaluation.error",
        "evaluation.not_run",
    }


def _append_unique(values: list[Any], value: Any) -> None:
    if value not in values:
        values.append(value)


def _campaign_provenance(
    attempts: Sequence[CampaignAttempt],
    *,
    baseline: RuntimeProvenance,
) -> CampaignProvenance:
    runtime_configurations: list[str] = [baseline.configuration_digest]
    runtimes: list[ComponentIdentity] = [baseline.runtime]
    models: list[ComponentIdentity] = [baseline.model]
    tools: list[ComponentIdentity] = list(baseline.tools)
    workspaces: list[ComponentIdentity] = (
        [] if baseline.workspace is None else [baseline.workspace]
    )
    evaluators: list[EvaluatorIdentity] = list(baseline.evaluators)
    pricing_sources: list[str] = []
    for attempt in attempts:
        if attempt.usage is not None and attempt.usage.cost_source is not None:
            _append_unique(pricing_sources, attempt.usage.cost_source)
        report = attempt.report
        provenance = getattr(report, "provenance", None)
        if isinstance(provenance, RuntimeProvenance):
            _append_unique(
                runtime_configurations, provenance.configuration_digest
            )
            _append_unique(runtimes, provenance.runtime)
            _append_unique(models, provenance.model)
            for tool in provenance.tools:
                _append_unique(tools, tool)
            if provenance.workspace is not None:
                _append_unique(workspaces, provenance.workspace)
        evaluation = getattr(report, "evaluation", None)
        evaluator = getattr(evaluation, "evaluator", None)
        if isinstance(evaluator, EvaluatorIdentity):
            _append_unique(evaluators, evaluator)
    return CampaignProvenance(
        runtime_configurations=tuple(runtime_configurations),
        runtimes=tuple(runtimes),
        models=tuple(models),
        tools=tuple(tools),
        workspaces=tuple(workspaces),
        evaluators=tuple(evaluators),
        pricing_sources=tuple(pricing_sources),
    )


def _jsonable(value: object) -> object:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if is_dataclass(value) and not isinstance(value, type):
        return {
            item.name: _jsonable(getattr(value, item.name)) for item in fields(value)
        }
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (tuple, list, set, frozenset)):
        return [_jsonable(item) for item in value]
    attributes = getattr(value, "__dict__", None)
    if isinstance(attributes, dict):
        return {
            str(key): _jsonable(item)
            for key, item in attributes.items()
            if not str(key).startswith("_")
        }
    return {"type": type(value).__name__, "representation": repr(value)}


def _write_json_exclusive(path: Path, payload: object) -> None:
    with path.open("x", encoding="utf-8") as artifact:
        json.dump(payload, artifact, ensure_ascii=False, sort_keys=True)
        artifact.write("\n")


def _content_digest(value: object) -> str:
    encoded = json.dumps(
        _jsonable(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def pack_content_hash(pack_type: type[object], content_material: object) -> str:
    """Compute the Runtime-verifiable digest for an operator-trusted Pack bundle."""

    try:
        implementation_source = inspect.getsource(pack_type)
        implementation_module = inspect.getmodule(pack_type)
        if implementation_module is None:
            raise OSError("pack implementation module is unavailable")
        module_source = inspect.getsource(implementation_module)
    except (OSError, TypeError) as error:
        raise ValueError("pack implementation source is not inspectable") from error
    return _content_digest(
        {
            "schema": "workspace-agent-harness/pack-content/v1",
            "implementation": {
                "module": pack_type.__module__,
                "qualname": pack_type.__qualname__,
                "source": implementation_source,
                "module_source": module_source,
            },
            "material": content_material,
        }
    )


def benchmark_cases_hash(cases: Sequence[BenchmarkCase]) -> str:
    return _content_digest(
        {
            "schema": "workspace-agent-harness/benchmark-cases/v1",
            "cases": tuple(cases),
        }
    )


def benchmark_source_hash(source_material: object) -> str:
    return _content_digest(
        {
            "schema": "workspace-agent-harness/benchmark-source/v1",
            "source": source_material,
        }
    )


def benchmark_transform_hash(transform_descriptor: object) -> str:
    return _content_digest(
        {
            "schema": "workspace-agent-harness/benchmark-transform/v1",
            "transform": transform_descriptor,
        }
    )


def suite_content_hash(
    *,
    suite_id: str,
    version: str,
    lane: str,
    source_revision: str,
    source_digest: str,
    cases_hash: str,
    transform_hash: str,
    metric_schema_version: int,
    required_packs: Sequence[PackSelector],
) -> str:
    return _content_digest(
        {
            "schema": "workspace-agent-harness/suite-content/v1",
            "suite_id": suite_id,
            "version": version,
            "lane": lane,
            "source_revision": source_revision,
            "source_digest": source_digest,
            "cases_hash": cases_hash,
            "transform_hash": transform_hash,
            "metric_schema_version": metric_schema_version,
            "required_packs": tuple(required_packs),
        }
    )


def _freeze_pack_execution(
    compile_task: object,
    evaluate: object,
) -> tuple[
    Callable[[object], DomainRunSpec],
    Callable[[EvaluationEvidence], EvaluationVerdict],
]:
    methods = (compile_task, evaluate)
    if any(not inspect.ismethod(method) for method in methods):
        raise TypeError("Pack compile_task and evaluate must be bound Python methods")
    globals_snapshots: dict[int, dict[str, object]] = {}
    frozen_methods: list[object] = []
    for method in methods:
        assert inspect.ismethod(method)
        function = method.__func__
        source_globals = function.__globals__
        snapshot = globals_snapshots.get(id(source_globals))
        if snapshot is None:
            snapshot = _snapshot_module_globals(source_globals)
            globals_snapshots[id(source_globals)] = snapshot
        frozen_function = _clone_function(
            cast(types.FunctionType, function), snapshot
        )
        frozen_methods.append(types.MethodType(frozen_function, method.__self__))
    return (
        cast(Callable[[object], DomainRunSpec], frozen_methods[0]),
        cast(
            Callable[[EvaluationEvidence], EvaluationVerdict],
            frozen_methods[1],
        ),
    )


def _snapshot_module_globals(
    source_globals: Mapping[str, object],
) -> dict[str, object]:
    snapshot = dict(source_globals)
    for name, value in source_globals.items():
        if inspect.isfunction(value) and value.__globals__ is source_globals:
            snapshot[name] = _clone_function(
                cast(types.FunctionType, value), snapshot
            )
    return snapshot


def _clone_function(
    function: types.FunctionType,
    globals_snapshot: dict[str, object],
) -> types.FunctionType:
    clone = types.FunctionType(
        function.__code__,
        globals_snapshot,
        name=function.__name__,
        argdefs=function.__defaults__,
        closure=function.__closure__,
    )
    clone.__kwdefaults__ = (
        None if function.__kwdefaults__ is None else dict(function.__kwdefaults__)
    )
    clone.__annotations__ = dict(function.__annotations__)
    clone.__qualname__ = function.__qualname__
    clone.__doc__ = function.__doc__
    return clone


def _revalidate_registered_pack(
    registration: _RegisteredPack,
    selector: PackSelector,
) -> None:
    current_manifest = getattr(registration.instance, "manifest", None)
    if not isinstance(current_manifest, PackManifest):
        raise ValueError("registered pack manifest is no longer valid")
    if current_manifest is not registration.manifest:
        raise ValueError("registered pack manifest changed after Runtime creation")
    if _content_digest(current_manifest) != registration.manifest_digest:
        raise ValueError("registered pack manifest content drifted")
    for name, frozen_callable in (
        ("content_material", registration.content_material),
        ("compile_task", registration.compile_binding),
        ("evaluate", registration.evaluate_binding),
    ):
        if getattr(registration.instance, name, None) != frozen_callable:
            raise ValueError(f"registered pack {name} binding drifted")
    recomputed_hash = pack_content_hash(
        type(registration.instance),
        registration.content_material(),
    )
    if recomputed_hash != selector.content_hash:
        raise ValueError("registered pack content drifted after Runtime creation")


def _revalidate_runtime_adapters(
    adapters: RuntimeAdapters,
    provenance: RuntimeProvenance,
) -> None:
    if _component_identity("model", adapters.model) != provenance.model:
        raise ValueError("model Adapter identity drifted after Runtime creation")
    current_tools = tuple(
        _component_identity(f"tool:{capability_id}", adapter)
        for capability_id, adapter in sorted(adapters.capabilities.items())
    )
    if current_tools != provenance.tools:
        raise ValueError("tool Adapter identity drifted after Runtime creation")
    current_workspace = (
        None
        if adapters.workspaces is None
        else _component_identity("workspace", adapters.workspaces)
    )
    if current_workspace != provenance.workspace:
        raise ValueError("workspace Adapter identity drifted after Runtime creation")


def _component_identity(role: str, component: object) -> ComponentIdentity:
    component_type = component if isinstance(component, type) else type(component)
    implementation = f"{component_type.__module__}.{component_type.__qualname__}"
    try:
        source: object = inspect.getsource(component_type)
        component_module = inspect.getmodule(component_type)
        module_source: object = (
            inspect.getsource(component_module)
            if component_module is not None
            else {"source_unavailable": True}
        )
    except (OSError, TypeError):
        source = {"source_unavailable": True}
        module_source = {"source_unavailable": True}
    identity_material = getattr(component, "identity_material", None)
    if not callable(identity_material):
        raise TypeError(
            f"{role} Adapter must expose callable identity_material()"
        )
    declared_material = identity_material()
    return ComponentIdentity(
        role=role,
        implementation=implementation,
        content_hash=_content_digest(
            {
                "schema": "workspace-agent-harness/component/v1",
                "implementation": implementation,
                "source": source,
                "module_source": module_source,
                "declared_material": declared_material,
            }
        ),
    )


def _build_runtime_provenance(
    *,
    config: RuntimeConfig,
    adapters: RuntimeAdapters,
    registered_packs: tuple[PackSelector, ...],
    evaluators: tuple[EvaluatorIdentity, ...],
) -> RuntimeProvenance:
    runtime_identity = _component_identity("runtime", GeneralAgentRuntime)
    model_identity = _component_identity("model", adapters.model)
    tool_identities = tuple(
        _component_identity(f"tool:{capability_id}", adapter)
        for capability_id, adapter in sorted(adapters.capabilities.items())
    )
    workspace_identity = (
        None
        if adapters.workspaces is None
        else _component_identity("workspace", adapters.workspaces)
    )
    configuration_digest = _content_digest(
        {
            "schema": "workspace-agent-harness/runtime-configuration/v1",
            "config": config,
            "runtime": runtime_identity,
            "model": model_identity,
            "tools": tool_identities,
            "workspace": workspace_identity,
            "registered_packs": registered_packs,
            "evaluators": evaluators,
        }
    )
    return RuntimeProvenance(
        runtime=runtime_identity,
        configuration_digest=configuration_digest,
        model=model_identity,
        tools=tool_identities,
        workspace=workspace_identity,
        registered_packs=registered_packs,
        evaluators=evaluators,
        protected_roots=(config.control_root.resolve(), config.workspace_root.resolve()),
    )


def _evaluator_process_entry(
    connection: Any,
    evaluator: Callable[[EvaluationEvidence], EvaluationVerdict],
    evidence: EvaluationEvidence,
    max_output_bytes: int,
) -> None:
    try:
        try:
            os.setsid()
        except PermissionError:
            os.setpgid(0, 0)
        connection.send(("ready", None))
        verdict = evaluator(evidence)
        if not isinstance(verdict, EvaluationVerdict):
            raise TypeError("pack evaluate must return EvaluationVerdict")
        payload = {
            "passed": verdict.passed,
            "checks": tuple(verdict.checks),
            "measurements": dict(verdict.measurements),
        }
        encoded = json.dumps(
            payload,
            default=str,
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
        if len(encoded) > max_output_bytes:
            raise ValueError("evaluator output exceeded max_output_bytes")
        connection.send(("verdict", payload))
    except BaseException as error:
        connection.send(
            (
                "error",
                {
                    "type": type(error).__name__,
                    "message": str(error),
                },
            )
        )
    finally:
        connection.close()


def _run_evaluator(
    evaluator: Callable[[EvaluationEvidence], EvaluationVerdict],
    evidence: EvaluationEvidence,
    *,
    timeout_seconds: float,
    max_output_bytes: int,
) -> object:
    if "fork" not in multiprocessing.get_all_start_methods():
        raise RuntimeError("evaluator isolation requires multiprocessing fork support")
    context = multiprocessing.get_context("fork")
    receive_connection, send_connection = context.Pipe(duplex=False)
    process = context.Process(
        target=_evaluator_process_entry,
        args=(send_connection, evaluator, evidence, max_output_bytes),
        name="domain-evaluator",
    )
    process.start()
    send_connection.close()
    group_ready = False
    try:
        if not receive_connection.poll(min(timeout_seconds, 1.0)):
            raise TimeoutError("evaluator process did not become ready")
        ready_kind, _ = receive_connection.recv()
        if ready_kind != "ready":
            raise RuntimeError("evaluator process readiness protocol failed")
        group_ready = True
        if not receive_connection.poll(timeout_seconds):
            raise TimeoutError("evaluator timeout reached")
        kind, payload = receive_connection.recv()
    except EOFError:
        raise RuntimeError("evaluator ended without a verdict") from None
    finally:
        receive_connection.close()
        _terminate_evaluator_process(process, group_ready=group_ready)
    if kind == "error":
        assert isinstance(payload, dict)
        raise RuntimeError(
            f"{payload.get('type', 'EvaluatorError')}: {payload.get('message', '')}"
        )
    if kind != "verdict" or not isinstance(payload, dict):
        raise RuntimeError("evaluator returned an invalid process payload")
    return EvaluationVerdict(
        passed=bool(payload["passed"]),
        checks=tuple(payload["checks"]),
        measurements=cast(Mapping[str, object], payload["measurements"]),
    )


def _terminate_evaluator_process(
    process: Any,
    *,
    group_ready: bool,
) -> None:
    if process.pid is None:
        return
    if group_ready:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        except PermissionError:
            if process.is_alive():
                process.terminate()
    elif process.is_alive():
        process.terminate()
    process.join(timeout=1)
    if process.is_alive():
        if group_ready:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except PermissionError:
                process.kill()
        else:
            process.kill()
        process.join(timeout=1)


def _reject_duplicate_capabilities(capabilities: Sequence[object]) -> None:
    identifiers = [getattr(item, "capability_id", None) for item in capabilities]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("duplicate capability_id")


def _paths_overlap(left: Path, right: Path) -> bool:
    return left == right or left in right.parents or right in left.parents


def _validate_limits(limits: RunLimits, *, field_name: str) -> None:
    if limits.max_steps <= 0 or limits.max_model_calls <= 0:
        raise ValueError(f"{field_name} step and model limits must be positive")
    if limits.timeout_seconds <= 0:
        raise ValueError(f"{field_name} timeout must be positive")


def _validate_runtime_config(config: RuntimeConfig) -> None:
    if config.interface_version <= 0 or config.trace_schema_version <= 0:
        raise ValueError("Runtime and Trace versions must be positive")
    _validate_limits(config.default_limits, field_name="default limits")
    _validate_limits(config.hard_limits, field_name="hard limits")
    if (
        config.default_limits.max_steps > config.hard_limits.max_steps
        or config.default_limits.max_model_calls > config.hard_limits.max_model_calls
        or config.default_limits.timeout_seconds > config.hard_limits.timeout_seconds
    ):
        raise ValueError("default limits cannot exceed hard limits")
    if (
        config.evaluator_limits.timeout_seconds <= 0
        or config.evaluator_limits.max_output_bytes <= 0
    ):
        raise ValueError("evaluator limits must be positive")
    control_root = config.control_root.resolve()
    workspace_root = config.workspace_root.resolve()
    if _paths_overlap(control_root, workspace_root):
        raise ValueError("control_root and workspace_root must be disjoint")


def _validate_compiled_spec(spec: DomainRunSpec, manifest: PackManifest) -> None:
    if spec.control.evaluator != manifest.evaluator:
        raise ValueError("compiled evaluator does not match frozen pack evaluator")
    declared = {
        item.capability_id: item for item in manifest.requested_capabilities
    }
    requested = {
        item.capability_id: item for item in spec.authority_request.capabilities
    }
    if not set(requested).issubset(declared):
        raise ValueError("compiled task requested an undeclared capability")
    if not set(spec.agent.requested_capabilities).issubset(requested):
        raise ValueError("agent projection requested an undeclared task capability")


def _validate_task_schema(task: object, schema: object) -> None:
    if not isinstance(schema, Mapping):
        raise ValueError("task schema must be an inspectable mapping")
    schema_type = schema.get("type")
    if schema_type != "object":
        raise ValueError(f"task schema type is unsupported: {schema_type!r}")
    if not isinstance(task, dict):
        raise ValueError("task schema requires an object")
    required = schema.get("required", ())
    if not isinstance(required, (list, tuple)) or any(
        not isinstance(name, str) for name in required
    ):
        raise ValueError("task schema required fields must be strings")
    missing = [name for name in required if name not in task]
    if missing:
        raise ValueError("task schema missing required fields: " + ", ".join(missing))


def _resolve_limits(
    overrides: RunLimitOverrides,
    *,
    pack_defaults: RunLimits | None,
    defaults: RunLimits,
    hard: RunLimits,
) -> RunLimits:
    base = pack_defaults or defaults
    values = RunLimits(
        max_steps=min(
            overrides.max_steps if overrides.max_steps is not None else base.max_steps,
            hard.max_steps,
        ),
        max_model_calls=min(
            overrides.max_model_calls
            if overrides.max_model_calls is not None
            else base.max_model_calls,
            hard.max_model_calls,
        ),
        timeout_seconds=min(
            overrides.timeout_seconds
            if overrides.timeout_seconds is not None
            else base.timeout_seconds,
            hard.timeout_seconds,
        ),
    )
    _validate_limits(values, field_name="effective limits")
    return values


def _resolve_authority(
    *,
    runtime: AuthorityGrant,
    caller: AuthorityGrant,
    pack: AuthorityRequest,
    task: AuthorityRequest,
    available: Mapping[str, Tool],
) -> AuthorityGrant:
    runtime_map = {item.capability_id: item for item in runtime.capabilities}
    caller_map = {item.capability_id: item for item in caller.capabilities}
    pack_map = {item.capability_id: item for item in pack.capabilities}
    effective: list[CapabilityGrant] = []
    for requirement in task.capabilities:
        capability_id = requirement.capability_id
        runtime_grant = runtime_map.get(capability_id)
        caller_grant = caller_map.get(capability_id)
        pack_requirement = pack_map.get(capability_id)
        if (
            runtime_grant is None
            or caller_grant is None
            or pack_requirement is None
        ):
            if requirement.required:
                raise ValueError(f"required capability is not authorized: {capability_id}")
            continue
        all_constraints = [
            dict(runtime_grant.constraints),
            dict(caller_grant.constraints),
            dict(pack_requirement.constraints),
            dict(requirement.constraints),
        ]
        if any(all_constraints):
            raise ValueError(
                f"capability constraints are not implemented: {capability_id}"
            )
        resource_sets = [
            set(runtime_grant.resources),
            set(caller_grant.resources),
            set(pack_requirement.resources),
            set(requirement.resources),
        ]
        resources = tuple(sorted(set.intersection(*resource_sets)))
        if not resources:
            if requirement.required:
                raise ValueError(
                    f"required capability has no common resource scope: {capability_id}"
                )
            continue
        tool = available.get(capability_id)
        if tool is None:
            if requirement.required:
                raise ValueError(f"required capability is unavailable: {capability_id}")
            continue
        if getattr(tool, "name", None) != capability_id:
            raise ValueError(f"capability Adapter name mismatch: {capability_id}")
        effective.append(CapabilityGrant(capability_id, resources))
    return AuthorityGrant(tuple(effective))


def _resource_allowed(resource: str, scopes: tuple[str, ...]) -> bool:
    if not resource or "\\" in resource or ".." in resource.split("/"):
        return False
    for scope in scopes:
        if scope == resource or scope == "*":
            return True
        if scope.endswith("/**"):
            prefix = scope[:-3].rstrip("/")
            if resource == prefix or resource.startswith(prefix + "/"):
                return True
    return False


def _validate_relative_workspace_path(relative_path: str) -> None:
    if (
        not relative_path
        or relative_path.startswith("/")
        or "\\" in relative_path
        or ":" in relative_path
    ):
        raise ValueError(f"invalid workspace-relative path: {relative_path!r}")
    parts = Path(relative_path).parts
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"invalid workspace-relative path: {relative_path!r}")


def _workspace_path(workspace: Path, resource: str) -> Path:
    if not resource.startswith("workspace:"):
        raise _PolicyViolation(f"resource is not in the workspace namespace: {resource!r}")
    relative_path = resource[len("workspace:") :]
    try:
        _validate_relative_workspace_path(relative_path)
    except ValueError as error:
        raise _PolicyViolation(str(error)) from error
    root = workspace.resolve()
    target = (root / relative_path).resolve()
    if not target.is_relative_to(root) or target == root:
        raise _PolicyViolation(f"workspace resource escaped its root: {resource!r}")
    return target


def _fixture_content_digest(files: Mapping[str, bytes]) -> str:
    digest = hashlib.sha256()
    for relative_path in sorted(files):
        path_bytes = relative_path.encode("utf-8")
        content = files[relative_path]
        digest.update(len(path_bytes).to_bytes(8, "big"))
        digest.update(path_bytes)
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return "sha256:" + digest.hexdigest()


def _freeze_workspace(source: Path, destination: Path) -> str:
    destination.mkdir(parents=True, exist_ok=False)
    files: dict[str, bytes] = {}
    total_bytes = 0
    for entry in sorted(source.rglob("*"), key=lambda path: path.as_posix()):
        if entry.is_symlink():
            raise ValueError("workspace snapshot cannot contain symbolic links")
        relative = entry.relative_to(source).as_posix()
        _validate_relative_workspace_path(relative)
        target = destination / relative
        if entry.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        if not entry.is_file():
            raise ValueError(f"workspace snapshot contains a special file: {relative}")
        if len(files) >= 1_000:
            raise ValueError("workspace snapshot exceeded the file-count limit")
        content = entry.read_bytes()
        total_bytes += len(content)
        if total_bytes > 10 * 1024 * 1024:
            raise ValueError("workspace snapshot exceeded the byte limit")
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as snapshot_file:
            snapshot_file.write(content)
        files[relative] = content
    return _fixture_content_digest(files)


def _agent_prompt(spec: DomainRunSpec) -> str:
    return json.dumps(
        {
            "goal": spec.agent.goal,
            "guidance": spec.agent.guidance,
            "task": spec.normalized_task,
            "visible_inputs": spec.agent.visible_inputs,
            "expected_artifacts": spec.agent.expected_artifacts,
        },
        default=str,
        sort_keys=True,
    )


def _result_payload(result: RunResult) -> dict[str, object]:
    return {
        "run_id": result.run_id,
        "task_id": result.task_id,
        "status": result.status.value,
        "output": result.output,
        "steps": result.steps,
        "model_calls": result.model_calls,
        "error": result.error,
    }


def _parse_action(raw_response: str) -> FinalAction | ToolAction:
    try:
        value = json.loads(raw_response)
    except json.JSONDecodeError:
        raise ValueError("model output is not valid JSON") from None
    if not isinstance(value, dict):
        raise ValueError("model output must be a JSON object")
    action_type = value.get("type")
    if action_type == "final" and isinstance(value.get("output"), str):
        return FinalAction(output=value["output"])
    if (
        action_type == "tool"
        and isinstance(value.get("tool"), str)
        and isinstance(value.get("arguments"), dict)
    ):
        return ToolAction(tool=value["tool"], arguments=value["arguments"])
    if action_type not in {"final", "tool"}:
        raise ValueError(f"unknown action type: {action_type!r}")
    raise ValueError(f"invalid {action_type} action payload")


def load_trace(path: Path) -> tuple[TraceEvent, ...]:
    allowed_event_types = {
        "run_started",
        "model_output",
        "tool_completed",
        "tool_failed",
        "run_completed",
    }
    events: list[TraceEvent] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise TraceValidationError(f"line {line_number}: invalid JSON") from error
        if not isinstance(value, dict):
            raise TraceValidationError(f"line {line_number}: event must be an object")
        try:
            event = TraceEvent(
                schema_version=value["schema_version"],
                run_id=value["run_id"],
                task_id=value["task_id"],
                sequence=value["sequence"],
                event_type=value["event_type"],
                payload=value["payload"],
            )
        except KeyError as error:
            raise TraceValidationError(
                f"line {line_number}: missing field {error.args[0]}"
            ) from error
        if event.schema_version != 1:
            raise TraceValidationError(
                f"line {line_number}: unsupported schema version {event.schema_version!r}"
            )
        if event.event_type not in allowed_event_types:
            raise TraceValidationError(
                f"line {line_number}: unknown event type {event.event_type!r}"
            )
        if not isinstance(event.payload, dict):
            raise TraceValidationError(f"line {line_number}: payload must be an object")
        events.append(event)

    if not events:
        raise TraceValidationError("trace is empty")
    if [event.sequence for event in events] != list(range(len(events))):
        raise TraceValidationError("trace sequence must be contiguous from zero")
    if events[0].event_type != "run_started" or events[-1].event_type != "run_completed":
        raise TraceValidationError("trace must start and end with run terminal events")
    terminal_result = events[-1].payload.get("result")
    if not isinstance(terminal_result, dict):
        raise TraceValidationError("terminal event must contain a result object")
    terminal_status = terminal_result.get("status")
    if terminal_status not in {status.value for status in RunStatus}:
        raise TraceValidationError(f"unknown terminal status {terminal_status!r}")
    if len({event.run_id for event in events}) != 1:
        raise TraceValidationError("trace contains multiple run IDs")
    if len({event.task_id for event in events}) != 1:
        raise TraceValidationError("trace contains multiple task IDs")
    return tuple(events)


__all__ = [
    "AgentProjection",
    "AgentLoop",
    "ArtifactSnapshotRef",
    "AuthorityGrant",
    "AuthorityRequest",
    "BenchmarkCase",
    "CampaignProvenance",
    "CampaignArtifactRef",
    "CampaignAttempt",
    "CampaignCaseRecord",
    "CampaignReport",
    "CampaignRequest",
    "CampaignSummary",
    "CaseEligibility",
    "CapabilityGrant",
    "CapabilityRequirement",
    "ComponentIdentity",
    "ControlProjection",
    "DomainRunSpec",
    "EvaluationEvidence",
    "EvaluationCampaign",
    "EvaluationRecord",
    "EvaluationStatus",
    "EvaluationVerdict",
    "EvaluatorIdentity",
    "EvaluatorLimits",
    "GeneralAgentRuntime",
    "LocalFixtureWorkspace",
    "LocalWorkspaceWriteTool",
    "ModelAdapter",
    "PackManifest",
    "PackSelector",
    "ProtectedFixtureRef",
    "RunLimitOverrides",
    "RunLimits",
    "RunReport",
    "RunRequest",
    "RunResult",
    "RunStatus",
    "RunUsage",
    "RuntimeAdapters",
    "RuntimeConfig",
    "RuntimeProvenance",
    "SuiteManifest",
    "SuiteSelector",
    "Task",
    "Tool",
    "TraceEvent",
    "TraceRef",
    "TraceValidationError",
    "VerticalDomainPack",
    "WorkspaceFactory",
    "benchmark_cases_hash",
    "benchmark_source_hash",
    "benchmark_transform_hash",
    "load_trace",
    "pack_content_hash",
    "suite_content_hash",
]
