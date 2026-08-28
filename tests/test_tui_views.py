from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from workspace_agent_harness import RunLimits, Task
import workspace_agent_harness.behavioral_eval as behavioral_eval_module
from workspace_agent_harness.behavioral_eval import (
    BehavioralEvalCampaign,
    load_behavioral_eval_manifest,
)
from workspace_agent_harness.evented import (
    AgentLoop,
    DemoEchoTool,
    DeterministicDemoGateway,
    JsonlRunEventLog,
    classified_event_field,
    load_run_event_log,
    render_run_events,
    replay_run_event_log,
)


class TuiViewProjectionTest(unittest.TestCase):
    def test_views_and_replay_do_not_change_execution_or_evaluator_outcome(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            gateway = behavioral_eval_module.ReferenceBehaviorGateway("IA-01")
            report = BehavioralEvalCampaign(
                manifest=load_behavioral_eval_manifest(),
                artifacts_root=root,
                gateway_factory=lambda case: gateway,
            ).run(case_ids=("IA-01",))
            log_path = root / report.cases[0].event_log_ref
            events = load_run_event_log(log_path)
            log_before = log_path.read_bytes()
            turns_before = gateway.prepared_turns
            verdict_before = report.canonical_json()

            with patch.object(
                behavioral_eval_module.BehavioralEventTool,
                "execute",
                side_effect=AssertionError("view rendering called a tool Adapter"),
            ):
                for view in ("compact", "expanded", "trace"):
                    live = render_run_events(events, view=view)
                    replayed = replay_run_event_log(log_path, view=view)
                    self.assertEqual(live, replayed)

            self.assertEqual(log_before, log_path.read_bytes())
            self.assertEqual(turns_before, gateway.prepared_turns)
            self.assertEqual(verdict_before, report.canonical_json())
            self.assertEqual("passed", report.cases[0].evaluator_verdict.value)

    def test_one_retained_sequence_has_compact_expanded_and_trace_views(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "views.jsonl"
            result = AgentLoop(
                gateway=DeterministicDemoGateway(),
                tools=(DemoEchoTool(),),
                event_log=JsonlRunEventLog(log_path),
                run_id="view-contract-run",
            ).run(
                Task(task_id="view-contract", prompt="Inspect café 状态."),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=30),
            )
            events = load_run_event_log(log_path)

            compact = render_run_events(events, view="compact")
            expanded = render_run_events(events, view="expanded")
            trace = render_run_events(events, view="trace")

            self.assertEqual("completed", result.status.value)
            self.assertIn("VIEW compact", compact)
            self.assertIn("TASK Inspect café 状态.", compact)
            self.assertIn("ACTION candidate.accepted", compact)
            self.assertIn("OBSERVATION tool.execution_completed", compact)
            self.assertNotIn("model.exchange_started", compact)

            self.assertIn("VIEW expanded", expanded)
            self.assertIn("IN_FLIGHT model.exchange_started", expanded)
            self.assertIn("CANDIDATE model.exchange_settled", expanded)
            self.assertIn("ADMITTED candidate.accepted", expanded)
            self.assertIn("cause=", expanded)

            self.assertIn("VIEW trace", trace)
            self.assertIn('"schema_version":"run-event/v1"', trace)
            self.assertIn('"sequence":0', trace)
            self.assertIn('"event_id":', trace)
            self.assertIn('"caused_by_event_id":', trace)

    def test_visibility_policy_is_identical_in_all_views_and_replay(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "visibility.jsonl"
            event_log = JsonlRunEventLog(log_path)
            started = event_log.append(
                run_id="visibility-run",
                event_type="run.started",
                phase="accepted",
                caused_by_event_id=None,
                payload={
                    "prompt": "Inspect visibility.",
                    "public_note": "public-value",
                    "expanded_note": classified_event_field(
                        "expanded-value", "expanded"
                    ),
                    "restricted_note": classified_event_field(
                        "restricted-value-must-not-leak", "restricted"
                    ),
                    "secret_locator": classified_event_field(
                        "vault://credential-must-not-leak", "secret-ref"
                    ),
                    "never_note": classified_event_field(
                        "never-value-must-not-leak", "never-display"
                    ),
                    "reasoning": "private-reasoning-must-not-leak",
                    "api_key": "credential-value-must-not-leak",
                },
            )
            expanded_event = event_log.append(
                run_id="visibility-run",
                event_type="model.permitted_detail",
                phase="accepted",
                caused_by_event_id=started.event_id,
                visibility="expanded",
                payload={"detail": "expanded-event-value"},
            )
            restricted = event_log.append(
                run_id="visibility-run",
                event_type="provider.raw",
                phase="accepted",
                caused_by_event_id=expanded_event.event_id,
                visibility="restricted",
                payload={"body": "restricted-event-body-must-not-leak"},
            )
            event_log.append(
                run_id="visibility-run",
                event_type="run.terminal",
                phase="terminal",
                caused_by_event_id=restricted.event_id,
                payload={
                    "status": "completed",
                    "output": "safe terminal",
                    "error": None,
                    "steps": 0,
                    "model_calls": 0,
                },
            )
            events = load_run_event_log(log_path)

            compact = render_run_events(events, view="compact")
            expanded = render_run_events(events, view="expanded")
            trace = render_run_events(events, view="trace")

            self.assertNotIn("expanded-value", compact)
            self.assertNotIn("expanded-event-value", compact)
            self.assertIn("expanded-value", expanded)
            self.assertIn("expanded-event-value", expanded)
            self.assertIn("expanded-value", trace)
            self.assertIn("expanded-event-value", trace)
            for prohibited in (
                "restricted-value-must-not-leak",
                "credential-must-not-leak",
                "never-value-must-not-leak",
                "private-reasoning-must-not-leak",
                "credential-value-must-not-leak",
                "restricted-event-body-must-not-leak",
            ):
                self.assertNotIn(prohibited, compact)
                self.assertNotIn(prohibited, expanded)
                self.assertNotIn(prohibited, trace)
            self.assertIn("<restricted>", trace)
            self.assertIn("<secret-ref>", trace)
            self.assertIn("<never-display>", trace)

    def test_long_visible_payloads_are_content_addressed_not_dumped(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "long-output.jsonl"
            event_log = JsonlRunEventLog(log_path)
            started = event_log.append(
                run_id="long-output-run",
                event_type="run.started",
                phase="accepted",
                caused_by_event_id=None,
                payload={"prompt": "Render bounded output."},
            )
            large_observation = "观测" + ("x" * 20_000)
            completed = event_log.append(
                run_id="long-output-run",
                event_type="tool.execution_completed",
                phase="accepted",
                caused_by_event_id=started.event_id,
                tool_call_id="long-call",
                payload={
                    "tool_name": "local-tool",
                    "observation": large_observation,
                },
            )
            event_log.append(
                run_id="long-output-run",
                event_type="run.terminal",
                phase="terminal",
                caused_by_event_id=completed.event_id,
                payload={
                    "status": "completed",
                    "output": "done",
                    "error": None,
                    "steps": 1,
                    "model_calls": 1,
                },
            )
            events = load_run_event_log(log_path)
            digest = hashlib.sha256(large_observation.encode("utf-8")).hexdigest()

            for view in ("compact", "expanded", "trace"):
                rendered = render_run_events(events, view=view)
                self.assertNotIn(large_observation, rendered)
                self.assertIn(digest, rendered)
                self.assertLess(len(rendered.encode("utf-8")), 8_000)


if __name__ == "__main__":
    unittest.main()
