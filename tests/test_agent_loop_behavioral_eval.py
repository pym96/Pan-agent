from __future__ import annotations

import copy
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from threading import Event
from unittest.mock import patch

import workspace_agent_harness.behavioral_eval as behavioral_eval_module
from workspace_agent_harness.behavioral_eval import (
    BehavioralEvalCampaign,
    BehavioralFamily,
    EXPECTED_MANIFEST_IDENTITY,
    EvaluatorVerdict,
    MANIFEST_PATH,
    load_behavioral_eval_manifest,
    reconstruct_behavioral_eval_report,
)
from workspace_agent_harness.evented import (
    CandidateFinal,
    CandidateToolCall,
    ExchangeFailed,
    ExchangeSettled,
    FinalDisposition,
    PreparedModelTurn,
    ProviderFailure,
    ProviderFailureKind,
)


class SequenceGateway:
    def __init__(self, outputs: tuple[object, ...]) -> None:
        self.outputs = outputs
        self.calls = 0

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event) -> object:
        selected = self.outputs[self.calls]
        self.calls += 1
        if isinstance(selected, Exception):
            raise selected
        if isinstance(selected, (ExchangeSettled, ExchangeFailed)):
            return selected
        return ExchangeSettled(
            exchange_id=f"{prepared_turn.turn_id}:scripted",
            candidate=selected,  # type: ignore[arg-type]
        )


def tool_call(call_id: str, name: str, arguments: object) -> CandidateToolCall:
    return CandidateToolCall(
        call_id=call_id,
        tool_name=name,
        arguments={
            "input": (
                arguments
                if isinstance(arguments, str)
                else json.dumps(arguments, sort_keys=True, separators=(",", ":"))
            )
        },
    )


