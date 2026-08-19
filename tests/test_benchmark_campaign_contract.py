"""Behavior contracts for the accepted Evaluation Campaign seam.

The campaign is outside the General Agent Runtime and may invoke work only by
calling the Runtime's public ``run`` method. Passing these contracts does not
claim that a PinchBench Adapter, vertical task suite, or score exists.
"""

from __future__ import annotations

import importlib
import json
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any


REQUIRED_TARGET_NAMES = (
    "BenchmarkCase",
    "CaseEligibility",
    "CampaignRequest",
    "ComponentIdentity",
    "EvaluationCampaign",
    "RunUsage",
    "RuntimeProvenance",
    "SuiteManifest",
    "SuiteSelector",
    "benchmark_cases_hash",
    "benchmark_source_hash",
    "benchmark_transform_hash",
    "suite_content_hash",
)


def require_campaign_api(test: unittest.TestCase) -> ModuleType:
    api = importlib.import_module("workspace_agent_harness")
    missing = [name for name in REQUIRED_TARGET_NAMES if not hasattr(api, name)]
    test.assertEqual(
        [],
        missing,
        "ADR-0010 Interface regression; missing campaign Interface names: "
        f"{', '.join(missing)}",
    )
    return api


@dataclass(frozen=True)
class FakeRunRequest:
    case_id: str


class RecordingRuntime:
    def __init__(self, reports: dict[str, object]) -> None:
        self._reports = reports
        self.calls: list[str] = []
        api = importlib.import_module("workspace_agent_harness")
        self.provenance = api.RuntimeProvenance(
            runtime=api.ComponentIdentity(
                "runtime", "contract.RecordingRuntime", "sha256:" + "1" * 64
            ),
            configuration_digest="sha256:" + "2" * 64,
            model=api.ComponentIdentity(
                "model", "contract.RecordingModel", "sha256:" + "3" * 64
            ),
            tools=(),
            workspace=None,
            registered_packs=(),
            evaluators=(
                api.EvaluatorIdentity(
                    "baseline-evaluator",
                    "1.0.0",
                    "sha256:" + "4" * 64,
                ),
            ),
            protected_roots=(),
        )

    def run(self, request: FakeRunRequest) -> object:
        self.calls.append(request.case_id)
        outcome = self._reports[request.case_id]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class ContractSuite:
    def __init__(
        self,
        manifest: Any,
        cases: tuple[Any, ...],
        source: object,
    ) -> None:
        self.manifest = manifest
        self._cases = cases
        self._source = source

    def cases(self) -> tuple[Any, ...]:
        return self._cases

    def source_material(self) -> object:
        return self._source


def make_manifest(
    api: ModuleType,
    cases: tuple[Any, ...],
    *,
    source: object | None = None,
) -> tuple[Any, object]:
    source_material = (
        source
        if source is not None
        else {
            "catalog": "vertical-evidence-v1",
            "source_case_ids": tuple(case.source_case_id for case in cases),
        }
    )
    transform_descriptor = {"transform_id": "identity", "version": "1"}
    source_digest = api.benchmark_source_hash(source_material)
    cases_hash = api.benchmark_cases_hash(cases)
    transform_hash = api.benchmark_transform_hash(transform_descriptor)
    content_hash = api.suite_content_hash(
        suite_id="vertical-evidence",
        version="1.0.0",
        lane="vertical",
        source_revision="local:vertical-evidence-v1",
        source_digest=source_digest,
        cases_hash=cases_hash,
        transform_hash=transform_hash,
        metric_schema_version=1,
        required_packs=(),
    )
    selector = api.SuiteSelector("vertical-evidence", "1.0.0", content_hash)
    manifest = api.SuiteManifest(
        identity=selector,
        lane="vertical",
        source_revision="local:vertical-evidence-v1",
        source_digest=source_digest,
        cases_hash=cases_hash,
        transform_descriptor=transform_descriptor,
        transform_hash=transform_hash,
        metric_schema_version=1,
        required_packs=(),
    )
    return manifest, source_material


def make_case(
    api: ModuleType,
    *,
    case_id: str,
    eligibility: object,
    reason: str | None = None,
) -> Any:
    return api.BenchmarkCase(
        case_id=case_id,
        source_case_id=case_id,
        request=FakeRunRequest(case_id),
        eligibility=eligibility,
        ineligibility_reason=reason,
    )


def make_report(api: ModuleType, *, passed: bool, cost: float | None) -> object:
    usage = api.RunUsage(
        wall_time_seconds=1.0,
        model_requests=1,
        input_tokens=10,
        output_tokens=5,
        cache_read_tokens=0,
        cache_write_tokens=0,
        tool_calls=1,
        cost_usd=cost,
        cost_source="test-pricing-snapshot" if cost is not None else None,
    )
    return SimpleNamespace(passed=passed, usage=usage)


