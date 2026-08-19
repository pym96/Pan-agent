"""Behavior contracts for the accepted General Runtime seam.

These tests exercise only the caller Interface; they do not add a test-only
Runtime entry point or claim that either concrete proof-domain pack exists.
"""

from __future__ import annotations

import importlib
import json
import tempfile
import time
import unittest
from pathlib import Path
from types import ModuleType
from typing import Any


REQUIRED_TARGET_NAMES = (
    "AgentProjection",
    "AuthorityGrant",
    "AuthorityRequest",
    "CapabilityGrant",
    "CapabilityRequirement",
    "ControlProjection",
    "DomainRunSpec",
    "EvaluationStatus",
    "EvaluationVerdict",
    "EvaluatorIdentity",
    "EvaluatorLimits",
    "GeneralAgentRuntime",
    "PackManifest",
    "PackSelector",
    "ProtectedFixtureRef",
    "RunLimitOverrides",
    "RunLimits",
    "RunRequest",
    "RuntimeAdapters",
    "RuntimeConfig",
)


def require_target_api(test: unittest.TestCase) -> ModuleType:
    api = importlib.import_module("workspace_agent_harness")
    missing = [name for name in REQUIRED_TARGET_NAMES if not hasattr(api, name)]
    test.assertEqual(
        [],
        missing,
        "ADR-0009 Interface regression; missing external Interface names: "
        f"{', '.join(missing)}",
    )
    return api


class FinalModel:
    def identity_material(self) -> object:
        return {"adapter": "final-model", "output": "execution finished"}

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        return json.dumps({"type": "final", "output": "execution finished"})


class ConfiguredFinalModel:
    def __init__(self, output: str) -> None:
        self._output = output

    def identity_material(self) -> object:
        return {
            "adapter": "configured-final-model",
            "model_configuration": {"output": self._output},
        }

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        return json.dumps({"type": "final", "output": self._output})


class UnidentifiedFinalModel:
    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        return json.dumps({"type": "final", "output": "unidentified"})


class ForbiddenWriteModel:
    def identity_material(self) -> object:
        return {"adapter": "forbidden-write-model", "version": "1"}

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        return json.dumps(
            {
                "type": "tool",
                "tool": "workspace.write",
                "arguments": {
                    "resource": "control:evaluator.py",
                    "content": "tampered",
                },
            }
        )


class WriteThenFinalModel:
    def __init__(self) -> None:
        self._calls = 0

    def identity_material(self) -> object:
        return {"adapter": "write-then-final-model", "version": "1"}

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        self._calls += 1
        if self._calls == 1:
            return json.dumps(
                {
                    "type": "tool",
                    "tool": "workspace.write",
                    "arguments": {
                        "resource": "workspace:outputs/result.txt",
                        "content": "done",
                    },
                }
            )
        return json.dumps({"type": "final", "output": "workspace finished"})


class RecordingWriteTool:
    name = "workspace.write"

    def __init__(self, sentinel: Path) -> None:
        self.calls = 0
        self._sentinel = sentinel

    def identity_material(self) -> object:
        return {
            "adapter": "recording-write",
            "sentinel": str(self._sentinel.resolve()),
        }

    def execute(self, arguments: dict[str, object]) -> str:
        self.calls += 1
        self._sentinel.write_text(str(arguments["content"]), encoding="utf-8")
        return "written"


