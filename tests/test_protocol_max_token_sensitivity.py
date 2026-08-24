from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import Mapping

from scripts.run_protocol_max_token_sensitivity import run_slot
from scripts.summarize_protocol_max_token_sensitivity import summarize
from workspace_agent_harness.protocol_max_token_sensitivity import (
    build_sensitivity_payload,
    load_sensitivity_config,
    ordered_slots,
    response_diagnostics,
    verify_source_observations,
)
from workspace_agent_harness.protocol_reliability import HttpExchange


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "protocol-reliability-v1.1-max-token-sensitivity.json"
EXTENSION_CONFIG_PATH = PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "protocol-reliability-v1.2-max-token-16k-extension.json"
PARENT_CONFIG_PATH = PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "protocol-reliability-v1.json"
CORPUS_PATH = PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "protocol-reliability-v1-contexts.json"
PARENT_RUN_ROOT = PROJECT_ROOT / ".runs" / "protocol-reliability-v1"
PARENT_SUMMARY_PATH = PROJECT_ROOT / ".runs" / "protocol-reliability-v1-summary-with-call-coverage.json"
PRIOR_SENSITIVITY_SUMMARY_PATH = PROJECT_ROOT / ".runs" / "protocol-reliability-v1.1-max-token-sensitivity-summary.json"


class _FakeHttp:
    def __init__(self, response: Mapping[str, object]) -> None:
        self.response = response
        self.payloads: list[Mapping[str, object]] = []

    def post(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> HttpExchange:
        self.payloads.append(payload)
        return HttpExchange(200, json.dumps(self.response).encode("utf-8"))


def _strict_response(arguments: str, *, finish_reason: str = "tool_calls", completion_tokens: int = 20) -> dict[str, object]:
    return {
        "choices": [
            {
                "finish_reason": finish_reason,
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "call-1",
                            "type": "function",
                            "function": {"name": "bash", "arguments": arguments},
                        }
                    ],
                },
            }
        ],
        "model": "deepseek-v4-flash",
        "system_fingerprint": "fp-sensitivity-test",
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": completion_tokens,
            "total_tokens": 100 + completion_tokens,
        },
    }


class ProtocolMaxTokenSensitivityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config, cls.parent, cls.corpus = load_sensitivity_config(
            CONFIG_PATH,
            PARENT_CONFIG_PATH,
            CORPUS_PATH,
        )
        cls.contexts = {
            item["context_id"]: item
            for item in cls.corpus["contexts"]
        }

    def test_frozen_matrix_has_five_contexts_three_arms_and_seventy_five_slots(self) -> None:
        slots = ordered_slots(self.config)
        self.assertEqual(75, len(slots))
        self.assertEqual({2048, 4096, 8192}, {slot[1] for slot in slots})
        self.assertEqual(5, len({slot[0] for slot in slots}))
        self.assertEqual({1, 2, 3, 4, 5}, {slot[2] for slot in slots})

    def test_only_max_tokens_changes_between_payload_arms(self) -> None:
        context = self.contexts["prv1-c07-5f1aed80eac0"]
        payloads = [
            build_sensitivity_payload(
                parent_config=self.parent,
                context=context,
                max_completion_tokens=arm,
            )
            for arm in (2048, 4096, 8192)
        ]
        stripped = []
        for payload in payloads:
            material = dict(payload)
            material.pop("max_tokens")
            stripped.append(material)
        self.assertEqual(stripped[0], stripped[1])
        self.assertEqual(stripped[1], stripped[2])
        self.assertEqual([2048, 4096, 8192], [payload["max_tokens"] for payload in payloads])

    def test_frozen_16k_extension_has_twenty_five_new_slots(self) -> None:
        extension, _, _ = load_sensitivity_config(
            EXTENSION_CONFIG_PATH,
            PARENT_CONFIG_PATH,
            CORPUS_PATH,
        )
        slots = ordered_slots(extension)
        self.assertEqual(25, len(slots))
        self.assertEqual({16384}, {slot[1] for slot in slots})
        self.assertEqual(5, len({slot[0] for slot in slots}))

    def test_16k_payload_only_changes_the_maximum_from_8k(self) -> None:
        context = self.contexts["prv1-c07-5f1aed80eac0"]
        payload_8k = build_sensitivity_payload(
            parent_config=self.parent,
            context=context,
            max_completion_tokens=8192,
        )
        payload_16k = build_sensitivity_payload(
            parent_config=self.parent,
            context=context,
            max_completion_tokens=16384,
        )
        self.assertEqual(8192, payload_8k.pop("max_tokens"))
        self.assertEqual(16384, payload_16k.pop("max_tokens"))
        self.assertEqual(payload_8k, payload_16k)

    def test_runaway_diagnostics_count_markers_without_interpreting_them(self) -> None:
        response = _strict_response(
            '{"command":"pwd","thought":"<｜｜DSML｜｜invoke name=x><｜end▁of▁thinking｜>"}'
        )
        diagnostics = response_diagnostics(response)
        self.assertEqual(1, diagnostics["dsml_marker_count"])
        self.assertEqual(1, diagnostics["end_of_thinking_marker_count"])
        self.assertEqual(1, diagnostics["invoke_marker_count"])

    @unittest.skipUnless(
        PARENT_RUN_ROOT.is_dir() and PARENT_SUMMARY_PATH.is_file(),
        "parent protocol-reliability-v1 raw Evidence is absent",
    )
    def test_source_selection_exactly_covers_all_parent_length_hits(self) -> None:
        verification = verify_source_observations(
            self.config,
            parent_run_root=PARENT_RUN_ROOT,
            parent_summary_path=PARENT_SUMMARY_PATH,
        )
        self.assertEqual(120, verification["strict_attempts"])
        self.assertEqual(21, verification["length_hits"])
        self.assertEqual(
            set(self.config["experiment"]["ordered_context_ids"]),
            set(verification["length_hits_by_context"]),
        )

    @unittest.skipUnless(
        PARENT_RUN_ROOT.is_dir()
        and PARENT_SUMMARY_PATH.is_file()
        and PRIOR_SENSITIVITY_SUMMARY_PATH.is_file(),
        "parent sensitivity Evidence is absent",
    )
    def test_16k_extension_locks_the_completed_v11_summary_and_manifest(self) -> None:
        extension, _, _ = load_sensitivity_config(
            EXTENSION_CONFIG_PATH,
            PARENT_CONFIG_PATH,
            CORPUS_PATH,
        )
        verification = verify_source_observations(
            extension,
            parent_run_root=PARENT_RUN_ROOT,
            parent_summary_path=PARENT_SUMMARY_PATH,
            prior_sensitivity_summary_path=PRIOR_SENSITIVITY_SUMMARY_PATH,
        )
        self.assertEqual(
            extension["source_sensitivity"]["summary_sha256"],
            verification["prior_sensitivity_summary_sha256"],
        )
        self.assertEqual(
            extension["source_sensitivity"]["artifact_manifest_sha256"],
            verification["prior_sensitivity_artifact_manifest_sha256"],
        )

    @unittest.skipUnless(
        PARENT_RUN_ROOT.is_dir() and PARENT_SUMMARY_PATH.is_file(),
        "parent protocol-reliability-v1 raw Evidence is absent",
    )
    def test_summary_validates_request_response_and_diagnostics(self) -> None:
        context = self.contexts["prv1-c07-5f1aed80eac0"]
        fake = _FakeHttp(
            _strict_response('{"command":"pwd","thought":"inspect"}')
        )
        with tempfile.TemporaryDirectory() as temporary:
            run_root = Path(temporary)
            attempt_root = run_root / "prv1-c07-5f1aed80eac0-strict-max2048-r1"
            run_slot(
                config=self.config,
                parent_config=self.parent,
                corpus=self.corpus,
                context=context,
                max_completion_tokens=2048,
                repetition=1,
                api_key="sk-sensitivity-test-secret",
                attempt_root=attempt_root,
                http_transport=fake,
            )
            result = summarize(run_root)
            arm = result["by_max_completion_tokens"]["2048"]
            self.assertEqual(1, arm["complete_attempts"])
            self.assertEqual(1, arm["unconditional"]["l3_canonical_action_valid"]["successes"])
            self.assertEqual(0, arm["cap_hits"])
            self.assertEqual(0, arm["runaway_diagnostics"]["attempts_with_dsml"])
            self.assertEqual(2048, fake.payloads[0]["max_tokens"])
            for path in attempt_root.iterdir():
                self.assertNotIn(b"sk-sensitivity-test-secret", path.read_bytes())

            (attempt_root / "original.response.body").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "response artifact hash mismatch"):
                summarize(run_root)


if __name__ == "__main__":
    unittest.main()