class AgentLoopBehavioralEvalTest(unittest.TestCase):
    def test_frozen_manifest_runs_information_case_through_public_agent_loop(self) -> None:
        manifest = load_behavioral_eval_manifest()
        gateway = behavioral_eval_module.ReferenceBehaviorGateway("IA-01")

        self.assertEqual(12, len(manifest.cases))
        self.assertEqual(
            {family: 3 for family in BehavioralFamily},
            {
                family: sum(case.family is family for case in manifest.cases)
                for family in BehavioralFamily
            },
        )

        with tempfile.TemporaryDirectory() as directory:
            report = BehavioralEvalCampaign(
                manifest=manifest,
                artifacts_root=Path(directory),
                gateway_factory=lambda case: gateway,
            ).run(case_ids=("IA-01",))

        self.assertEqual(1, report.summary.planned)
        self.assertEqual(1, report.summary.started)
        self.assertEqual(1, report.summary.passed)
        self.assertEqual(EvaluatorVerdict.PASSED, report.cases[0].evaluator_verdict)
        self.assertEqual("completed", report.cases[0].runtime_status)
        self.assertEqual(
            ("inspect_beacon", "submit_value"),
            report.cases[0].tool_sequence,
        )
        self.assertNotIn("beacon-value-oracle", manifest.case("IA-01").model_prompt)
        self.assertTrue(gateway.prepared_turns)
        self.assertTrue(
            all(
                "beacon-value-oracle" not in repr(turn.model_context)
                for turn in gateway.prepared_turns
            )
        )
        self.assertTrue(
            all(
                turn.model_context.context_policy_identity
                == manifest.case("IA-01").context_policy_identity
                for turn in gateway.prepared_turns
            )
        )
        self.assertEqual((), report.cases[0].context_events)

    def test_reference_campaign_passes_all_four_frozen_case_families(self) -> None:
        expected_sequences = {
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

        with tempfile.TemporaryDirectory() as directory:
            report = BehavioralEvalCampaign(
                manifest=load_behavioral_eval_manifest(),
                artifacts_root=Path(directory),
            ).run()

        self.assertEqual(12, report.summary.planned)
        self.assertEqual(12, report.summary.eligible)
        self.assertEqual(12, report.summary.started)
        self.assertEqual(12, report.summary.evaluable)
        self.assertEqual(12, report.summary.passed)
        self.assertEqual(0, report.summary.failed)
        self.assertEqual((), report.summary.failure_attribution)
        self.assertEqual(
            expected_sequences,
            {case.case_id: case.tool_sequence for case in report.cases},
        )
        self.assertEqual(
            {
                "RC-01": ("read_resource:not_found",),
                "RC-02": ("update_value:conflict",),
                "RC-03": ("publish:busy",),
            },
            {
                case.case_id: case.model_visible_tool_failures
                for case in report.cases
                if case.model_visible_tool_failures
            },
        )
        self.assertTrue(all(case.event_ids for case in report.cases))
        self.assertTrue(all(case.event_log_ref for case in report.cases))
        self.assertTrue(all(case.evaluator_verdict is EvaluatorVerdict.PASSED for case in report.cases))

    def test_report_and_reconstruction_are_stable_and_replay_has_no_calls(self) -> None:
        manifest = load_behavioral_eval_manifest()
        gateways: list[behavioral_eval_module.ReferenceBehaviorGateway] = []

        def gateway_factory(case: object) -> behavioral_eval_module.ReferenceBehaviorGateway:
            case_id = str(getattr(case, "case_id"))
            gateway = behavioral_eval_module.ReferenceBehaviorGateway(case_id)
            gateways.append(gateway)
            return gateway

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = BehavioralEvalCampaign(
                manifest=manifest,
                artifacts_root=root / "first",
                gateway_factory=gateway_factory,
            ).run()
            calls_before = sum(len(gateway.prepared_turns) for gateway in gateways)
            with patch.object(
                behavioral_eval_module.BehavioralEventTool,
                "execute",
                side_effect=AssertionError("replay called a tool Adapter"),
            ):
                replayed = reconstruct_behavioral_eval_report(
                    manifest=manifest,
                    artifacts_root=root / "first",
                )
            calls_after = sum(len(gateway.prepared_turns) for gateway in gateways)
            second = BehavioralEvalCampaign(
                manifest=manifest,
                artifacts_root=root / "second",
            ).run()

            self.assertEqual(calls_before, calls_after)
            self.assertEqual(first.canonical_json(), replayed.canonical_json())
            self.assertEqual(first.stable_summary_json(), second.stable_summary_json())
            self.assertEqual(
                (root / "first" / "report.json").read_bytes(),
                (root / "second" / "report.json").read_bytes(),
            )
            self.assertEqual(
                [family.value for family in BehavioralFamily],
                [family for family, _, _, _ in first.summary.family_results],
            )

    def test_failure_attribution_keeps_runtime_and_task_verdicts_separate(self) -> None:
        scripted = {
            "IA-01": SequenceGateway(
                (
                    tool_call("premature", "submit_value", {"value": "R7Q-41"}),
                    CandidateFinal("finished too soon"),
                )
            ),
            "IA-02": SequenceGateway(
                (tool_call("unknown", "not_declared", {}),)
            ),
            "IA-03": SequenceGateway((RuntimeError("deterministic transport loss"),)),
            "DO-01": SequenceGateway(
                (tool_call("bad-input", "prepare_release", "not-json"),)
            ),
            "RC-01": SequenceGateway(
                (
                    ExchangeFailed(
                        exchange_id="overflow-1",
                        failure=ProviderFailure(
                            kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                            code="context_length_exceeded",
                            message="deterministic overflow",
                        ),
                    ),
                    ExchangeFailed(
                        exchange_id="overflow-2",
                        failure=ProviderFailure(
                            kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                            code="context_length_exceeded",
                            message="deterministic retry overflow",
                        ),
                    ),
                )
            ),
            "SA-03": SequenceGateway(
                (
                    CandidateFinal(
                        "authority denied without inspection",
                        disposition=FinalDisposition.ABSTAINED,
                        reason_code="authority_denied",
                    ),
                )
            ),
        }

        with tempfile.TemporaryDirectory() as directory:
            report = BehavioralEvalCampaign(
                manifest=load_behavioral_eval_manifest(),
                artifacts_root=Path(directory),
                gateway_factory=lambda case: scripted[case.case_id],
            ).run(case_ids=tuple(scripted))

        results = {case.case_id: case for case in report.cases}
        self.assertEqual("completed", results["IA-01"].runtime_status)
        self.assertIs(EvaluatorVerdict.FAILED, results["IA-01"].evaluator_verdict)
        self.assertEqual("task.failure", results["IA-01"].failure_category)
        self.assertEqual("protocol.failure", results["IA-02"].failure_category)
        self.assertEqual("provider.failure", results["IA-03"].failure_category)
        self.assertEqual("tool.failure", results["DO-01"].failure_category)
        self.assertEqual("context.failure", results["RC-01"].failure_category)
        self.assertEqual(
            (
                "context.compaction_started",
                "context.compaction_completed",
                "context.overflow_retry_exhausted",
            ),
            tuple(event_type for event_type, _ in results["RC-01"].context_events),
        )
        self.assertEqual("abstained", results["SA-03"].runtime_status)
        self.assertIs(EvaluatorVerdict.FAILED, results["SA-03"].evaluator_verdict)
        self.assertEqual("policy.failure", results["SA-03"].failure_category)
        self.assertEqual(
            {
                "context.failure": 1,
                "policy.failure": 1,
                "protocol.failure": 1,
                "provider.failure": 1,
                "task.failure": 1,
                "tool.failure": 1,
            },
            dict(report.summary.failure_attribution),
        )

    def test_manifest_drift_fails_before_any_gateway_execution(self) -> None:
        source = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        mutations = {
            "count": lambda value: value["cases"].pop(),
            "category": lambda value: value["cases"][0].__setitem__(
                "family", "dependency-ordering"
            ),
            "oracle": lambda value: value["cases"][0].__setitem__(
                "protected_oracle", {}
            ),
            "limit": lambda value: value["cases"][0]["run_limits"].__setitem__(
                "max_tool_steps", 5
            ),
            "environment": lambda value: value["cases"][0][
                "initial_fixture_ref"
            ]["state"]["beacon"].__setitem__("current", "drifted"),
            "tool": lambda value: value["cases"][0]["tool_set_identity"][
                "tools"
            ][0].__setitem__("network_capability", True),
            "prose": lambda value: value["cases"][0].__setitem__(
                "task_prompt", "Provide chain-of-thought before acting."
            ),
            "hash": lambda value: value["cases"][0].__setitem__(
                "title", "identity-drift"
            ),
        }
        expected_errors = {
            "count": "exactly 12",
            "category": "three cases per family",
            "oracle": "protected oracle",
            "limit": "limits drift",
            "environment": "content identity drift",
            "tool": "local and network-free",
            "prose": "reasoning prose",
            "hash": "content identity drift",
        }

        with tempfile.TemporaryDirectory() as directory:
            for name, mutate in mutations.items():
                with self.subTest(name=name):
                    changed = copy.deepcopy(source)
                    mutate(changed)
                    path = Path(directory) / f"{name}.json"
                    path.write_text(json.dumps(changed), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, expected_errors[name]):
                        load_behavioral_eval_manifest(path)

        manifest = load_behavioral_eval_manifest()
        self.assertEqual(EXPECTED_MANIFEST_IDENTITY, manifest.identity)
        beacon = manifest.case("IA-01").initial_state["beacon"]
        with self.assertRaises(TypeError):
            beacon["current"] = "mutated"  # type: ignore[index]

        first = manifest.cases[0]
        changed = replace(
            first,
            initial_state={"beacon": {"current": "drifted"}, "submitted": None},
        )
        tampered = replace(manifest, cases=(changed, *manifest.cases[1:]))
        gateway_calls = 0

        def must_not_run(case: object) -> SequenceGateway:
            nonlocal gateway_calls
            gateway_calls += 1
            return SequenceGateway((CandidateFinal("must not run"),))

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "frozen lock"):
                BehavioralEvalCampaign(
                    manifest=tampered,
                    artifacts_root=Path(directory),
                    gateway_factory=must_not_run,
                ).run(case_ids=("IA-01",))
        self.assertEqual(0, gateway_calls)


if __name__ == "__main__":
    unittest.main()
