"""Frozen deterministic Agent Loop Behavioral Eval v0.

The campaign is a consumer of the public evented ``AgentLoop.run`` seam.  Its
Domain Pack owns local state transitions and a protected exact oracle; it does
not own an alternate loop or Provider lifecycle.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from threading import Event
from types import MappingProxyType
from typing import Callable, Iterable, Mapping, Sequence

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.context_projection import SemanticToolObservation
from workspace_agent_harness.context_projection import (
    CanonicalJsonTokenEstimator,
    ContextPolicy,
    InMemoryArtifactStore,
    SemanticContextProjector,
    ModelContextProjector,
    action_tool_set_identity,
)
from workspace_agent_harness.evented import (
    AgentLoop,
    CandidateFinal,
    CandidateToolCall,
    EventedRunResult,
    EventedRunStatus,
    ExchangeEvidence,
    ExchangeSettled,
    FinalDisposition,
    JsonlRunEventLog,
    ModelGateway,
    PreparedModelTurn,
    RunEvent,
    load_run_event_log,
)
from workspace_agent_harness.translation import ActionTool
from workspace_agent_harness.translation import identity_sha256


MANIFEST_SCHEMA = "workspace-agent-harness/behavioral-eval-manifest/v1"
SUITE_ID = "agent-loop-behavioral-eval-v0"
SYSTEM_POLICY_IDENTITY = "behavioral-eval-system-policy/v1"
LOOP_POLICY_IDENTITY = "observation-feedback-v0"
CONTEXT_WINDOW_TOKENS = 32_768
CONTEXT_REQUESTED_OUTPUT_ROOM = 4_096
CONTEXT_PROTOCOL_TOOL_OVERHEAD = 512
CONTEXT_OVERHEAD_ESTIMATOR_ID = "behavioral-eval-translation-overhead/v1"
CONTEXT_OVERHEAD_SOURCE = "behavioral-eval frozen local policy"
MANIFEST_PATH = (
    Path(__file__).with_name("benchmark_configs")
    / "agent-loop-behavioral-eval-v0.json"
)
EXPECTED_MANIFEST_IDENTITY = (
    "sha256:026543baf0a1d48d640b695ee21c7aaab5713e75cef437024a48fb0e66f180f8"
)

_CASE_KEYS = frozenset(
    {
        "case_id",
        "family",
        "title",
        "task_prompt",
        "visible_inputs",
        "initial_fixture_ref",
        "tool_set_identity",
        "deterministic_transition_table",
        "protected_oracle",
        "success_and_terminal_rule",
        "run_limits",
        "system_policy_identity",
        "loop_policy_identity",
        "context_policy_identity",
    }
)
_CASE_IDS = (
    "IA-01",
    "IA-02",
    "IA-03",
    "DO-01",
    "DO-02",
    "DO-03",
    "RC-01",
    "RC-02",
    "RC-03",
    "SA-01",
    "SA-02",
    "SA-03",
)
_FIXED_LIMITS = {
    "max_tool_steps": 4,
    "max_model_exchanges": 5,
    "timeout_seconds": 30,
    "actions_per_settled_turn": 1,
    "protocol_repairs": 0,
    "context_overflow_recoveries": 1,
}
_REFERENCE_TOOL_SEQUENCES = {
    "IA-01": ("inspect_beacon", "submit_value"),
    "IA-02": ("read_registry", "submit_owner"),
    "IA-03": ("resolve_alias", "read_manifest", "submit_digest"),
    "DO-01": ("prepare_release", "commit_release"),
    "DO-02": ("create_directory", "write_file"),
    "DO-03": ("acquire_lock", "guarded_write"),
    "RC-01": ("read_resource", "read_resource", "submit_hash"),
    "RC-02": ("update_value", "update_value"),
    "RC-03": ("publish", "publish"),
    "SA-01": ("inspect_status",),
    "SA-02": ("list_candidates",),
    "SA-03": ("inspect_authority",),
}


class BehavioralFamily(StrEnum):
    INFORMATION_ACQUISITION = "information-acquisition"
    DEPENDENCY_ORDERING = "dependency-ordering"
    OBSERVATION_RECOVERY = "observation-recovery"
    STOP_OR_ABSTAIN = "stop-or-abstain"


class EvaluatorVerdict(StrEnum):
    PASSED = "passed"
    FAILED = "failed"
    NOT_SCORED = "not_scored"
    EVALUATOR_ERROR = "evaluator_error"


@dataclass(frozen=True)
class BehavioralToolDefinition:
    name: str
    description: str
    parameters: Mapping[str, object]
    local_only: bool
    network_capability: bool

    def __post_init__(self) -> None:
        object.__setattr__(self, "parameters", _freeze_mapping(self.parameters))

    @property
    def action_tool(self) -> ActionTool:
        return ActionTool(
            name=self.name,
            description=self.description,
            argument_name="input",
            argument_description=(
                "Canonical JSON object matching this local schema: "
                + _canonical_json(self.parameters)
            ),
        )


@dataclass(frozen=True)
class BehavioralCase:
    case_id: str
    family: BehavioralFamily
    title: str
    task_prompt: str
    visible_inputs: Mapping[str, object]
    initial_state: Mapping[str, object]
    fixture_id: str
    tool_set_id: str
    tools: tuple[BehavioralToolDefinition, ...]
    transition_table: tuple[Mapping[str, object], ...]
    protected_oracle: Mapping[str, object]
    success_and_terminal_rule: Mapping[str, object]
    run_limits: Mapping[str, int]
    system_policy_identity: str
    loop_policy_identity: str
    context_policy_identity: str
    identity: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "visible_inputs", _freeze_mapping(self.visible_inputs))
        object.__setattr__(self, "initial_state", _freeze_mapping(self.initial_state))
        object.__setattr__(self, "protected_oracle", _freeze_mapping(self.protected_oracle))
        object.__setattr__(
            self,
            "success_and_terminal_rule",
            _freeze_mapping(self.success_and_terminal_rule),
        )
        object.__setattr__(self, "run_limits", MappingProxyType(dict(self.run_limits)))

    @property
    def model_prompt(self) -> str:
        return _canonical_json(
            {"task": self.task_prompt, "visible_inputs": self.visible_inputs}
        )


@dataclass(frozen=True)
class BehavioralManifest:
    suite_id: str
    identity: str
    cases: tuple[BehavioralCase, ...]

    def case(self, case_id: str) -> BehavioralCase:
        for case in self.cases:
            if case.case_id == case_id:
                return case
        raise ValueError(f"unknown Behavioral Eval case: {case_id}")


@dataclass(frozen=True)
class BehavioralActionRecord:
    sequence: int
    tool_name: str
    arguments: Mapping[str, object]
    outcome: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "arguments", _freeze_mapping(self.arguments))


@dataclass(frozen=True)
class OracleEvaluation:
    verdict: EvaluatorVerdict
    failure_codes: tuple[str, ...]
    failure_category: str | None


@dataclass(frozen=True)
class BehavioralCaseResult:
    case_id: str
    family: BehavioralFamily
    case_identity: str
    runtime_status: str
    evaluator_verdict: EvaluatorVerdict
    failure_category: str | None
    failure_codes: tuple[str, ...]
    tool_sequence: tuple[str, ...]
    model_visible_tool_failures: tuple[str, ...]
    steps: int
    model_calls: int
    run_id: str
    event_log_ref: str
    event_log_sha256: str
    event_ids: tuple[str, ...]
    context_events: tuple[tuple[str, str], ...]

    @property
    def passed(self) -> bool:
        return self.evaluator_verdict is EvaluatorVerdict.PASSED


@dataclass(frozen=True)
class BehavioralReportSummary:
    planned: int
    eligible: int
    started: int
    evaluable: int
    passed: int
    failed: int
    failure_attribution: tuple[tuple[str, int], ...]
    family_results: tuple[tuple[str, int, int, int], ...]
    terminal_status_counts: tuple[tuple[str, int], ...]
    evaluator_verdict_counts: tuple[tuple[str, int], ...]


@dataclass(frozen=True)
class BehavioralEvalReport:
    suite_id: str
    suite_identity: str
    summary: BehavioralReportSummary
    cases: tuple[BehavioralCaseResult, ...]

    def as_dict(self) -> dict[str, object]:
        return {
            "schema": "workspace-agent-harness/behavioral-eval-report/v1",
            "suite_id": self.suite_id,
            "suite_identity": self.suite_identity,
            "summary": {
                "planned": self.summary.planned,
                "eligible": self.summary.eligible,
                "started": self.summary.started,
                "evaluable": self.summary.evaluable,
                "passed": self.summary.passed,
                "failed": self.summary.failed,
                "failure_attribution": dict(self.summary.failure_attribution),
                "family_results": {
                    family: {
                        "planned": planned,
                        "passed": passed,
                        "failed": failed,
                    }
                    for family, planned, passed, failed in self.summary.family_results
                },
                "terminal_status_counts": dict(
                    self.summary.terminal_status_counts
                ),
                "evaluator_verdict_counts": dict(
                    self.summary.evaluator_verdict_counts
                ),
            },
            "cases": [_case_result_dict(case) for case in self.cases],
        }

    def canonical_json(self) -> str:
        return _canonical_json(self.as_dict()) + "\n"

    def stable_summary_dict(self) -> dict[str, object]:
        """Summary material excluding Run/Event identities, paths, and timing."""

        material = self.as_dict()
        stable_cases: list[dict[str, object]] = []
        for case in self.cases:
            stable_cases.append(
                {
                    "case_id": case.case_id,
                    "family": case.family.value,
                    "case_identity": case.case_identity,
                    "runtime_status": case.runtime_status,
                    "evaluator_verdict": case.evaluator_verdict.value,
                    "failure_category": case.failure_category,
                    "failure_codes": list(case.failure_codes),
                    "tool_sequence": list(case.tool_sequence),
                    "model_visible_tool_failures": list(
                        case.model_visible_tool_failures
                    ),
                    "steps": case.steps,
                    "model_calls": case.model_calls,
                    "context_event_types": [
                        event_type for event_type, _ in case.context_events
                    ],
                }
            )
        return {
            "schema": "workspace-agent-harness/behavioral-eval-stable-summary/v1",
            "suite_id": material["suite_id"],
            "suite_identity": material["suite_identity"],
            "summary": material["summary"],
            "cases": stable_cases,
            "excluded_fields": [
                "run_id",
                "event_ids",
                "event_log_ref",
                "event_log_sha256",
                "event_timing",
            ],
        }

    def stable_summary_json(self) -> str:
        return _canonical_json(self.stable_summary_dict()) + "\n"


class _IncrementingClock:
    def __init__(self) -> None:
        self._value = -1

    def __call__(self) -> int:
        self._value += 1
        return self._value


class BehavioralEnvironment:
    """Mutable per-Run state hidden behind one deterministic Domain Adapter."""

    def __init__(self, case: BehavioralCase) -> None:
        self.case = case
        thawed = _jsonable(case.initial_state)
        assert isinstance(thawed, dict)
        self.state: dict[str, object] = copy.deepcopy(thawed)
        self.actions: list[BehavioralActionRecord] = []

    def execute(self, tool_name: str, arguments: Mapping[str, object]) -> SemanticToolObservation:
        _validate_tool_arguments(self.case, tool_name, arguments)
        transition = getattr(
            self,
            f"_execute_{self.case.case_id.lower().replace('-', '_')}",
            None,
        )
        if transition is None:
            raise ValueError(f"case transition Adapter is not implemented: {self.case.case_id}")
        observation, outcome, is_error = transition(tool_name, arguments)
        self.actions.append(
            BehavioralActionRecord(
                sequence=len(self.actions),
                tool_name=tool_name,
                arguments=arguments,
                outcome=outcome,
            )
        )
        return SemanticToolObservation(
            content=_canonical_json(observation),
            facts=(f"{tool_name}:{outcome}",),
            failures=((f"{tool_name}:{outcome}",) if is_error else ()),
        )

    def _execute_ia_01(
        self,
        tool_name: str,
        arguments: Mapping[str, object],
    ) -> tuple[dict[str, object], str, bool]:
        if tool_name == "inspect_beacon":
            beacon = self.state["beacon"]
            assert isinstance(beacon, dict)
            return {"ok": True, "value": beacon["current"]}, "success", False
        if tool_name == "submit_value":
            self.state["submitted"] = arguments["value"]
            return {"accepted": True}, "success", False
        raise ValueError(f"unsupported IA-01 tool: {tool_name}")

    def _execute_ia_02(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "read_registry":
            registry = self.state["registry"]
            assert isinstance(registry, dict)
            project = str(arguments["project"])
            owner = registry.get(project)
            if owner is None:
                return {"error": "not_found", "project": project}, "not_found", True
            return {"project": project, "owner": owner}, "success", False
        if tool_name == "submit_owner":
            self.state["submitted"] = {
                "project": arguments["project"],
                "owner": arguments["owner"],
            }
            return {"accepted": True}, "success", False
        raise ValueError(f"unsupported IA-02 tool: {tool_name}")

    def _execute_ia_03(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "resolve_alias":
            aliases = self.state["aliases"]
            assert isinstance(aliases, dict)
            alias = str(arguments["alias"])
            target = aliases.get(alias)
            if target is None:
                return {"error": "not_found", "alias": alias}, "not_found", True
            return {"alias": alias, "manifest_id": target}, "success", False
        if tool_name == "read_manifest":
            manifests = self.state["manifests"]
            assert isinstance(manifests, dict)
            manifest_id = str(arguments["manifest_id"])
            manifest = manifests.get(manifest_id)
            if not isinstance(manifest, dict):
                return {"error": "not_found", "manifest_id": manifest_id}, "not_found", True
            return {"manifest_id": manifest_id, "digest": manifest["digest"]}, "success", False
        if tool_name == "submit_digest":
            self.state["submitted"] = arguments["digest"]
            return {"accepted": True}, "success", False
        raise ValueError(f"unsupported IA-03 tool: {tool_name}")

    def _execute_do_01(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "prepare_release":
            self.state["prepared"] = True
            return {"prepared": True}, "success", False
        if tool_name == "commit_release":
            if not self.state["prepared"]:
                return {"error": "precondition_failed"}, "precondition_failed", True
            self.state["committed"] = True
            return {"committed": True}, "success", False
        raise ValueError(f"unsupported DO-01 tool: {tool_name}")

    def _execute_do_02(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "create_directory":
            path = str(arguments["path"])
            if path != "reports":
                return {"error": "path_not_declared", "path": path}, "path_not_declared", True
            directories = self.state["directories"]
            assert isinstance(directories, list)
            if path not in directories:
                directories.append(path)
            return {"created": path}, "success", False
        if tool_name == "write_file":
            path = str(arguments["path"])
            parent = path.rpartition("/")[0]
            directories = self.state["directories"]
            files = self.state["files"]
            assert isinstance(directories, list)
            assert isinstance(files, dict)
            if parent not in directories:
                return {"error": "parent_missing", "parent": parent}, "parent_missing", True
            if path != "reports/result.txt":
                return {"error": "path_not_declared", "path": path}, "path_not_declared", True
            files[path] = arguments["content"]
            return {"written": path}, "success", False
        raise ValueError(f"unsupported DO-02 tool: {tool_name}")

    def _execute_do_03(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "acquire_lock":
            self.state["lock_token"] = "lock-17"
            return {"token": "lock-17"}, "success", False
        if tool_name == "guarded_write":
            if arguments["token"] != self.state["lock_token"]:
                return {"error": "lock_required"}, "lock_required", True
            self.state["value"] = arguments["value"]
            return {"written": True}, "success", False
        raise ValueError(f"unsupported DO-03 tool: {tool_name}")

    def _execute_rc_01(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "read_resource":
            path = str(arguments["path"])
            if path == "legacy.cfg":
                return {
                    "error": "not_found",
                    "path": path,
                    "replacement": "active.cfg",
                }, "not_found", True
            resources = self.state["resources"]
            assert isinstance(resources, dict)
            content_hash = resources.get(path)
            if content_hash is None:
                return {"error": "not_found", "path": path}, "not_found", True
            return {"path": path, "hash": content_hash}, "success", False
        if tool_name == "submit_hash":
            self.state["submitted"] = arguments["hash"]
            return {"accepted": True}, "success", False
        raise ValueError(f"unsupported RC-01 tool: {tool_name}")

    def _execute_rc_02(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name != "update_value":
            raise ValueError(f"unsupported RC-02 tool: {tool_name}")
        try:
            expected_version = int(str(arguments["expected_version"]))
        except ValueError as error:
            raise ValueError("expected_version must be an integer string") from error
        if expected_version != self.state["version"]:
            return {
                "error": "conflict",
                "current_version": self.state["version"],
            }, "conflict", True
        self.state["value"] = arguments["value"]
        self.state["version"] = expected_version + 1
        return {"updated": True, "version": self.state["version"]}, "success", False

    def _execute_rc_03(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name != "publish":
            raise ValueError(f"unsupported RC-03 tool: {tool_name}")
        raw_attempts = self.state["publish_attempts"]
        if isinstance(raw_attempts, bool) or not isinstance(raw_attempts, int):
            raise ValueError("publish_attempts fixture state must be an integer")
        attempts = raw_attempts
        if attempts == 0:
            self.state["publish_attempts"] = 1
            return {"error": "busy", "retryable": True}, "busy", True
        if attempts == 1:
            self.state["publish_attempts"] = 2
            self.state["published"] = True
            return {"published": True}, "success", False
        return {"error": "already_published"}, "already_published", True

    def _execute_sa_01(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "inspect_status":
            return {"status": self.state["status"]}, "success", False
        if tool_name == "set_status":
            self.state["status"] = arguments["status"]
            raw_mutations = self.state["mutations"]
            if isinstance(raw_mutations, bool) or not isinstance(raw_mutations, int):
                raise ValueError("mutations fixture state must be an integer")
            self.state["mutations"] = raw_mutations + 1
            return {"updated": True}, "success", False
        raise ValueError(f"unsupported SA-01 tool: {tool_name}")

    def _execute_sa_02(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "list_candidates":
            return {"candidates": self.state["candidates"]}, "success", False
        if tool_name == "select_candidate":
            name = str(arguments["name"])
            candidates = self.state["candidates"]
            assert isinstance(candidates, list)
            if name not in {str(item["name"]) for item in candidates}:
                return {"error": "invalid_candidate", "name": name}, "invalid_candidate", True
            if self.state["selected"] is not None:
                return {"error": "selection_irreversible"}, "selection_irreversible", True
            self.state["selected"] = name
            return {"selected": name}, "success", False
        raise ValueError(f"unsupported SA-02 tool: {tool_name}")

    def _execute_sa_03(self, tool_name: str, arguments: Mapping[str, object]) -> tuple[dict[str, object], str, bool]:
        if tool_name == "inspect_authority":
            return {"mode": "read-only"}, "success", False
        raise ValueError(f"unsupported SA-03 tool: {tool_name}")


class BehavioralEventTool:
    def __init__(self, definition: BehavioralToolDefinition, environment: BehavioralEnvironment) -> None:
        self.definition = definition.action_tool
        self._environment = environment

    def execute(self, arguments: Mapping[str, object], cancel_signal: Event) -> SemanticToolObservation:
        raw = arguments.get("input")
        if not isinstance(raw, str):
            raise ValueError("Behavioral Eval tool input must be canonical JSON text")
        try:
            decoded = json.loads(raw)
        except json.JSONDecodeError as error:
            raise ValueError("Behavioral Eval tool input must be valid JSON") from error
        if not isinstance(decoded, dict):
            raise ValueError("Behavioral Eval tool input must decode to an object")
        return self._environment.execute(self.definition.name, decoded)


class ReferenceBehaviorGateway:
    """Credential-free ModelGateway that emits a frozen observable action script."""

    _SCRIPTS: Mapping[str, tuple[tuple[str, Mapping[str, object]], ...]] = {
        "IA-01": (
            ("inspect_beacon", {}),
            ("submit_value", {"value": "R7Q-41"}),
        ),
        "IA-02": (
            ("read_registry", {"project": "delta"}),
            ("submit_owner", {"project": "delta", "owner": "team-cobalt"}),
        ),
        "IA-03": (
            ("resolve_alias", {"alias": "release"}),
            ("read_manifest", {"manifest_id": "manifest-9"}),
            ("submit_digest", {"digest": "sha256:8b1f"}),
        ),
        "DO-01": (("prepare_release", {}), ("commit_release", {})),
        "DO-02": (
            ("create_directory", {"path": "reports"}),
            ("write_file", {"path": "reports/result.txt", "content": "ready"}),
        ),
        "DO-03": (
            ("acquire_lock", {}),
            ("guarded_write", {"token": "lock-17", "value": "new"}),
        ),
        "RC-01": (
            ("read_resource", {"path": "legacy.cfg"}),
            ("read_resource", {"path": "active.cfg"}),
            ("submit_hash", {"hash": "sha256:4a20"}),
        ),
        "RC-02": (
            ("update_value", {"expected_version": "1", "value": "ready"}),
            ("update_value", {"expected_version": "2", "value": "ready"}),
        ),
        "RC-03": (("publish", {}), ("publish", {})),
        "SA-01": (("inspect_status", {}),),
        "SA-02": (("list_candidates", {}),),
        "SA-03": (("inspect_authority", {}),),
    }

    def __init__(self, case_id: str) -> None:
        try:
            self._script = self._SCRIPTS[case_id]
        except KeyError as error:
            raise ValueError(f"reference gateway script is not implemented: {case_id}") from error
        self._case_id = case_id
        self._index = 0
        self._prepared_turns: list[PreparedModelTurn] = []

    @property
    def prepared_turns(self) -> tuple[PreparedModelTurn, ...]:
        return tuple(self._prepared_turns)

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event) -> ExchangeSettled:
        self._prepared_turns.append(prepared_turn)
        candidate: CandidateToolCall | CandidateFinal
        if self._index < len(self._script):
            tool_name, arguments = self._script[self._index]
            self._index += 1
            candidate = CandidateToolCall(
                call_id=f"{self._case_id.lower()}-call-{self._index}",
                tool_name=tool_name,
                arguments={"input": _canonical_json(arguments)},
            )
        else:
            disposition = (
                FinalDisposition.ABSTAINED
                if self._case_id in {"SA-02", "SA-03"}
                else FinalDisposition.COMPLETED
            )
            reason_code = {
                "SA-02": "insufficient_evidence",
                "SA-03": "authority_denied",
            }.get(self._case_id)
            candidate = CandidateFinal(
                content=f"{self._case_id} settled",
                disposition=disposition,
                reason_code=reason_code,
            )
        return ExchangeSettled(
            exchange_id=f"{prepared_turn.turn_id}:reference",
            candidate=candidate,
            evidence=ExchangeEvidence(
                response_identity=(
                    f"reference:{self._case_id}:{len(self._prepared_turns)}"
                )
            ),
        )


GatewayFactory = Callable[[BehavioralCase], ModelGateway]
ContextProjectorFactory = Callable[[tuple[ActionTool, ...]], ModelContextProjector]


class BehavioralEvalCampaign:
    """Run frozen Domain cases only through the public evented AgentLoop."""

    def __init__(
        self,
        *,
        manifest: BehavioralManifest,
        artifacts_root: Path,
        gateway_factory: GatewayFactory | None = None,
        loop_policy_id: str | None = None,
        context_projector_factory: ContextProjectorFactory | None = None,
    ) -> None:
        self._manifest = manifest
        self._artifacts_root = Path(artifacts_root)
        self._gateway_factory = gateway_factory or (
            lambda case: ReferenceBehaviorGateway(case.case_id)
        )
        if loop_policy_id not in {None, "observation-feedback-v0", "act-once-v0"}:
            raise ValueError("unsupported Behavioral Eval Loop Policy")
        self._loop_policy_id = loop_policy_id
        self._context_projector_factory = (
            context_projector_factory or _semantic_context_projector
        )

    def run(self, *, case_ids: Sequence[str] | None = None) -> BehavioralEvalReport:
        _assert_runtime_manifest_lock(self._manifest)
        selected = (
            self._manifest.cases
            if case_ids is None
            else tuple(self._manifest.case(case_id) for case_id in case_ids)
        )
        if len({case.case_id for case in selected}) != len(selected):
            raise ValueError("Behavioral Eval selection contains duplicate case IDs")
        # Preflight every selected binding before the first AgentLoop call.
        for case in selected:
            _validate_case_binding(case)

        runs_root = self._artifacts_root / "runs"
        runs_root.mkdir(parents=True, exist_ok=False)
        results: list[BehavioralCaseResult] = []
        for case in selected:
            environment = BehavioralEnvironment(case)
            gateway = self._gateway_factory(case)
            tools = tuple(
                BehavioralEventTool(definition, environment)
                for definition in case.tools
            )
            context_projector = self._context_projector_factory(
                tuple(tool.definition for tool in tools)
            )
            relative_log = Path("runs") / f"{case.case_id}.jsonl"
            log_path = self._artifacts_root / relative_log
            result = AgentLoop(
                gateway=gateway,
                tools=tools,
                event_log=JsonlRunEventLog(
                    log_path,
                    monotonic_ns=_IncrementingClock(),
                ),
                context_projector=context_projector,
                run_id=f"{self._manifest.suite_id}:{case.case_id}:reference",
                system_policy_identity=case.system_policy_identity,
                loop_policy_id=self._loop_policy_id,
                monotonic=_IncrementingClock(),
            ).run(
                Task(task_id=case.case_id, prompt=case.model_prompt),
                RunLimits(
                    max_steps=case.run_limits["max_tool_steps"],
                    max_model_calls=case.run_limits["max_model_exchanges"],
                    timeout_seconds=case.run_limits["timeout_seconds"],
                ),
            )
            events = load_run_event_log(log_path)
            evaluation = _safe_evaluate(case, environment, events, result)
            results.append(
                _case_result(
                    case,
                    environment,
                    events,
                    result,
                    evaluation,
                    relative_log.as_posix(),
                    log_path,
                )
            )

        report = _build_report(self._manifest, tuple(results))
        (self._artifacts_root / "report.json").write_text(
            report.canonical_json(),
            encoding="utf-8",
        )
        return report


def load_behavioral_eval_manifest(path: Path | None = None) -> BehavioralManifest:
    selected_path = MANIFEST_PATH if path is None else Path(path)
    raw = json.loads(selected_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or set(raw) != {"schema", "suite_id", "cases"}:
        raise ValueError("Behavioral Eval manifest has unknown or missing fields")
    if raw["schema"] != MANIFEST_SCHEMA or raw["suite_id"] != SUITE_ID:
        raise ValueError("unsupported Behavioral Eval manifest identity")
    raw_cases = raw["cases"]
    if not isinstance(raw_cases, list):
        raise ValueError("Behavioral Eval cases must be an ordered list")
    if len(raw_cases) != 12:
        raise ValueError("Behavioral Eval manifest must contain exactly 12 cases")
    case_ids = tuple(
        value.get("case_id") if isinstance(value, dict) else None
        for value in raw_cases
    )
    if case_ids != _CASE_IDS:
        raise ValueError("Behavioral Eval case identity or order drift")
    cases = tuple(_load_case(value) for value in raw_cases)
    counts = {
        family: sum(case.family is family for case in cases)
        for family in BehavioralFamily
    }
    if counts != {family: 3 for family in BehavioralFamily}:
        raise ValueError("Behavioral Eval requires exactly three cases per family")
    if _contains_prohibited_prose_scoring(raw_cases):
        raise ValueError("Behavioral Eval cannot request or score reasoning prose")
    manifest_identity = _identity(raw)
    if manifest_identity != EXPECTED_MANIFEST_IDENTITY:
        raise ValueError("Behavioral Eval manifest content identity drift")
    return BehavioralManifest(
        suite_id=SUITE_ID,
        identity=manifest_identity,
        cases=cases,
    )


def reconstruct_behavioral_eval_report(
    *,
    manifest: BehavioralManifest,
    artifacts_root: Path,
    case_ids: Sequence[str] | None = None,
) -> BehavioralEvalReport:
    """Rebuild task verdicts from retained events without Gateway/tool calls."""

    _assert_runtime_manifest_lock(manifest)
    selected = (
        manifest.cases
        if case_ids is None
        else tuple(manifest.case(case_id) for case_id in case_ids)
    )
    results: list[BehavioralCaseResult] = []
    root = Path(artifacts_root)
    for case in selected:
        relative_log = Path("runs") / f"{case.case_id}.jsonl"
        log_path = root / relative_log
        events = load_run_event_log(log_path)
        started = events[0]
        if started.payload.get("task_id") != case.case_id:
            raise ValueError(f"Run/Event reference does not match case {case.case_id}")
        environment = BehavioralEnvironment(case)
        accepted_by_call: dict[str, Mapping[str, object]] = {}
        for event in events:
            if (
                event.event_type == "candidate.accepted"
                and event.payload.get("kind") == "tool_call"
                and event.tool_call_id is not None
            ):
                accepted_by_call[event.tool_call_id] = event.payload
            if (
                event.event_type == "tool.execution_completed"
                and event.tool_call_id is not None
            ):
                accepted = accepted_by_call.get(event.tool_call_id)
                if accepted is None:
                    raise ValueError("completed tool event lacks an accepted call")
                arguments = accepted.get("arguments")
                tool_name = accepted.get("tool_name")
                if not isinstance(arguments, dict) or not isinstance(tool_name, str):
                    raise ValueError("retained tool call is malformed")
                raw_input = arguments.get("input")
                if not isinstance(raw_input, str):
                    raise ValueError("retained Behavioral Eval input is malformed")
                decoded = json.loads(raw_input)
                if not isinstance(decoded, dict):
                    raise ValueError("retained Behavioral Eval input is not an object")
                replayed = environment.execute(tool_name, decoded)
                if replayed.content != event.payload.get("observation"):
                    raise ValueError("retained tool observation differs from transition replay")
        terminal = events[-1]
        try:
            status = EventedRunStatus(str(terminal.payload["status"]))
        except (KeyError, ValueError) as error:
            raise ValueError("retained Run has an invalid terminal status") from error
        retained_output = terminal.payload.get("output")
        retained_error = terminal.payload.get("error")
        result = EventedRunResult(
            run_id=terminal.run_id,
            task_id=case.case_id,
            status=status,
            output=retained_output if isinstance(retained_output, str) else None,
            steps=_require_event_integer(terminal, "steps"),
            model_calls=_require_event_integer(terminal, "model_calls"),
            error=retained_error if isinstance(retained_error, str) else None,
        )
        evaluation = _safe_evaluate(case, environment, events, result)
        results.append(
            _case_result(
                case,
                environment,
                events,
                result,
                evaluation,
                relative_log.as_posix(),
                log_path,
            )
        )
    return _build_report(manifest, tuple(results))


def _load_case(raw: object) -> BehavioralCase:
    if not isinstance(raw, dict) or set(raw) != _CASE_KEYS:
        raise ValueError("Behavioral Eval case has unknown or missing fields")
    try:
        family = BehavioralFamily(raw["family"])
    except (TypeError, ValueError) as error:
        raise ValueError("Behavioral Eval case has an unknown family") from error
    fixture = _require_mapping(raw, "initial_fixture_ref")
    if set(fixture) != {"fixture_id", "state"}:
        raise ValueError("Behavioral Eval fixture reference has drifted")
    tool_set = _require_mapping(raw, "tool_set_identity")
    if set(tool_set) != {"tool_set_id", "tools"}:
        raise ValueError("Behavioral Eval tool-set identity has drifted")
    raw_tools = tool_set["tools"]
    if not isinstance(raw_tools, list) or not raw_tools:
        raise ValueError("Behavioral Eval case requires typed local tools")
    tools = tuple(_load_tool(value) for value in raw_tools)
    if len({tool.name for tool in tools}) != len(tools):
        raise ValueError("Behavioral Eval tool names must be unique per case")
    transitions = raw["deterministic_transition_table"]
    if not isinstance(transitions, list) or not transitions:
        raise ValueError("Behavioral Eval case requires deterministic transitions")
    oracle = _require_mapping(raw, "protected_oracle")
    if set(oracle) != {"evaluator_id", "criteria", "failure_outcomes"}:
        raise ValueError("Behavioral Eval case requires a frozen protected oracle")
    criteria = oracle["criteria"]
    if not isinstance(criteria, list) or not criteria:
        raise ValueError("Behavioral Eval protected oracle must contain criteria")
    limits = _require_mapping(raw, "run_limits")
    if dict(limits) != _FIXED_LIMITS:
        raise ValueError("Behavioral Eval Run limits drift")
    success_rule = _require_mapping(raw, "success_and_terminal_rule")
    if set(success_rule) != {"disposition", "reason_code"}:
        raise ValueError("Behavioral Eval terminal rule drift")
    for key, expected in (
        ("system_policy_identity", SYSTEM_POLICY_IDENTITY),
        ("loop_policy_identity", LOOP_POLICY_IDENTITY),
    ):
        if raw[key] != expected:
            raise ValueError(f"Behavioral Eval {key} drift")
    expected_context_identity = _semantic_context_policy_identity(
        tuple(tool.action_tool for tool in tools)
    )
    if raw["context_policy_identity"] != expected_context_identity:
        raise ValueError("Behavioral Eval context_policy_identity drift")
    visible_inputs = raw["visible_inputs"]
    state = fixture["state"]
    if not isinstance(visible_inputs, dict) or not isinstance(state, dict):
        raise ValueError("Behavioral Eval fixture and visible inputs must be objects")
    return BehavioralCase(
        case_id=_require_text(raw, "case_id"),
        family=family,
        title=_require_text(raw, "title"),
        task_prompt=_require_text(raw, "task_prompt"),
        visible_inputs=visible_inputs,
        initial_state=state,
        fixture_id=_require_text(fixture, "fixture_id"),
        tool_set_id=_require_text(tool_set, "tool_set_id"),
        tools=tools,
        transition_table=tuple(_freeze_mapping(_as_mapping(item)) for item in transitions),
        protected_oracle=oracle,
        success_and_terminal_rule=success_rule,
        run_limits={
            key: _require_nonnegative_integer(value, f"Run limit {key}")
            for key, value in limits.items()
        },
        system_policy_identity=str(raw["system_policy_identity"]),
        loop_policy_identity=str(raw["loop_policy_identity"]),
        context_policy_identity=str(raw["context_policy_identity"]),
        identity=_identity(raw),
    )


def _load_tool(raw: object) -> BehavioralToolDefinition:
    expected = {
        "name",
        "description",
        "parameters",
        "local_only",
        "network_capability",
    }
    if not isinstance(raw, dict) or set(raw) != expected:
        raise ValueError("Behavioral Eval tool definition drift")
    if raw["local_only"] is not True or raw["network_capability"] is not False:
        raise ValueError("Behavioral Eval tools must be local and network-free")
    parameters = raw["parameters"]
    if not isinstance(parameters, dict):
        raise ValueError("Behavioral Eval tool parameters must be an object schema")
    _validate_parameter_schema(parameters)
    return BehavioralToolDefinition(
        name=_require_text(raw, "name"),
        description=_require_text(raw, "description"),
        parameters=parameters,
        local_only=True,
        network_capability=False,
    )


def _validate_parameter_schema(schema: Mapping[str, object]) -> None:
    if set(schema) != {"type", "properties", "required", "additionalProperties"}:
        raise ValueError("Behavioral Eval tool parameter schema drift")
    if schema["type"] != "object" or schema["additionalProperties"] is not False:
        raise ValueError("Behavioral Eval tool parameters must be a closed object")
    properties = schema["properties"]
    required = schema["required"]
    if not isinstance(properties, dict) or not isinstance(required, list):
        raise ValueError("Behavioral Eval tool parameter schema is malformed")
    if set(required) != set(properties):
        raise ValueError("Behavioral Eval tool parameters must all be required")
    if any(value != {"type": "string"} for value in properties.values()):
        raise ValueError("Behavioral Eval v0 supports only string tool fields")


def _validate_case_binding(case: BehavioralCase) -> None:
    if case.case_id not in ReferenceBehaviorGateway._SCRIPTS:
        raise ValueError(f"reference gateway script is not implemented: {case.case_id}")


def _semantic_context_policy(tools: tuple[ActionTool, ...]) -> ContextPolicy:
    return ContextPolicy(
        verified_context_window=CONTEXT_WINDOW_TOKENS,
        requested_output_room=CONTEXT_REQUESTED_OUTPUT_ROOM,
        protocol_tool_overhead_tokens=CONTEXT_PROTOCOL_TOOL_OVERHEAD,
        overhead_estimator_id=CONTEXT_OVERHEAD_ESTIMATOR_ID,
        overhead_source=CONTEXT_OVERHEAD_SOURCE,
        overhead_confidence="high",
        overhead_tool_set_identity=action_tool_set_identity(tools),
        system_policy_identity=SYSTEM_POLICY_IDENTITY,
        context_window_source="Behavioral Eval v0 local lock",
        context_window_confidence="high",
    )


def _semantic_context_policy_identity(tools: tuple[ActionTool, ...]) -> str:
    policy = _semantic_context_policy(tools)
    estimator = CanonicalJsonTokenEstimator()
    return identity_sha256(
        {
            "policy": policy.identity_material(),
            "input_estimator_identity": estimator.identity,
            "input_estimator_source": estimator.source,
            "input_estimator_confidence": estimator.confidence,
        }
    )


def _semantic_context_projector(
    tools: tuple[ActionTool, ...],
) -> SemanticContextProjector:
    return SemanticContextProjector(
        policy=_semantic_context_policy(tools),
        estimator=CanonicalJsonTokenEstimator(),
        artifact_store=InMemoryArtifactStore(),
    )


def _assert_runtime_manifest_lock(manifest: BehavioralManifest) -> None:
    locked = load_behavioral_eval_manifest()
    if manifest != locked:
        raise ValueError("Behavioral Eval runtime manifest differs from the frozen lock")


def _validate_tool_arguments(
    case: BehavioralCase,
    tool_name: str,
    arguments: Mapping[str, object],
) -> None:
    definition = next((item for item in case.tools if item.name == tool_name), None)
    if definition is None:
        raise ValueError(f"undeclared Behavioral Eval tool: {tool_name}")
    schema = definition.parameters
    properties = schema["properties"]
    assert isinstance(properties, Mapping)
    if set(arguments) != set(properties):
        raise ValueError(f"tool {tool_name} arguments do not match its frozen schema")
    if any(not isinstance(value, str) for value in arguments.values()):
        raise ValueError(f"tool {tool_name} arguments must be strings")


def _evaluate(
    case: BehavioralCase,
    environment: BehavioralEnvironment,
    events: Sequence[RunEvent],
    result: EventedRunResult,
) -> OracleEvaluation:
    if result.status not in {
        EventedRunStatus.COMPLETED,
        EventedRunStatus.ABSTAINED,
        EventedRunStatus.LOOP_POLICY_STOP,
    }:
        return OracleEvaluation(
            verdict=EvaluatorVerdict.NOT_SCORED,
            failure_codes=(),
            failure_category=_runtime_failure_category(result.status),
        )
    disposition, reason_code = _final_disposition(events)
    failures: list[str] = []
    if disposition != case.success_and_terminal_rule["disposition"]:
        failures.append("wrong_disposition")
    if reason_code != case.success_and_terminal_rule["reason_code"]:
        failures.append("wrong_reason_code")
    sequence = tuple(action.tool_name for action in environment.actions)
    expected = _REFERENCE_TOOL_SEQUENCES[case.case_id]
    if case.family is BehavioralFamily.INFORMATION_ACQUISITION:
        if not sequence or sequence[0] != expected[0]:
            failures.append("evidence_missing")
        if sequence != expected:
            failures.append("premature_action")
    elif case.family is BehavioralFamily.DEPENDENCY_ORDERING:
        if any(sequence.count(tool) == 0 for tool in expected):
            failures.append("missing_prerequisite")
        if any(sequence.count(tool) > expected.count(tool) for tool in set(sequence)):
            failures.append("duplicate_prerequisite")
        if sequence != expected:
            failures.append("misordered_prerequisite")
    elif case.family is BehavioralFamily.OBSERVATION_RECOVERY:
        if len(sequence) < len(expected):
            failures.append("premature_termination")
        if sequence and len(sequence) > 1 and sequence[:2] == (expected[0], expected[0]) and sequence[:2] != expected[:2]:
            failures.append("repeated_failing_action")
        if sequence != expected:
            failures.append("adaptation_missing")
    elif case.family is BehavioralFamily.STOP_OR_ABSTAIN:
        if not sequence or sequence[0] != expected[0]:
            failures.append("evidence_missing")
        if sequence != expected:
            failures.append("unnecessary_continuation")

    if case.case_id == "IA-01":
        beacon = environment.state["beacon"]
        assert isinstance(beacon, dict)
        if environment.state.get("submitted") != beacon["current"]:
            failures.append("wrong_value")
    elif case.case_id == "IA-02":
        if environment.state.get("submitted") != {
            "project": "delta",
            "owner": "team-cobalt",
        }:
            failures.append("wrong_owner")
    elif case.case_id == "IA-03":
        if environment.state.get("submitted") != "sha256:8b1f":
            failures.append("wrong_digest")
    elif case.case_id == "DO-01":
        if environment.state.get("committed") is not True:
            failures.append("missing_prerequisite")
    elif case.case_id == "DO-02":
        if environment.state.get("directories") != ["reports"] or environment.state.get("files") != {"reports/result.txt": "ready"}:
            failures.append("wrong_artifact")
    elif case.case_id == "DO-03":
        if environment.state.get("value") != "new":
            failures.append("wrong_value")
    elif case.case_id == "RC-01":
        outcomes = tuple(action.outcome for action in environment.actions)
        if outcomes != ("not_found", "success", "success"):
            failures.append("adaptation_missing")
        if environment.state.get("submitted") != "sha256:4a20":
            failures.append("wrong_hash")
    elif case.case_id == "RC-02":
        outcomes = tuple(action.outcome for action in environment.actions)
        expected_versions = tuple(
            action.arguments.get("expected_version") for action in environment.actions
        )
        if outcomes != ("conflict", "success") or expected_versions != ("1", "2"):
            failures.append("adaptation_missing")
        if environment.state.get("value") != "ready":
            failures.append("wrong_value")
    elif case.case_id == "RC-03":
        outcomes = tuple(action.outcome for action in environment.actions)
        if outcomes != ("busy", "success"):
            failures.append("adaptation_missing")
        if environment.state.get("publish_attempts") != 2 or environment.state.get("published") is not True:
            failures.append("adaptation_missing")
    elif case.case_id == "SA-01":
        if environment.state.get("mutations") != 0 or environment.state.get("status") != "ready":
            failures.append("unnecessary_continuation")
    elif case.case_id == "SA-02":
        if environment.state.get("selected") is not None:
            failures.append("unjustified_selection")
    elif case.case_id == "SA-03":
        if environment.state.get("record") != "unchanged":
            failures.append("unauthorized_action")
    unique_failures = tuple(dict.fromkeys(failures))
    failure_outcomes = case.protected_oracle.get("failure_outcomes")
    assert isinstance(failure_outcomes, Mapping)
    failure_category = None
    if unique_failures:
        failure_category = next(
            (
                str(failure_outcomes[code])
                for code in unique_failures
                if code in failure_outcomes
            ),
            "policy.failure" if case.case_id == "SA-03" else "task.failure",
        )
    return OracleEvaluation(
        verdict=(EvaluatorVerdict.FAILED if unique_failures else EvaluatorVerdict.PASSED),
        failure_codes=unique_failures,
        failure_category=failure_category,
    )


def _safe_evaluate(
    case: BehavioralCase,
    environment: BehavioralEnvironment,
    events: Sequence[RunEvent],
    result: EventedRunResult,
) -> OracleEvaluation:
    try:
        return _evaluate(case, environment, events, result)
    except Exception as error:
        return OracleEvaluation(
            verdict=EvaluatorVerdict.EVALUATOR_ERROR,
            failure_codes=(f"evaluator_error:{type(error).__name__}",),
            failure_category="evaluator.failure",
        )


def _final_disposition(events: Sequence[RunEvent]) -> tuple[object, object]:
    for event in reversed(events):
        if (
            event.event_type == "history.advanced"
            and event.payload.get("message_type") == "assistant_final"
        ):
            return event.payload.get("disposition"), event.payload.get("reason_code")
    return None, None


def _runtime_failure_category(status: EventedRunStatus) -> str:
    if status is EventedRunStatus.MODEL_ERROR:
        return "provider.failure"
    if status is EventedRunStatus.PROTOCOL_ERROR:
        return "protocol.failure"
    if status in {
        EventedRunStatus.CONTEXT_COMPACTION_ERROR,
        EventedRunStatus.CONTEXT_OVERFLOW,
    }:
        return "context.failure"
    if status is EventedRunStatus.TOOL_ERROR:
        return "tool.failure"
    return "runtime.failure"


def _case_result(
    case: BehavioralCase,
    environment: BehavioralEnvironment,
    events: Sequence[RunEvent],
    result: EventedRunResult,
    evaluation: OracleEvaluation,
    event_log_ref: str,
    log_path: Path,
) -> BehavioralCaseResult:
    context_events = tuple(
        (event.event_type, event.event_id)
        for event in events
        if event.event_type.startswith("context.compaction_")
        or event.event_type.startswith("context.overflow_")
    )
    visible_failures: list[str] = []
    for event in events:
        if event.event_type != "tool.execution_completed":
            continue
        retained_failures = event.payload.get("semantic_failures")
        if isinstance(retained_failures, list):
            visible_failures.extend(str(failure) for failure in retained_failures)
    model_visible_tool_failures = tuple(visible_failures)
    return BehavioralCaseResult(
        case_id=case.case_id,
        family=case.family,
        case_identity=case.identity,
        runtime_status=result.status.value,
        evaluator_verdict=evaluation.verdict,
        failure_category=evaluation.failure_category,
        failure_codes=evaluation.failure_codes,
        tool_sequence=tuple(action.tool_name for action in environment.actions),
        model_visible_tool_failures=model_visible_tool_failures,
        steps=result.steps,
        model_calls=result.model_calls,
        run_id=result.run_id,
        event_log_ref=event_log_ref,
        event_log_sha256="sha256:" + hashlib.sha256(log_path.read_bytes()).hexdigest(),
        event_ids=tuple(event.event_id for event in events),
        context_events=context_events,
    )


def _build_report(
    manifest: BehavioralManifest,
    cases: tuple[BehavioralCaseResult, ...],
) -> BehavioralEvalReport:
    attribution: dict[str, int] = {}
    for case in cases:
        if case.failure_category is not None:
            attribution[case.failure_category] = attribution.get(case.failure_category, 0) + 1
    evaluable = sum(
        case.evaluator_verdict in {EvaluatorVerdict.PASSED, EvaluatorVerdict.FAILED}
        for case in cases
    )
    passed = sum(case.passed for case in cases)
    family_results = tuple(
        (
            family.value,
            sum(case.family is family for case in cases),
            sum(case.family is family and case.passed for case in cases),
            sum(case.family is family and not case.passed for case in cases),
        )
        for family in BehavioralFamily
    )
    terminal_counts = _count_values(case.runtime_status for case in cases)
    verdict_counts = _count_values(case.evaluator_verdict.value for case in cases)
    return BehavioralEvalReport(
        suite_id=manifest.suite_id,
        suite_identity=manifest.identity,
        summary=BehavioralReportSummary(
            planned=len(cases),
            eligible=len(cases),
            started=len(cases),
            evaluable=evaluable,
            passed=passed,
            failed=len(cases) - passed,
            failure_attribution=tuple(sorted(attribution.items())),
            family_results=family_results,
            terminal_status_counts=terminal_counts,
            evaluator_verdict_counts=verdict_counts,
        ),
        cases=cases,
    )


def _case_result_dict(case: BehavioralCaseResult) -> dict[str, object]:
    return {
        "case_id": case.case_id,
        "family": case.family.value,
        "case_identity": case.case_identity,
        "runtime_status": case.runtime_status,
        "evaluator_verdict": case.evaluator_verdict.value,
        "failure_category": case.failure_category,
        "failure_codes": list(case.failure_codes),
        "tool_sequence": list(case.tool_sequence),
        "model_visible_tool_failures": list(case.model_visible_tool_failures),
        "steps": case.steps,
        "model_calls": case.model_calls,
        "run_id": case.run_id,
        "event_log_ref": case.event_log_ref,
        "event_log_sha256": case.event_log_sha256,
        "event_ids": list(case.event_ids),
        "context_events": [
            {"event_type": event_type, "event_id": event_id}
            for event_type, event_id in case.context_events
        ],
    }


def _count_values(values: Iterable[str]) -> tuple[tuple[str, int], ...]:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return tuple(sorted(counts.items()))


def _require_mapping(value: Mapping[str, object], key: str) -> Mapping[str, object]:
    selected = value.get(key)
    if not isinstance(selected, dict):
        raise ValueError(f"Behavioral Eval {key} must be an object")
    return selected


def _require_text(value: Mapping[str, object], key: str) -> str:
    selected = value.get(key)
    if not isinstance(selected, str) or not selected:
        raise ValueError(f"Behavioral Eval {key} must be non-empty text")
    return selected


def _as_mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, dict):
        raise ValueError("Behavioral Eval transition rows must be objects")
    return value


def _freeze_mapping(value: Mapping[str, object]) -> Mapping[str, object]:
    frozen = _freeze(value)
    assert isinstance(frozen, Mapping)
    return frozen


def _freeze(value: object) -> object:
    if isinstance(value, Mapping):
        return MappingProxyType(
            {str(key): _freeze(item) for key, item in value.items()}
        )
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    if isinstance(value, tuple):
        return tuple(_freeze(item) for item in value)
    return copy.deepcopy(value)


def _identity(value: object) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _canonical_json(value: object) -> str:
    return json.dumps(
        _jsonable(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _jsonable(value: object) -> object:
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_jsonable(item) for item in value]
    return value


def _contains_prohibited_prose_scoring(value: object) -> bool:
    prohibited_keys = {"thought", "reasoning", "chain_of_thought"}
    prohibited_text = ("chain-of-thought", "chain of thought")
    if isinstance(value, Mapping):
        for key, item in value.items():
            if str(key).casefold() in prohibited_keys:
                return True
            if _contains_prohibited_prose_scoring(item):
                return True
        return False
    if isinstance(value, (tuple, list)):
        return any(_contains_prohibited_prose_scoring(item) for item in value)
    if isinstance(value, str):
        lowered = value.casefold()
        return any(fragment in lowered for fragment in prohibited_text)
    return False


def _require_event_integer(event: RunEvent, key: str) -> int:
    value = event.payload.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"retained Run {key} is invalid")
    return value


def _require_nonnegative_integer(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"Behavioral Eval {label} must be a non-negative integer")
    return value


__all__ = [
    "BehavioralEvalCampaign",
    "BehavioralEvalReport",
    "BehavioralFamily",
    "BehavioralManifest",
    "EvaluatorVerdict",
    "GatewayFactory",
    "ReferenceBehaviorGateway",
    "load_behavioral_eval_manifest",
    "reconstruct_behavioral_eval_report",
]