def make_attributed_report(
    api: ModuleType,
    *,
    result_status: object,
    evaluation_status: object,
    passed: bool,
) -> object:
    report: Any = make_report(api, passed=passed, cost=None)
    return SimpleNamespace(
        passed=passed,
        usage=report.usage,
        result=SimpleNamespace(status=result_status),
        evaluation=SimpleNamespace(
            status=evaluation_status,
            evaluator=api.EvaluatorIdentity(
                "contract-evaluator",
                "1.0.0",
                "sha256:" + "e" * 64,
            ),
        ),
    )


class BenchmarkCampaignContractTest(unittest.TestCase):
    def test_raw_attempts_are_retained_in_an_append_only_campaign_directory(self) -> None:
        api = require_campaign_api(self)
        cases = tuple(
            make_case(
                api,
                case_id=case_id,
                eligibility=api.CaseEligibility.ELIGIBLE,
            )
            for case_id in ("passed", "failed")
        )
        manifest, source = make_manifest(api, cases)
        exact = manifest.identity
        suite = ContractSuite(manifest, cases, source)
        runtime = RecordingRuntime(
            {
                "passed": make_report(api, passed=True, cost=0.30),
                "failed": make_report(api, passed=False, cost=0.20),
            }
        )

        with tempfile.TemporaryDirectory() as directory:
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=Path(directory),
            ).run(api.CampaignRequest(exact, repetitions=1, case_ids=None))
            attempt_paths = sorted(
                (report.artifacts.directory / "attempts").glob("*.json")
            )
            payloads = [
                json.loads(path.read_text(encoding="utf-8"))
                for path in attempt_paths
            ]
            final_payload = json.loads(
                report.artifacts.report_path.read_text(encoding="utf-8")
            )

        self.assertEqual(2, len(attempt_paths))
        self.assertEqual(["passed", "failed"], [item["case_id"] for item in payloads])
        self.assertEqual(2, final_payload["summary"]["attempted"])
        self.assertEqual(report.configuration_digest, final_payload["configuration_digest"])
        self.assertEqual(2, report.summary.model_requests)
        self.assertEqual(2, report.summary.tool_calls)
        self.assertEqual({"evaluation.failed": 1}, dict(report.summary.failure_attribution))
        self.assertEqual(("test-pricing-snapshot",), report.provenance.pricing_sources)

    def test_wrong_suite_hash_is_rejected_before_runtime_call(self) -> None:
        api = require_campaign_api(self)
        manifest, source = make_manifest(api, ())
        exact = manifest.identity
        suite = ContractSuite(manifest, (), source)
        runtime = RecordingRuntime({})

        with tempfile.TemporaryDirectory() as directory:
            campaign = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=Path(directory),
            )
            with self.assertRaises(ValueError):
                campaign.run(
                    api.CampaignRequest(
                        suite=api.SuiteSelector(
                            "vertical-evidence", "1.0.0", "sha256:" + "b" * 64
                        ),
                        repetitions=1,
                        case_ids=None,
                    )
                )

        self.assertEqual([], runtime.calls)

    def test_ineligible_case_is_visible_but_not_invoked_or_counted(self) -> None:
        api = require_campaign_api(self)
        eligible = make_case(
            api,
            case_id="eligible",
            eligibility=api.CaseEligibility.ELIGIBLE,
        )
        ineligible = make_case(
            api,
            case_id="needs-network",
            eligibility=api.CaseEligibility.INELIGIBLE,
            reason="missing_capability:network",
        )
        cases = (eligible, ineligible)
        manifest, source = make_manifest(api, cases)
        exact = manifest.identity
        suite = ContractSuite(manifest, cases, source)
        runtime = RecordingRuntime(
            {"eligible": make_report(api, passed=True, cost=0.25)}
        )

        with tempfile.TemporaryDirectory() as directory:
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=Path(directory),
            ).run(api.CampaignRequest(exact, repetitions=1, case_ids=None))

        self.assertEqual(["eligible"], runtime.calls)
        self.assertEqual(1, report.summary.attempted)
        self.assertEqual(1, report.summary.passed)
        self.assertEqual(1, report.summary.ineligible)
        self.assertEqual(1.0, report.summary.pass_rate)
        self.assertEqual(
            "missing_capability:network",
            report.cases[1].ineligibility_reason,
        )

    def test_failed_attempt_cost_remains_in_cost_per_success(self) -> None:
        api = require_campaign_api(self)
        cases = tuple(
            make_case(
                api,
                case_id=case_id,
                eligibility=api.CaseEligibility.ELIGIBLE,
            )
            for case_id in ("passed", "failed")
        )
        manifest, source = make_manifest(api, cases)
        exact = manifest.identity
        suite = ContractSuite(manifest, cases, source)
        runtime = RecordingRuntime(
            {
                "passed": make_report(api, passed=True, cost=0.30),
                "failed": make_report(api, passed=False, cost=0.20),
            }
        )

        with tempfile.TemporaryDirectory() as directory:
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=Path(directory),
            ).run(api.CampaignRequest(exact, repetitions=1, case_ids=None))

        self.assertEqual(2, report.summary.attempted)
        self.assertEqual(1, report.summary.passed)
        self.assertAlmostEqual(0.25, report.summary.cost_per_task_usd)
        self.assertAlmostEqual(0.50, report.summary.cost_per_success_usd)
        self.assertEqual(2, report.summary.cost_observed_attempts)

    def test_case_drift_is_rejected_during_preflight_before_runtime_call(self) -> None:
        api = require_campaign_api(self)
        original = make_case(
            api,
            case_id="original",
            eligibility=api.CaseEligibility.ELIGIBLE,
        )
        drifted = make_case(
            api,
            case_id="drifted",
            eligibility=api.CaseEligibility.ELIGIBLE,
        )
        manifest, source = make_manifest(api, (original,))
        suite = ContractSuite(manifest, (drifted,), source)
        runtime = RecordingRuntime({})

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "case content hash mismatch"):
                api.EvaluationCampaign.create(
                    runtime=runtime,
                    suites=[suite],
                    artifacts_root=Path(directory),
                )

        self.assertEqual([], runtime.calls)

    def test_all_terminal_and_evaluation_failures_stay_attributed_in_denominator(self) -> None:
        api = require_campaign_api(self)
        case_ids = (
            "passed",
            "evaluation-failed",
            "evaluation-error",
            "evaluation-not-run",
            "policy-blocked",
            "runtime-exception",
        )
        cases = tuple(
            make_case(
                api,
                case_id=case_id,
                eligibility=api.CaseEligibility.ELIGIBLE,
            )
            for case_id in case_ids
        )
        manifest, source = make_manifest(api, cases)
        suite = ContractSuite(manifest, cases, source)
        runtime = RecordingRuntime(
            {
                "passed": make_attributed_report(
                    api,
                    result_status=api.RunStatus.SUCCEEDED,
                    evaluation_status=api.EvaluationStatus.PASSED,
                    passed=True,
                ),
                "evaluation-failed": make_attributed_report(
                    api,
                    result_status=api.RunStatus.SUCCEEDED,
                    evaluation_status=api.EvaluationStatus.FAILED,
                    passed=False,
                ),
                "evaluation-error": make_attributed_report(
                    api,
                    result_status=api.RunStatus.SUCCEEDED,
                    evaluation_status=api.EvaluationStatus.ERROR,
                    passed=False,
                ),
                "evaluation-not-run": make_attributed_report(
                    api,
                    result_status=api.RunStatus.SUCCEEDED,
                    evaluation_status=api.EvaluationStatus.NOT_RUN,
                    passed=False,
                ),
                "policy-blocked": make_attributed_report(
                    api,
                    result_status=api.RunStatus.POLICY_BLOCKED,
                    evaluation_status=api.EvaluationStatus.FAILED,
                    passed=False,
                ),
                "runtime-exception": RuntimeError("provider bootstrap failed"),
            }
        )

        with tempfile.TemporaryDirectory() as directory:
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[suite],
                artifacts_root=Path(directory),
            ).run(
                api.CampaignRequest(
                    suite=manifest.identity,
                    repetitions=1,
                    case_ids=None,
                )
            )

        self.assertEqual(6, report.summary.attempted)
        self.assertEqual(1, report.summary.passed)
        self.assertEqual(2, report.summary.failed)
        self.assertEqual(3, report.summary.errors)
        self.assertEqual(
            {
                "evaluation.failed": 1,
                "evaluation.error": 1,
                "evaluation.not_run": 1,
                "execution.policy_blocked": 1,
                "runtime.exception": 1,
            },
            dict(report.summary.failure_attribution),
        )
        self.assertEqual(5, report.summary.usage_observed_attempts)
        self.assertAlmostEqual(5 / 6, report.summary.usage_measurement_coverage)
        self.assertEqual(1, len(report.provenance.runtimes))
        self.assertEqual(1, len(report.provenance.models))
        self.assertEqual(2, len(report.provenance.evaluators))
        self.assertEqual(
            (runtime.provenance.configuration_digest,),
            report.provenance.runtime_configurations,
        )

    def test_baseline_provenance_survives_when_every_runtime_call_raises(self) -> None:
        api = require_campaign_api(self)
        cases = tuple(
            make_case(
                api,
                case_id=case_id,
                eligibility=api.CaseEligibility.ELIGIBLE,
            )
            for case_id in ("exception-one", "exception-two")
        )
        manifest, source = make_manifest(api, cases)
        runtime = RecordingRuntime(
            {
                "exception-one": RuntimeError("first runtime failure"),
                "exception-two": RuntimeError("second runtime failure"),
            }
        )

        with tempfile.TemporaryDirectory() as directory:
            report = api.EvaluationCampaign.create(
                runtime=runtime,
                suites=[ContractSuite(manifest, cases, source)],
                artifacts_root=Path(directory),
            ).run(api.CampaignRequest(manifest.identity, repetitions=1))

        self.assertEqual(2, report.summary.attempted)
        self.assertEqual(2, report.summary.errors)
        self.assertEqual(1, len(report.provenance.runtimes))
        self.assertEqual(1, len(report.provenance.models))
        self.assertEqual(1, len(report.provenance.evaluators))
        self.assertEqual(
            (runtime.provenance.configuration_digest,),
            report.provenance.runtime_configurations,
        )


if __name__ == "__main__":
    unittest.main()
