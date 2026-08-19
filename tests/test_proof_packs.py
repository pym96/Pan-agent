"""Integration contracts for the two concrete seed proof-domain Packs."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import workspace_agent_harness as api
import workspace_agent_harness.proof_packs as proof_packs_module
from workspace_agent_harness.proof_packs import (
    ScriptedProofModel,
    build_seed_proof_bundle,
    build_seed_smoke_suite,
)


class NestedImportCodingModel:
    def identity_material(self) -> object:
        return {"adapter": "nested-import-negative-model", "version": "1"}

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


class ProofPackIntegrationTest(unittest.TestCase):
    def test_registered_seed_execution_uses_frozen_module_helpers(self) -> None:
        bundle = build_seed_proof_bundle()

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = api.GeneralAgentRuntime.create(
                config=api.RuntimeConfig(
                    interface_version=1,
                    authority_ceiling=bundle.authority,
                    default_limits=api.RunLimits(3, 4, 10),
                    hard_limits=api.RunLimits(3, 4, 10),
                    control_root=root / "control",
                    workspace_root=root / "workspace",
                    trace_schema_version=2,
                    evaluator_limits=api.EvaluatorLimits(5, 32_768),
                ),
                adapters=api.RuntimeAdapters(
                    model=ScriptedProofModel(),
                    capabilities=bundle.capabilities,
                    workspaces=bundle.workspace,
                ),
                packs=bundle.packs,
            )
            original_audit = proof_packs_module._audit_slugify_source
            original_render = proof_packs_module._render_paid_revenue

            def drifted_audit(source: str) -> None:
                raise ValueError("live coding helper drift")

            def drifted_render(csv_text: str) -> str:
                return "wrong,live,data\n"

            proof_packs_module._audit_slugify_source = drifted_audit
            proof_packs_module._render_paid_revenue = drifted_render
            try:
                reports = tuple(
                    runtime.run(
                        api.RunRequest(
                            pack=case.pack,
                            task=case.task,
                            authority=bundle.authority,
                        )
                    )
                    for case in bundle.cases
                )
            finally:
                proof_packs_module._audit_slugify_source = original_audit
                proof_packs_module._render_paid_revenue = original_render

        self.assertTrue(all(report.passed for report in reports))
        self.assertEqual(
            ["data-analysis", "workspace-coding"],
            [report.pack.pack_id for report in reports],
        )

    def test_seed_smoke_campaign_runs_both_packs_only_through_runtime(self) -> None:
        bundle = build_seed_proof_bundle()

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = api.GeneralAgentRuntime.create(
                config=api.RuntimeConfig(
                    interface_version=1,
                    authority_ceiling=bundle.authority,
                    default_limits=api.RunLimits(3, 4, 10),
                    hard_limits=api.RunLimits(3, 4, 10),
                    control_root=root / "control",
                    workspace_root=root / "workspace",
                    trace_schema_version=2,
                    evaluator_limits=api.EvaluatorLimits(5, 32_768),
                ),
                adapters=api.RuntimeAdapters(
                    model=ScriptedProofModel(),
                    capabilities=bundle.capabilities,
                    workspaces=bundle.workspace,
                ),
                packs=bundle.packs,
            )
            suite = build_seed_smoke_suite(bundle)
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=root / "campaigns",
            ).run(
                api.CampaignRequest(
                    suite=suite.manifest.identity,
                    repetitions=1,
                    case_ids=None,
                )
            )

        self.assertEqual("vertical-development-smoke", report.suite.lane)
        self.assertEqual(2, report.summary.attempted)
        self.assertEqual(2, report.summary.passed)
        self.assertEqual(0, report.summary.cost_observed_attempts)
        self.assertIsNone(report.summary.cost_per_task_usd)
        self.assertEqual(
            (
                bundle.packs[0].manifest.identity,
                bundle.packs[1].manifest.identity,
            ),
            report.suite.required_packs,
        )
        self.assertEqual(1, len(report.provenance.runtime_configurations))
        self.assertEqual(2, len(report.provenance.evaluators))
        self.assertEqual({}, dict(report.summary.failure_attribution))

    def test_coding_evaluator_rejects_import_hidden_inside_function(self) -> None:
        bundle = build_seed_proof_bundle()
        coding_case = bundle.cases[1]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = api.GeneralAgentRuntime.create(
                config=api.RuntimeConfig(
                    interface_version=1,
                    authority_ceiling=bundle.authority,
                    default_limits=api.RunLimits(3, 4, 10),
                    hard_limits=api.RunLimits(3, 4, 10),
                    control_root=root / "control",
                    workspace_root=root / "workspace",
                    trace_schema_version=2,
                    evaluator_limits=api.EvaluatorLimits(5, 32_768),
                ),
                adapters=api.RuntimeAdapters(
                    model=NestedImportCodingModel(),
                    capabilities=bundle.capabilities,
                    workspaces=bundle.workspace,
                ),
                packs=bundle.packs,
            )
            report = runtime.run(
                api.RunRequest(
                    pack=coding_case.pack,
                    task=coding_case.task,
                    authority=bundle.authority,
                    limits=api.RunLimitOverrides(),
                )
            )

        checks: dict[str, bool] = {}
        for item in report.evaluation.checks:
            self.assertIsInstance(item, dict)
            assert isinstance(item, dict)
            checks[str(item["check"])] = bool(item["passed"])
        self.assertIs(api.RunStatus.SUCCEEDED, report.result.status)
        self.assertIs(api.EvaluationStatus.FAILED, report.evaluation.status)
        self.assertFalse(checks["safe_ast"])

    def test_two_concrete_seed_packs_pass_one_runtime_and_model(self) -> None:
        bundle = build_seed_proof_bundle()

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = api.GeneralAgentRuntime.create(
                config=api.RuntimeConfig(
                    interface_version=1,
                    authority_ceiling=bundle.authority,
                    default_limits=api.RunLimits(3, 4, 10),
                    hard_limits=api.RunLimits(3, 4, 10),
                    control_root=root / "control",
                    workspace_root=root / "workspace",
                    trace_schema_version=2,
                    evaluator_limits=api.EvaluatorLimits(5, 32_768),
                ),
                adapters=api.RuntimeAdapters(
                    model=ScriptedProofModel(),
                    capabilities=bundle.capabilities,
                    workspaces=bundle.workspace,
                ),
                packs=bundle.packs,
            )
            reports = tuple(
                runtime.run(
                    api.RunRequest(
                        pack=case.pack,
                        task=case.task,
                        authority=bundle.authority,
                        limits=api.RunLimitOverrides(),
                    )
                )
                for case in bundle.cases
            )

            data_report, coding_report = reports
            self.assertIsNotNone(data_report.artifacts.path)
            self.assertIsNotNone(coding_report.artifacts.path)
            assert data_report.artifacts.path is not None
            assert coding_report.artifacts.path is not None
            data_output = (
                data_report.artifacts.path / "outputs" / "region_summary.csv"
            ).read_text(encoding="utf-8")
            coding_output = (
                coding_report.artifacts.path / "src" / "slugify.py"
            ).read_text(encoding="utf-8")

        self.assertEqual(
            ["data-analysis", "workspace-coding"],
            [report.pack.pack_id for report in reports],
        )
        self.assertTrue(all(report.passed for report in reports))
        self.assertEqual(
            bundle.packs[0].manifest.identity.content_hash,
            bundle.packs[0].manifest.evaluator.content_hash,
        )
        self.assertEqual(
            bundle.packs[1].manifest.identity.content_hash,
            bundle.packs[1].manifest.evaluator.content_hash,
        )
        self.assertEqual(
            reports[0].provenance.configuration_digest,
            reports[1].provenance.configuration_digest,
        )
        self.assertEqual(0, coding_report.evaluation.measurements["exit_status"])
        self.assertTrue(coding_report.evaluation.measurements["public_tests_passed"])
        self.assertTrue(coding_report.evaluation.measurements["hidden_cases_passed"])
        self.assertIn(
            "Ran 1 test",
            str(coding_report.evaluation.measurements["public_test_output"]),
        )
        self.assertIn("stdout", coding_report.evaluation.measurements)
        self.assertIn("stderr", coding_report.evaluation.measurements)
        self.assertEqual(
            "region,order_count,revenue\neast,2,41.00\nwest,1,10.00\n",
            data_output,
        )
        self.assertIn("def slugify(text: str) -> str:", coding_output)
        self.assertNotEqual(
            {
                item.capability_id
                for item in bundle.packs[0].manifest.requested_capabilities
            },
            {
                item.capability_id
                for item in bundle.packs[1].manifest.requested_capabilities
            },
        )


if __name__ == "__main__":
    unittest.main()