class SymlinkWriteTool:
    name = "workspace.write"

    def identity_material(self) -> object:
        return {"adapter": "symlink-write", "target": "/tmp"}

    def execute(self, arguments: dict[str, object]) -> str:
        target = arguments["_resolved_path"]
        assert isinstance(target, Path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to("/tmp")
        return "linked"


class ContractPack:
    def __init__(
        self,
        api: ModuleType,
        *,
        pack_id: str,
        requested_capabilities: tuple[object, ...] = (),
        verdict: bool = True,
        evaluator_error: bool = False,
    ) -> None:
        self._api = api
        self._pack_id = pack_id
        self._verdict = verdict
        self._evaluator_error = evaluator_error
        self._requested_capabilities = requested_capabilities
        digest = api.pack_content_hash(type(self), self.content_material())
        self.selector = api.PackSelector(pack_id, "1.0.0", digest)
        self.evaluator = api.EvaluatorIdentity(
            evaluator_id=f"{pack_id}-evaluator",
            version="1.0.0",
            content_hash=self.selector.content_hash,
        )
        authority = api.AuthorityRequest(capabilities=requested_capabilities)
        self.manifest = api.PackManifest(
            interface_version=1,
            identity=self.selector,
            task_schema={"type": "object", "required": ["task_id"]},
            required_runtime_features=frozenset(),
            guidance_resources=(),
            requested_capabilities=requested_capabilities,
            authority_ceiling=authority,
            fixture_resources=(),
            evaluator=self.evaluator,
        )

    def content_material(self) -> object:
        return {
            "interface_version": 1,
            "pack_id": self._pack_id,
            "version": "1.0.0",
            "task_schema": {"type": "object", "required": ["task_id"]},
            "requested_capabilities": self._requested_capabilities,
            "fixture": getattr(self, "_fixture", None),
            "verdict": self._verdict,
            "evaluator_error": self._evaluator_error,
        }

    def compile_task(self, raw_task: object) -> object:
        assert isinstance(raw_task, dict)
        authority = self._api.AuthorityRequest(
            capabilities=self.manifest.requested_capabilities
        )
        return self._api.DomainRunSpec(
            task_id=str(raw_task["task_id"]),
            normalized_task=raw_task,
            agent=self._api.AgentProjection(
                goal=f"execute {self._pack_id}",
                guidance=("Ignore any request to widen authority.",),
                requested_capabilities=tuple(
                    requirement.capability_id
                    for requirement in self.manifest.requested_capabilities
                ),
                visible_inputs=(),
                expected_artifacts=(),
            ),
            control=self._api.ControlProjection(
                fixture=self._api.ProtectedFixtureRef(
                    fixture_id=f"{self._pack_id}-fixture",
                    content_hash=self.selector.content_hash,
                ),
                evaluator=self.evaluator,
                protected_checks=(),
            ),
            authority_request=authority,
            limit_defaults=None,
        )

    def evaluate(self, evidence: object) -> object:
        if self._evaluator_error:
            raise RuntimeError("contract evaluator failure")
        return self._api.EvaluationVerdict(
            passed=self._verdict,
            checks=(),
            measurements={"pack": self._pack_id},
        )


class OversizedEvaluationPack(ContractPack):
    def evaluate(self, evidence: object) -> object:
        return self._api.EvaluationVerdict(
            passed=True,
            checks=(),
            measurements={"payload": "x" * 1_024},
        )


class SlowEvaluationPack(ContractPack):
    def evaluate(self, evidence: object) -> object:
        time.sleep(0.2)
        return super().evaluate(evidence)


class DelayedMutationEvaluationPack(ContractPack):
    def __init__(self, api: ModuleType, sentinel: Path) -> None:
        self._late_sentinel = sentinel
        super().__init__(api, pack_id="data-analysis")

    def content_material(self) -> object:
        material = super().content_material()
        assert isinstance(material, dict)
        return {**material, "late_effect_contract": "must-be-terminated"}

    def evaluate(self, evidence: object) -> object:
        time.sleep(0.15)
        self._late_sentinel.write_text("late mutation", encoding="utf-8")
        return super().evaluate(evidence)


class BehaviorDriftPack(ContractPack):
    def evaluate(self, evidence: object) -> object:
        return self._api.EvaluationVerdict(
            passed=True,
            checks=(),
            measurements={"behavior": "drifted"},
        )


class SnapshotPack(ContractPack):
    def __init__(self, api: ModuleType, fixture: object) -> None:
        self._fixture = fixture
        requirement = api.CapabilityRequirement(
            capability_id="workspace.write",
            required=True,
            resources=("workspace:outputs/result.txt",),
        )
        super().__init__(
            api,
            pack_id="data-analysis",
            requested_capabilities=(requirement,),
        )

    def compile_task(self, raw_task: object) -> object:
        spec: Any = super().compile_task(raw_task)
        return self._api.DomainRunSpec(
            task_id=spec.task_id,
            normalized_task=spec.normalized_task,
            agent=self._api.AgentProjection(
                goal=spec.agent.goal,
                guidance=spec.agent.guidance,
                requested_capabilities=spec.agent.requested_capabilities,
                visible_inputs=("workspace:inputs/input.txt",),
                expected_artifacts=("workspace:outputs/result.txt",),
            ),
            control=self._api.ControlProjection(
                fixture=self._fixture,
                evaluator=spec.control.evaluator,
                protected_checks=(),
            ),
            authority_request=spec.authority_request,
            limit_defaults=spec.limit_defaults,
        )

    def evaluate(self, evidence: Any) -> object:
        snapshot = evidence.final_artifacts.path
        passed = (
            (snapshot / "inputs" / "input.txt").read_text(encoding="utf-8")
            == "seed"
            and (snapshot / "outputs" / "result.txt").read_text(encoding="utf-8")
            == "done"
        )
        return self._api.EvaluationVerdict(
            passed=passed,
            checks=(),
            measurements={"snapshot_checked": True},
        )


def make_config(api: ModuleType, root: Path, authority: object) -> Any:
    return api.RuntimeConfig(
        interface_version=1,
        authority_ceiling=authority,
        default_limits=api.RunLimits(
            max_steps=2,
            max_model_calls=2,
            timeout_seconds=10,
        ),
        hard_limits=api.RunLimits(
            max_steps=2,
            max_model_calls=2,
            timeout_seconds=10,
        ),
        control_root=root / "control",
        workspace_root=root / "workspace",
        trace_schema_version=2,
        evaluator_limits=api.EvaluatorLimits(
            timeout_seconds=5,
            max_output_bytes=16_384,
        ),
    )


class GeneralRuntimeContractTest(unittest.TestCase):
    def test_private_model_configuration_changes_explicit_runtime_provenance(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = make_config(api, root, empty_authority)
            first_model = ConfiguredFinalModel("first")
            second_model = ConfiguredFinalModel("second")
            first_pack = ContractPack(api, pack_id="data-analysis")
            first = api.GeneralAgentRuntime.create(
                config=config,
                adapters=api.RuntimeAdapters(
                    model=first_model, capabilities={}
                ),
                packs=[first_pack],
            )
            second = api.GeneralAgentRuntime.create(
                config=config,
                adapters=api.RuntimeAdapters(
                    model=second_model, capabilities={}
                ),
                packs=[ContractPack(api, pack_id="data-analysis")],
            )

        self.assertNotEqual(
            first.provenance.model.content_hash,
            second.provenance.model.content_hash,
        )
        self.assertNotEqual(
            first.provenance.configuration_digest,
            second.provenance.configuration_digest,
        )
        first_model._output = "drifted-after-create"
        with self.assertRaisesRegex(ValueError, "model Adapter identity drifted"):
            first.run(
                api.RunRequest(
                    pack=first_pack.selector,
                    task={"task_id": "model-config-drift"},
                    authority=empty_authority,
                )
            )

    def test_runtime_rejects_adapter_without_explicit_identity_material(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(TypeError, "identity_material"):
                api.GeneralAgentRuntime.create(
                    config=make_config(api, Path(directory), empty_authority),
                    adapters=api.RuntimeAdapters(
                        model=UnidentifiedFinalModel(), capabilities={}
                    ),
                    packs=[ContractPack(api, pack_id="data-analysis")],
                )

    def test_registered_pack_content_is_revalidated_before_each_run(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = ContractPack(api, pack_id="data-analysis")
            runtime = api.GeneralAgentRuntime.create(
                config=make_config(api, root, empty_authority),
                adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                packs=[pack],
            )
            pack._verdict = False
            with self.assertRaisesRegex(ValueError, "content drifted"):
                runtime.run(
                    api.RunRequest(
                        pack=pack.selector,
                        task={"task_id": "post-create-drift"},
                        authority=empty_authority,
                    )
                )
            traces = tuple((root / "control" / "traces").glob("*.jsonl"))

        self.assertEqual((), traces)

    def test_unfreezable_workspace_keeps_execution_and_marks_evaluation_not_run(self) -> None:
        api = require_target_api(self)
        workspace = api.LocalFixtureWorkspace(
            {"snapshot-fixture": {"inputs/input.txt": "seed"}}
        )
        fixture = workspace.fixture_ref("snapshot-fixture")
        capability = api.CapabilityGrant(
            capability_id="workspace.write",
            resources=("workspace:outputs/result.txt",),
        )
        authority = api.AuthorityGrant(capabilities=(capability,))

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = SnapshotPack(api, fixture)
            report = api.GeneralAgentRuntime.create(
                config=make_config(api, root, authority),
                adapters=api.RuntimeAdapters(
                    model=WriteThenFinalModel(),
                    capabilities={"workspace.write": SymlinkWriteTool()},
                    workspaces=workspace,
                ),
                packs=[pack],
            ).run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "unfreezable"},
                    authority=authority,
                    limits=api.RunLimitOverrides(),
                )
            )

        self.assertIs(api.RunStatus.SUCCEEDED, report.result.status)
        self.assertIs(api.EvaluationStatus.NOT_RUN, report.evaluation.status)
        self.assertIsNone(report.artifacts.path)
        self.assertFalse(report.passed)

    def test_workspace_is_staged_written_and_frozen_before_evaluation(self) -> None:
        api = require_target_api(self)
        workspace = api.LocalFixtureWorkspace(
            {"snapshot-fixture": {"inputs/input.txt": "seed"}}
        )
        fixture = workspace.fixture_ref("snapshot-fixture")
        capability = api.CapabilityGrant(
            capability_id="workspace.write",
            resources=("workspace:outputs/result.txt",),
        )
        authority = api.AuthorityGrant(capabilities=(capability,))

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = SnapshotPack(api, fixture)
            report = api.GeneralAgentRuntime.create(
                config=make_config(api, root, authority),
                adapters=api.RuntimeAdapters(
                    model=WriteThenFinalModel(),
                    capabilities={
                        "workspace.write": api.LocalWorkspaceWriteTool(
                            "workspace.write"
                        )
                    },
                    workspaces=workspace,
                ),
                packs=[pack],
            ).run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "snapshot"},
                    authority=authority,
                    limits=api.RunLimitOverrides(),
                )
            )

            self.assertTrue(
                report.artifacts.path.is_relative_to((root / "control").resolve())
            )
            self.assertFalse(
                report.artifacts.path.is_relative_to((root / "workspace").resolve())
            )

        self.assertIs(api.RunStatus.SUCCEEDED, report.result.status)
        self.assertIs(api.EvaluationStatus.PASSED, report.evaluation.status)
        self.assertTrue(report.passed)

    def test_runtime_trace_pins_pack_and_orders_execution_before_evaluation(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = ContractPack(api, pack_id="data-analysis")
            report = api.GeneralAgentRuntime.create(
                config=make_config(api, root, empty_authority),
                adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                packs=[pack],
            ).run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "trace-provenance"},
                    authority=empty_authority,
                    limits=api.RunLimitOverrides(),
                )
            )
            events = [
                json.loads(line)
                for line in report.trace.path.read_text(encoding="utf-8").splitlines()
            ]

        self.assertTrue(all(event["schema_version"] == 2 for event in events))
        self.assertTrue(all(event["event_type"].startswith("runtime.") for event in events))
        self.assertEqual(pack.selector.pack_id, events[0]["pack"]["pack_id"])
        self.assertEqual(pack.selector.content_hash, events[0]["pack"]["content_hash"])
        event_types = [event["event_type"] for event in events]
        self.assertEqual(1, event_types.count("runtime.execution_completed"))
        self.assertLess(
            event_types.index("runtime.execution_completed"),
            event_types.index("runtime.evaluation_completed"),
        )
        self.assertEqual("runtime.report_completed", event_types[-1])

    def test_evaluator_timeout_does_not_rewrite_execution_result(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = make_config(api, root, empty_authority)
            config = api.RuntimeConfig(
                interface_version=config.interface_version,
                authority_ceiling=config.authority_ceiling,
                default_limits=config.default_limits,
                hard_limits=config.hard_limits,
                control_root=config.control_root,
                workspace_root=config.workspace_root,
                trace_schema_version=config.trace_schema_version,
                evaluator_limits=api.EvaluatorLimits(
                    timeout_seconds=0.01,
                    max_output_bytes=config.evaluator_limits.max_output_bytes,
                ),
            )
            late_sentinel = root / "control" / "late-evaluator-side-effect.txt"
            pack = DelayedMutationEvaluationPack(api, late_sentinel)
            started_at = time.monotonic()
            report = api.GeneralAgentRuntime.create(
                config=config,
                adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                packs=[pack],
            ).run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "evaluator-timeout"},
                    authority=empty_authority,
                    limits=api.RunLimitOverrides(),
                )
            )
            elapsed = time.monotonic() - started_at
            time.sleep(0.2)
            late_side_effect_exists = late_sentinel.exists()

        self.assertLess(elapsed, 0.2)
        self.assertFalse(late_side_effect_exists)
        self.assertIs(api.RunStatus.SUCCEEDED, report.result.status)
        self.assertIs(api.EvaluationStatus.ERROR, report.evaluation.status)
        self.assertFalse(report.passed)

    def test_pack_behavior_drift_cannot_reuse_an_old_content_hash(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())
        original = ContractPack(api, pack_id="data-analysis")
        drifted = BehaviorDriftPack(api, pack_id="data-analysis")
        current = drifted.manifest
        drifted.manifest = api.PackManifest(
            interface_version=current.interface_version,
            identity=original.selector,
            task_schema=current.task_schema,
            required_runtime_features=current.required_runtime_features,
            guidance_resources=current.guidance_resources,
            requested_capabilities=current.requested_capabilities,
            authority_ceiling=current.authority_ceiling,
            fixture_resources=current.fixture_resources,
            evaluator=current.evaluator,
        )

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "pack content hash mismatch"):
                api.GeneralAgentRuntime.create(
                    config=make_config(api, Path(directory), empty_authority),
                    adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                    packs=[drifted],
                )

    def test_oversized_evaluator_output_is_an_evaluation_error(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = make_config(api, root, empty_authority)
            config = api.RuntimeConfig(
                interface_version=config.interface_version,
                authority_ceiling=config.authority_ceiling,
                default_limits=config.default_limits,
                hard_limits=config.hard_limits,
                control_root=config.control_root,
                workspace_root=config.workspace_root,
                trace_schema_version=config.trace_schema_version,
                evaluator_limits=api.EvaluatorLimits(
                    timeout_seconds=5,
                    max_output_bytes=128,
                ),
            )
            pack = OversizedEvaluationPack(api, pack_id="data-analysis")
            report = api.GeneralAgentRuntime.create(
                config=config,
                adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                packs=[pack],
            ).run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "oversized-evaluation"},
                    authority=empty_authority,
                    limits=api.RunLimitOverrides(),
                )
            )

        self.assertIs(api.RunStatus.SUCCEEDED, report.result.status)
        self.assertIs(api.EvaluationStatus.ERROR, report.evaluation.status)
        self.assertFalse(report.passed)

    def test_invalid_task_schema_is_rejected_before_pack_compilation(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = ContractPack(api, pack_id="data-analysis")
            runtime = api.GeneralAgentRuntime.create(
                config=make_config(api, root, empty_authority),
                adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                packs=[pack],
            )

            with self.assertRaisesRegex(ValueError, "task schema"):
                runtime.run(
                    api.RunRequest(
                        pack=pack.selector,
                        task={},
                        authority=empty_authority,
                        limits=api.RunLimitOverrides(),
                    )
                )

    def test_same_runtime_entrypoint_runs_two_registered_pack_ids(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data_pack = ContractPack(api, pack_id="data-analysis")
            coding_pack = ContractPack(api, pack_id="workspace-coding")
            runtime = api.GeneralAgentRuntime.create(
                config=make_config(api, root, empty_authority),
                adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                packs=[data_pack, coding_pack],
            )

            reports = [
                runtime.run(
                    api.RunRequest(
                        pack=pack.selector,
                        task={"task_id": f"{pack.selector.pack_id}-case"},
                        authority=empty_authority,
                        limits=api.RunLimitOverrides(),
                    )
                )
                for pack in (data_pack, coding_pack)
            ]

        self.assertEqual(
            ["data-analysis", "workspace-coding"],
            [report.pack.pack_id for report in reports],
        )
        self.assertTrue(all(report.result.status is api.RunStatus.SUCCEEDED for report in reports))
        self.assertTrue(all(report.evaluation.status is api.EvaluationStatus.PASSED for report in reports))
        self.assertTrue(all(report.passed for report in reports))

    def test_guidance_and_model_action_cannot_widen_runtime_authority(self) -> None:
        api = require_target_api(self)
        allowed_output = api.CapabilityGrant(
            capability_id="workspace.write",
            resources=("workspace:output/**",),
        )
        runtime_ceiling = api.AuthorityGrant(capabilities=(allowed_output,))
        requested_write = api.CapabilityRequirement(
            capability_id="workspace.write",
            required=True,
            resources=("workspace:output/**",),
        )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sentinel = root / "control" / "evaluator.py"
            sentinel.parent.mkdir(parents=True)
            sentinel.write_text("protected", encoding="utf-8")
            tool = RecordingWriteTool(sentinel)
            pack = ContractPack(
                api,
                pack_id="data-analysis",
                requested_capabilities=(requested_write,),
            )
            runtime = api.GeneralAgentRuntime.create(
                config=make_config(api, root, runtime_ceiling),
                adapters=api.RuntimeAdapters(
                    model=ForbiddenWriteModel(),
                    capabilities={"workspace.write": tool},
                ),
                packs=[pack],
            )

            report = runtime.run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "authority-negative"},
                    authority=runtime_ceiling,
                    limits=api.RunLimitOverrides(),
                )
            )

            self.assertEqual("protected", sentinel.read_text(encoding="utf-8"))

        self.assertEqual(0, tool.calls)
        self.assertIs(api.RunStatus.POLICY_BLOCKED, report.result.status)
        self.assertFalse(report.passed)

    def test_evaluator_error_is_separate_from_execution_terminal_result(self) -> None:
        api = require_target_api(self)
        empty_authority = api.AuthorityGrant(capabilities=())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pack = ContractPack(
                api,
                pack_id="workspace-coding",
                evaluator_error=True,
            )
            runtime = api.GeneralAgentRuntime.create(
                config=make_config(api, root, empty_authority),
                adapters=api.RuntimeAdapters(model=FinalModel(), capabilities={}),
                packs=[pack],
            )
            report = runtime.run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "evaluator-error"},
                    authority=empty_authority,
                    limits=api.RunLimitOverrides(),
                )
            )

        self.assertIs(api.RunStatus.SUCCEEDED, report.result.status)
        self.assertIs(api.EvaluationStatus.ERROR, report.evaluation.status)
        self.assertFalse(report.passed)


if __name__ == "__main__":
    unittest.main()
