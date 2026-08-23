from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.summarize_react_mvp import summarize


class ReactMvpSummaryTest(unittest.TestCase):
    def test_expected_slots_keep_incomplete_artifact_separate_from_task_outcome(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            config_path = root / "config.json"
            run_root = root / "runs"
            config = {
                "suite_id": "summary-test",
                "content_hash": "sha256:frozen",
                "selection": {"ordered_instance_ids": ["owner__case-1"]},
                "experiment": {
                    "variants": ["act-only", "react"],
                    "repetitions": 1,
                },
            }
            config_path.write_text(json.dumps(config), encoding="utf-8")

            complete = run_root / "case-1-act-only-r1"
            complete.mkdir(parents=True)
            (complete / "trace.jsonl").write_text("{}\n", encoding="utf-8")
            (complete / "attempt.json").write_text(
                json.dumps(
                    {
                        "suite_id": "summary-test",
                        "config_hash": "sha256:frozen",
                        "instance_id": "owner__case-1",
                        "variant": "act-only",
                        "repetition": 1,
                        "run_result": {
                            "status": "model_error",
                            "error": "invalid response",
                            "steps": 2,
                            "model_calls": 3,
                        },
                        "provider_calls": [
                            {"usage": {"total_tokens": 17}},
                            {"usage": {"total_tokens": 19}},
                        ],
                        "evaluation": {
                            "runner_exit_code": 0,
                            "result": {
                                "resolved_instances": 0,
                                "completed_instances": 0,
                                "empty_patch_instances": 1,
                                "infra_failure_instances": 0,
                                "ambiguous_failure_instances": 0,
                                "error_instances": 0,
                            },
                        },
                    }
                ),
                encoding="utf-8",
            )

            incomplete = run_root / "case-1-react-r1"
            incomplete.mkdir(parents=True)
            (incomplete / "trace.jsonl").write_text(
                json.dumps(
                    {
                        "event_type": "run_completed",
                        "payload": {
                            "result": {
                                "status": "step_limit",
                                "error": "maximum tool steps reached",
                                "steps": 30,
                                "model_calls": 30,
                            }
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            result = summarize(config_path, run_root)

        overall = result["overall"]
        self.assertEqual(2, overall["planned_slots"])
        self.assertEqual(1, overall["complete_attempt_artifacts"])
        self.assertEqual(1, overall["task_outcomes"])
        self.assertEqual(1, overall["not_resolved"])
        self.assertEqual(1, overall["infrastructure_or_artifact_failures"])
        self.assertEqual("2/33", overall["provider_usage_call_coverage"])
        self.assertEqual(36, overall["recorded_tokens"])
        self.assertRegex(
            result["artifact_manifest_sha256"],
            r"^sha256:[0-9a-f]{64}$",
        )


if __name__ == "__main__":
    unittest.main()
