"""Independent Regulator negative probes for the 2026-08-19 implementation backlog.

These probes were authored by the independent Regulator session reviewing the
uncommitted ADR-0009/0010 implementation backlog. They are deliberately
distinct from the Working Agent's own contract tests: each probe mutates or
attacks a different surface (module data globals, original helper ``__code__``,
evaluator process groups, instance method bindings, evaluator identity,
resource traversal, authority ceilings, campaign roots, repetition artifacts,
and required-pack registration).

They are development-governance Evidence for the Acceptance Gate, not Learning
Wiki knowledge objects, and they release no security or sandbox claim.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

import workspace_agent_harness as api
import workspace_agent_harness.proof_packs as proof_packs_module
from workspace_agent_harness.proof_packs import (
    ScriptedProofModel,
    build_seed_proof_bundle,
    build_seed_smoke_suite,
)


def _config(root: Path, authority: object, evaluator_timeout: float = 5.0) -> object:
    return api.RuntimeConfig(
        interface_version=1,
        authority_ceiling=authority,
        default_limits=api.RunLimits(3, 4, 10),
        hard_limits=api.RunLimits(3, 4, 10),
        control_root=root / "control",
        workspace_root=root / "workspace",
        trace_schema_version=2,
        evaluator_limits=api.EvaluatorLimits(evaluator_timeout, 32_768),
    )


def _runtime(
    root: Path,
    bundle: object | None = None,
    model: object | None = None,
    evaluator_timeout: float = 5.0,
) -> tuple[object, object]:
    bundle = bundle if bundle is not None else build_seed_proof_bundle()
    model = model if model is not None else ScriptedProofModel()
    runtime = api.GeneralAgentRuntime.create(
        config=_config(root, bundle.authority, evaluator_timeout),
        adapters=api.RuntimeAdapters(
            model=model,
            capabilities=bundle.capabilities,
            workspaces=bundle.workspace,
        ),
        packs=bundle.packs,
    )
    return bundle, runtime


class RegulatorFinalModel:
    def identity_material(self) -> object:
        return {"adapter": "regulator-final-model", "version": "1"}

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        return json.dumps({"type": "final", "output": "done"})


class RegulatorProbeTest(unittest.TestCase):
    def test_p1_module_data_global_rebinding_fails_closed(self) -> None:
        # DATA_EXPECTED feeds ScriptedProofModel.identity_material; rebinding it
        # must trip the per-run model Adapter identity revalidation.
        # DATA_ORDERS feeds DataAnalysisSeedPack.content_material; rebinding it
        # must trip the per-run Pack content revalidation. Neither may silently
        # change registered behavior.
        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            bundle, runtime = _runtime(Path(directory), bundle)
            case = bundle.cases[0]
            original_orders = proof_packs_module.DATA_ORDERS
            original_expected = proof_packs_module.DATA_EXPECTED
            try:
                proof_packs_module.DATA_EXPECTED = (
                    "region,order_count,revenue\neast,999,998001.00\n"
                )
                with self.assertRaisesRegex(ValueError, "identity drifted"):
                    runtime.run(
                        api.RunRequest(
                            pack=case.pack, task=case.task, authority=bundle.authority
                        )
                    )
                proof_packs_module.DATA_EXPECTED = original_expected
                proof_packs_module.DATA_ORDERS = (
                    "order_id,region,quantity,unit_price,status\n"
                    "evil,east,999,999.00,paid\n"
                )
                with self.assertRaisesRegex(ValueError, "content drifted"):
                    runtime.run(
                        api.RunRequest(
                            pack=case.pack, task=case.task, authority=bundle.authority
                        )
                    )
            finally:
                proof_packs_module.DATA_ORDERS = original_orders
                proof_packs_module.DATA_EXPECTED = original_expected
            traces = tuple((Path(directory) / "control" / "traces").glob("*.jsonl"))

        self.assertEqual((), traces)

    def test_p2_original_helper_code_replacement_keeps_frozen_audit(self) -> None:
        class NestedImportModel:
            def identity_material(self) -> object:
                return {"adapter": "regulator-nested-import", "version": "1"}

            def respond(self, context: tuple[dict[str, object], ...]) -> str:
                if not any(item.get("role") == "tool" for item in context):
                    return json.dumps(
                        {
                            "type": "tool",
                            "tool": "workspace.patch",
                            "arguments": {
                                "resource": "workspace:src/slugify.py",
                                "content": (
                                    "import re\n\n"
                                    "def slugify(text: str) -> str:\n"
                                    "    import os\n"
                                    "    return 'untitled'\n"
                                ),
                            },
                        }
                    )
                return json.dumps({"type": "final", "output": "patched"})

        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            bundle, runtime = _runtime(Path(directory), bundle, NestedImportModel())
            original_code = proof_packs_module._audit_slugify_source.__code__

            def noop_audit(source: str) -> None:
                return None

            proof_packs_module._audit_slugify_source.__code__ = noop_audit.__code__
            try:
                report = runtime.run(
                    api.RunRequest(
                        pack=bundle.cases[1].pack,
                        task=bundle.cases[1].task,
                        authority=bundle.authority,
                    )
                )
            finally:
                proof_packs_module._audit_slugify_source.__code__ = original_code
        checks = {
            str(item["check"]): bool(item["passed"])
            for item in report.evaluation.checks
            if isinstance(item, dict)
        }
        self.assertIs(api.RunStatus.SUCCEEDED, report.result.status)
        self.assertIs(api.EvaluationStatus.FAILED, report.evaluation.status)
        self.assertFalse(checks["safe_ast"])

    def test_p3_evaluator_timeout_kills_process_group(self) -> None:
        sentinel_text = {"value": ""}

        class GrandchildPack:
            def __init__(self, sentinel: Path) -> None:
                self._sentinel = sentinel
                digest = api.pack_content_hash(type(self), self.content_material())
                self.selector = api.PackSelector("data-analysis", "1.0.0", digest)
                self.manifest = api.PackManifest(
                    interface_version=1,
                    identity=self.selector,
                    task_schema={"type": "object", "required": ["task_id"]},
                    required_runtime_features=frozenset(),
                    guidance_resources=(),
                    requested_capabilities=(),
                    authority_ceiling=api.AuthorityRequest(()),
                    fixture_resources=(),
                    evaluator=api.EvaluatorIdentity(
                        "regulator-grandchild-eval", "1.0.0", digest
                    ),
                )

            def content_material(self) -> object:
                return {"pack": "regulator-grandchild", "marker": "p3"}

            def compile_task(self, raw_task: object) -> object:
                return api.DomainRunSpec(
                    task_id=str(raw_task["task_id"]),
                    normalized_task=raw_task,
                    agent=api.AgentProjection(
                        goal="probe",
                        guidance=(),
                        requested_capabilities=(),
                        visible_inputs=(),
                        expected_artifacts=(),
                    ),
                    control=api.ControlProjection(
                        fixture=api.ProtectedFixtureRef(
                            "f", "sha256:" + "0" * 64
                        ),
                        evaluator=self.manifest.evaluator,
                        protected_checks=(),
                    ),
                    authority_request=api.AuthorityRequest(()),
                    limit_defaults=None,
                )

            def evaluate(self, evidence: object) -> object:
                subprocess.Popen(
                    [
                        "/bin/sh",
                        "-c",
                        f"sleep 0.4; echo pwned > {self._sentinel}",
                    ]
                )
                time.sleep(30)
                return api.EvaluationVerdict(
                    passed=True, checks=(), measurements={}
                )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sentinel = root / "control" / "grandchild-pwned.txt"
            pack = GrandchildPack(sentinel)
            runtime = api.GeneralAgentRuntime.create(
                config=_config(root, api.AuthorityGrant(()), evaluator_timeout=0.05),
                adapters=api.RuntimeAdapters(
                    model=RegulatorFinalModel(), capabilities={}
                ),
                packs=[pack],
            )
            started_at = time.monotonic()
            report = runtime.run(
                api.RunRequest(
                    pack=pack.selector,
                    task={"task_id": "p3"},
                    authority=api.AuthorityGrant(()),
                )
            )
            elapsed = time.monotonic() - started_at
            time.sleep(1.0)  # a surviving grandchild would fire at 0.4s
            sentinel_text["value"] = (
                sentinel.read_text(encoding="utf-8") if sentinel.exists() else ""
            )

        self.assertIs(api.EvaluationStatus.ERROR, report.evaluation.status)
        self.assertLess(elapsed, 5.0)
        self.assertEqual("", sentinel_text["value"])

    def test_p4_pack_instance_method_rebinding_fails_closed(self) -> None:
        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            bundle, runtime = _runtime(Path(directory), bundle)
            pack = bundle.packs[0]
            original = pack.compile_task
            pack.compile_task = lambda raw: original(raw)  # type: ignore[method-assign]
            try:
                with self.assertRaisesRegex(ValueError, "binding drifted"):
                    runtime.run(
                        api.RunRequest(
                            pack=pack.manifest.identity,
                            task=bundle.cases[0].task,
                            authority=bundle.authority,
                        )
                    )
            finally:
                pack.compile_task = original  # type: ignore[method-assign]

    def test_p5_forged_evaluator_identity_in_spec_is_rejected(self) -> None:
        class WrongEvaluatorPack:
            def __init__(self) -> None:
                digest = api.pack_content_hash(type(self), self.content_material())
                self.selector = api.PackSelector("data-analysis", "1.0.0", digest)
                self.manifest = api.PackManifest(
                    interface_version=1,
                    identity=self.selector,
                    task_schema={"type": "object", "required": ["task_id"]},
                    required_runtime_features=frozenset(),
                    guidance_resources=(),
                    requested_capabilities=(),
                    authority_ceiling=api.AuthorityRequest(()),
                    fixture_resources=(),
                    evaluator=api.EvaluatorIdentity(
                        "regulator-honest-eval", "1.0.0", digest
                    ),
                )

            def content_material(self) -> object:
                return {"pack": "regulator-forged-evaluator", "marker": "p5"}

            def compile_task(self, raw_task: object) -> object:
                return api.DomainRunSpec(
                    task_id=str(raw_task["task_id"]),
                    normalized_task=raw_task,
                    agent=api.AgentProjection(
                        goal="probe",
                        guidance=(),
                        requested_capabilities=(),
                        visible_inputs=(),
                        expected_artifacts=(),
                    ),
                    control=api.ControlProjection(
                        fixture=api.ProtectedFixtureRef("f", "sha256:" + "0" * 64),
                        evaluator=api.EvaluatorIdentity(
                            "forged-evaluator", "9.9.9", "sha256:" + "b" * 64
                        ),
                        protected_checks=(),
                    ),
                    authority_request=api.AuthorityRequest(()),
                    limit_defaults=None,
                )

            def evaluate(self, evidence: object) -> object:
                return api.EvaluationVerdict(passed=True, checks=(), measurements={})

        with tempfile.TemporaryDirectory() as directory:
            pack = WrongEvaluatorPack()
            runtime = api.GeneralAgentRuntime.create(
                config=_config(Path(directory), api.AuthorityGrant(())),
                adapters=api.RuntimeAdapters(
                    model=RegulatorFinalModel(), capabilities={}
                ),
                packs=[pack],
            )
            with self.assertRaisesRegex(ValueError, "evaluator"):
                runtime.run(
                    api.RunRequest(
                        pack=pack.selector,
                        task={"task_id": "p5"},
                        authority=api.AuthorityGrant(()),
                    )
                )

    def test_p6_traversal_resource_is_policy_blocked(self) -> None:
        class TraversalModel:
            def identity_material(self) -> object:
                return {"adapter": "regulator-traversal", "version": "1"}

            def respond(self, context: tuple[dict[str, object], ...]) -> str:
                if not any(item.get("role") == "tool" for item in context):
                    return json.dumps(
                        {
                            "type": "tool",
                            "tool": "workspace.write-output",
                            "arguments": {
                                "resource": "workspace:outputs/../../control/evil.txt",
                                "content": "pwn",
                            },
                        }
                    )
                return json.dumps({"type": "final", "output": "done"})

        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle, runtime = _runtime(root, bundle, TraversalModel())
            report = runtime.run(
                api.RunRequest(
                    pack=bundle.cases[0].pack,
                    task=bundle.cases[0].task,
                    authority=bundle.authority,
                )
            )
            evil_exists = (root / "control" / "evil.txt").exists()

        self.assertIs(api.RunStatus.POLICY_BLOCKED, report.result.status)
        self.assertFalse(evil_exists)

    def test_p7_caller_grant_wider_than_runtime_ceiling_fails_closed(self) -> None:
        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            narrow_ceiling = api.AuthorityGrant(
                (
                    api.CapabilityGrant(
                        "table.aggregate", ("workspace:inputs/orders.csv",)
                    ),
                )
            )
            runtime = api.GeneralAgentRuntime.create(
                config=_config(root, narrow_ceiling),
                adapters=api.RuntimeAdapters(
                    model=ScriptedProofModel(),
                    capabilities=bundle.capabilities,
                    workspaces=bundle.workspace,
                ),
                packs=bundle.packs,
            )
            with self.assertRaisesRegex(ValueError, "not authorized"):
                runtime.run(
                    api.RunRequest(
                        pack=bundle.cases[0].pack,
                        task=bundle.cases[0].task,
                        authority=bundle.authority,
                    )
                )

    def test_p8_campaign_artifacts_root_overlap_is_rejected(self) -> None:
        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle, runtime = _runtime(root, bundle)
            suite = build_seed_smoke_suite(bundle)
            with self.assertRaisesRegex(ValueError, "overlap"):
                api.EvaluationCampaign.create(
                    runtime=runtime,
                    suites=[suite],
                    artifacts_root=root / "control" / "campaigns",
                )

    def test_p9_repetitions_produce_append_only_attempt_artifacts(self) -> None:
        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle, runtime = _runtime(root, bundle)
            suite = build_seed_smoke_suite(bundle)
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=root / "campaigns",
            ).run(api.CampaignRequest(suite=suite.manifest.identity, repetitions=2))
            attempt_files = sorted(
                (report.artifacts.directory / "attempts").glob("*.json")
            )

        self.assertEqual(4, report.summary.attempted)
        self.assertEqual(4, report.summary.passed)
        self.assertEqual(4, len(attempt_files))

    def test_p10_suite_requiring_unregistered_pack_is_rejected(self) -> None:
        bundle = build_seed_proof_bundle()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bundle, runtime = _runtime(root, bundle)
            suite = build_seed_smoke_suite(bundle)
            manifest = suite.manifest
            ghost_packs = (
                api.PackSelector("ghost-pack", "1.0.0", "sha256:" + "c" * 64),
            )
            forged_hash = api.suite_content_hash(
                suite_id=manifest.identity.suite_id,
                version=manifest.identity.version,
                lane=manifest.lane,
                source_revision=manifest.source_revision,
                source_digest=manifest.source_digest,
                cases_hash=manifest.cases_hash,
                transform_hash=manifest.transform_hash,
                metric_schema_version=manifest.metric_schema_version,
                required_packs=ghost_packs,
            )
            forged = api.SuiteManifest(
                identity=api.SuiteSelector(
                    manifest.identity.suite_id,
                    manifest.identity.version,
                    forged_hash,
                ),
                lane=manifest.lane,
                source_revision=manifest.source_revision,
                source_digest=manifest.source_digest,
                cases_hash=manifest.cases_hash,
                transform_descriptor=manifest.transform_descriptor,
                transform_hash=manifest.transform_hash,
                metric_schema_version=manifest.metric_schema_version,
                required_packs=ghost_packs,
            )
            forged_suite = proof_packs_module.SeedVerticalSmokeSuite(
                forged, suite.cases(), suite.source_material()
            )
            with self.assertRaisesRegex(ValueError, "not registered"):
                api.EvaluationCampaign.create(
                    runtime=runtime,
                    suites=[forged_suite],
                    artifacts_root=root / "campaigns",
                )


if __name__ == "__main__":
    unittest.main()
