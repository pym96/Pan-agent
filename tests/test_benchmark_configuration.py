from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Mapping, cast

import workspace_agent_harness as api
from workspace_agent_harness import CaseEligibility
from workspace_agent_harness.benchmarks import (
    configured_pinchbench_lock,
    load_pinchbench_suite,
    load_vertical_evidence_suite,
)
from workspace_agent_harness.proof_packs import (
    ScriptedProofModel,
    build_seed_proof_bundle,
)


class BenchmarkConfigurationTest(unittest.TestCase):
    def test_vertical_eligible_control_provenance_cannot_be_forged(self) -> None:
        bundle = build_seed_proof_bundle()
        configured_path = (
            Path(__file__).parents[1]
            / "workspace_agent_harness"
            / "benchmark_configs"
            / "vertical-evidence-v1.json"
        )
        configured = json.loads(configured_path.read_text(encoding="utf-8"))
        for field_name, forged_value in (
            ("fixture_id", "forged-fixture"),
            ("evaluator_id", "forged-evaluator"),
        ):
            with self.subTest(field_name=field_name):
                forged = json.loads(json.dumps(configured))
                forged["tasks"][0][field_name] = forged_value
                with tempfile.TemporaryDirectory() as temporary:
                    forged_path = Path(temporary) / "vertical.json"
                    forged_path.write_text(json.dumps(forged), encoding="utf-8")

                    with self.assertRaisesRegex(
                        ValueError,
                        "eligible control provenance mismatch",
                    ):
                        load_vertical_evidence_suite(
                            bundle,
                            config_path=forged_path,
                        )

    def test_vertical_campaign_retains_28_ineligible_cases_and_attempts_only_seeds(self) -> None:
        bundle = build_seed_proof_bundle()
        suite = load_vertical_evidence_suite(bundle)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
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
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=root / "campaigns",
            ).run(
                api.CampaignRequest(
                    suite=suite.manifest.identity,
                    repetitions=1,
                )
            )

        self.assertEqual(30, len(report.cases))
        self.assertEqual(2, report.summary.attempted)
        self.assertEqual(2, report.summary.passed)
        self.assertEqual(28, report.summary.ineligible)

    def test_vertical_catalog_freezes_15_plus_15_without_hiding_unimplemented_cases(self) -> None:
        suite = load_vertical_evidence_suite(build_seed_proof_bundle())

        cases = suite.cases()
        source_tasks = cast(
            tuple[Mapping[str, object], ...],
            suite.source_material()["tasks"],
        )
        counts: dict[str, int] = {}
        for task in source_tasks:
            pack_id = cast(str, task["pack_id"])
            counts[pack_id] = counts.get(pack_id, 0) + 1
        self.assertEqual({"data-analysis": 15, "workspace-coding": 15}, counts)
        self.assertEqual(30, len(cases))
        self.assertEqual(30, len({case.case_id for case in cases}))
        self.assertEqual(
            {"paid-revenue-by-region-v1", "repair-slugify-v1"},
            {
                case.case_id
                for case in cases
                if case.eligibility is CaseEligibility.ELIGIBLE
            },
        )
        self.assertEqual(
            {"vertical.case_not_implemented"},
            {
                case.ineligibility_reason
                for case in cases
                if case.eligibility is CaseEligibility.INELIGIBLE
            },
        )
        self.assertEqual("vertical-evidence", suite.manifest.lane)
        self.assertEqual(2, len(suite.manifest.required_packs))

    def test_configured_pinchbench_core_lock_pins_the_selected_v2_source(self) -> None:
        lock = configured_pinchbench_lock("core")
        source_lock = cast(Mapping[str, object], lock["source"])
        catalog_lock = cast(Mapping[str, object], lock["catalog"])

        self.assertEqual("core", lock["profile"])
        self.assertEqual("pinchbench-compatible-core", lock["suite_id"])
        self.assertEqual(
            "47efe9bf5e14ae52dd9764c5e831317442b054a5",
            source_lock["commit"],
        )
        self.assertEqual(
            "1368925645e3bffa49fb2d238958e2530236a3e0",
            source_lock["tasks_tree"],
        )
        self.assertEqual(
            "sha256:38d7cd1bddfa5e9fefc7b6945c91955f36dc5c88c32c994bf8676344b1069a7b",
            source_lock["manifest_sha256"],
        )
        self.assertEqual(21, catalog_lock["core_task_count"])
        self.assertEqual(147, catalog_lock["full_task_count"])

    def test_exact_pinchbench_checkout_loads_as_a_pre_run_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkout, lock_path = self._make_pinchbench_fixture(root)

            suite = load_pinchbench_suite(
                checkout=checkout,
                lock_path=lock_path,
                profile="core",
            )

            self.assertEqual("pinchbench-compatible", suite.manifest.lane)
            self.assertEqual(("pinchbench:task_sanity",), tuple(c.case_id for c in suite.cases()))
            self.assertTrue(
                all(c.eligibility is CaseEligibility.INELIGIBLE for c in suite.cases())
            )
            self.assertEqual(
                {"pinchbench.translation_not_frozen"},
                {c.ineligibility_reason for c in suite.cases()},
            )

    def test_pinchbench_task_worktree_drift_fails_before_suite_creation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkout, lock_path = self._make_pinchbench_fixture(root)
            task = checkout / "tasks" / "task_sanity.md"
            task.write_text(task.read_text(encoding="utf-8") + "\nmutated\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "task worktree drift"):
                load_pinchbench_suite(
                    checkout=checkout,
                    lock_path=lock_path,
                    profile="core",
                )

    def test_pinchbench_profile_cannot_differ_from_the_lock(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkout, lock_path = self._make_pinchbench_fixture(root)

            with self.assertRaisesRegex(ValueError, "profile does not match"):
                load_pinchbench_suite(
                    checkout=checkout,
                    lock_path=lock_path,
                    profile="full",
                )

    def test_manifest_category_is_canonical_and_case_drift_is_retained(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkout, lock_path = self._make_pinchbench_fixture(
                root,
                sanity_category="Productivity",
            )

            suite = load_pinchbench_suite(
                checkout=checkout,
                lock_path=lock_path,
                profile="core",
            )

            self.assertEqual(
                (
                    {
                        "task_id": "task_sanity",
                        "manifest_category": "productivity",
                        "frontmatter_category": "Productivity",
                    },
                ),
                suite.source_material()["category_discrepancies"],
            )

    def test_unmanifested_pinchbench_task_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            checkout, lock_path = self._make_pinchbench_fixture(
                root,
                include_unmanifested_task=True,
            )

            with self.assertRaisesRegex(ValueError, "task-file set does not match"):
                load_pinchbench_suite(
                    checkout=checkout,
                    lock_path=lock_path,
                    profile="core",
                )

    def test_pinchbench_timeout_must_be_present_and_positive_integer(self) -> None:
        for timeout_value in (None, "0", "-1", "1.5"):
            with self.subTest(timeout_value=timeout_value):
                with tempfile.TemporaryDirectory() as temporary:
                    root = Path(temporary)
                    checkout, lock_path = self._make_pinchbench_fixture(
                        root,
                        sanity_timeout=timeout_value,
                    )

                    with self.assertRaisesRegex(ValueError, "positive integer"):
                        load_pinchbench_suite(
                            checkout=checkout,
                            lock_path=lock_path,
                            profile="core",
                        )

    def _make_pinchbench_fixture(
        self,
        root: Path,
        *,
        sanity_category: str = "productivity",
        include_unmanifested_task: bool = False,
        sanity_timeout: str | None = "60",
    ) -> tuple[Path, Path]:
        checkout = root / "pinchbench"
        tasks = checkout / "tasks"
        tasks.mkdir(parents=True)
        manifest = """run_first:
  - task_sanity
core:
  - task_sanity
categories:
  productivity:
    - task_sanity
  coding:
    - task_refactor
"""
        (tasks / "manifest.yaml").write_text(manifest, encoding="utf-8")
        timeout_field = (
            "" if sanity_timeout is None else f"timeout_seconds: {sanity_timeout}\n"
        )
        (tasks / "task_sanity.md").write_text(
            f"""---
id: task_sanity
name: Sanity
category: {sanity_category}
grading_type: automated
{timeout_field}---

## Prompt

Reply once.

## Automated Checks

```python
raise AssertionError("upstream grader must not execute while loading")
```
""",
            encoding="utf-8",
        )
        (tasks / "task_refactor.md").write_text(
            """---
id: task_refactor
name: Refactor
category: coding
grading_type: hybrid
timeout_seconds: 120
---

## Prompt

Rename one function.
""",
            encoding="utf-8",
        )
        if include_unmanifested_task:
            (tasks / "task_hidden.md").write_text(
                """---
id: task_hidden
name: Hidden
category: coding
grading_type: automated
timeout_seconds: 60
---

## Prompt

This must be listed in the manifest.
""",
                encoding="utf-8",
            )
        subprocess.run(("git", "init", "-q"), cwd=checkout, check=True)
        subprocess.run(("git", "add", "tasks"), cwd=checkout, check=True)
        subprocess.run(
            (
                "git",
                "-c",
                "user.name=Benchmark Test",
                "-c",
                "user.email=benchmark@example.invalid",
                "commit",
                "-qm",
                "fixture",
            ),
            cwd=checkout,
            check=True,
        )
        commit = self._git(checkout, "rev-parse", "HEAD")
        tasks_tree = self._git(checkout, "rev-parse", "HEAD:tasks")
        lock_path = root / "pinchbench.lock.json"
        lock_path.write_text(
            json.dumps(
                {
                    "schema": "workspace-agent-harness/pinchbench-lock/v1",
                    "suite_id": "pinchbench-compatible-core",
                    "version": "2.0.0-local.1",
                    "profile": "core",
                    "source": {
                        "repository": "https://example.invalid/pinchbench.git",
                        "tag": "v2.0.0",
                        "commit": commit,
                        "tasks_tree": tasks_tree,
                        "manifest_sha256": "sha256:"
                        + hashlib.sha256(manifest.encode()).hexdigest(),
                    },
                    "catalog": {
                        "full_task_count": 2,
                        "core_task_count": 1,
                        "category_count": 2,
                    },
                    "admission": {
                        "default_eligibility": "ineligible",
                        "reason": "pinchbench.translation_not_frozen",
                        "execute_upstream_graders": False,
                    },
                },
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        return checkout, lock_path

    @staticmethod
    def _git(checkout: Path, *arguments: str) -> str:
        completed = subprocess.run(
            ("git", *arguments),
            cwd=checkout,
            check=True,
            capture_output=True,
            text=True,
        )
        return completed.stdout.strip()


if __name__ == "__main__":
    unittest.main()
