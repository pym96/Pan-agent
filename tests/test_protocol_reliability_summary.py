from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import Mapping

from scripts.run_protocol_reliability import _reject_fingerprint_drift, run_slot
from scripts.summarize_protocol_reliability import summarize
from workspace_agent_harness.protocol_reliability import (
    HttpExchange,
    ProtocolTransport,
    load_protocol_config,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = (
    PROJECT_ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "protocol-reliability-v1.json"
)
CORPUS_PATH = (
    PROJECT_ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "protocol-reliability-v1-contexts.json"
)


class _SequentialHttp:
    def __init__(self, responses: list[Mapping[str, object] | Exception]) -> None:
        self._responses = list(responses)

    def post(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> HttpExchange:
        response = self._responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return HttpExchange(200, json.dumps(response).encode("utf-8"))


def _response(content: str, total_tokens: int) -> dict[str, object]:
    return {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": content},
            }
        ],
        "model": "deepseek-v4-flash",
        "system_fingerprint": "fp-summary-test",
        "usage": {
            "prompt_tokens": total_tokens - 2,
            "completion_tokens": 2,
            "total_tokens": total_tokens,
        },
    }


class ProtocolReliabilitySummaryTest(unittest.TestCase):
    def test_nonempty_fingerprint_drift_stops_within_transport_only(self) -> None:
        _reject_fingerprint_drift(
            {
                ProtocolTransport.JSON_OBJECT: {"fp-json"},
                ProtocolTransport.STRICT_FUNCTION: {"fp-strict"},
            }
        )
        with self.assertRaisesRegex(SystemExit, "system_fingerprint drift"):
            _reject_fingerprint_drift(
                {
                    ProtocolTransport.JSON_OBJECT: {"fp-a", "fp-b"},
                    ProtocolTransport.STRICT_FUNCTION: set(),
                }
            )

    def test_original_rate_and_repair_rate_and_cost_remain_separate(self) -> None:
        config, corpus = load_protocol_config(CONFIG_PATH, CORPUS_PATH)
        context = corpus["contexts"][0]
        self.assertEqual("act-only", context["variant"])
        fake = _SequentialHttp(
            [
                _response("not-json", 10),
                _response('{"type":"final","output":"done"}', 20),
            ]
        )
        with tempfile.TemporaryDirectory() as temporary:
            run_root = Path(temporary)
            attempt_root = (
                run_root
                / f"{context['context_id']}-json-r1"
            )
            run_slot(
                config=config,
                corpus=corpus,
                context=context,
                protocol_transport=ProtocolTransport.JSON_OBJECT,
                repetition=1,
                api_key="sk-summary-secret",
                attempt_root=attempt_root,
                http_transport=fake,
            )
            result = summarize(CONFIG_PATH, CORPUS_PATH, run_root)
            j0 = result["by_scheme"]["J0"]
            j1 = result["by_scheme"]["J1"]
            self.assertEqual(1, j0["attempts"])
            self.assertEqual(0, j0["unconditional"]["l3_canonical_action_valid"]["successes"])
            self.assertEqual(1, j0["provider_calls"])
            self.assertEqual(0, j0["repair"]["attempted"])
            self.assertEqual(1, j1["unconditional"]["l3_canonical_action_valid"]["successes"])
            self.assertEqual(2, j1["provider_calls"])
            self.assertEqual(1, j1["repair"]["attempted"])
            self.assertEqual(1, j1["repair"]["l3_valid_after_repair"])
            self.assertEqual(30, j1["usage"]["total_tokens"]["sum_known"])
            self.assertEqual(2, result["matrix"]["original_provider_calls"] + result["matrix"]["repair_provider_calls"])

            response_path = attempt_root / "repair.response.body"
            response_path.write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "response artifact hash mismatch"):
                summarize(CONFIG_PATH, CORPUS_PATH, run_root)

    def test_missing_repair_usage_keeps_known_original_token_lower_bound(self) -> None:
        config, corpus = load_protocol_config(CONFIG_PATH, CORPUS_PATH)
        context = corpus["contexts"][0]
        fake = _SequentialHttp(
            [
                _response("not-json", 10),
                RuntimeError("simulated transport failure"),
            ]
        )
        with tempfile.TemporaryDirectory() as temporary:
            run_root = Path(temporary)
            run_slot(
                config=config,
                corpus=corpus,
                context=context,
                protocol_transport=ProtocolTransport.JSON_OBJECT,
                repetition=1,
                api_key="sk-summary-secret",
                attempt_root=run_root / f"{context['context_id']}-json-r1",
                http_transport=fake,
            )
            result = summarize(CONFIG_PATH, CORPUS_PATH, run_root)

        usage = result["by_scheme"]["J1"]["usage"]["total_tokens"]
        self.assertEqual(10, usage["sum_known"])
        self.assertEqual(1, usage["known_provider_calls"])
        self.assertEqual(2, usage["provider_call_denominator"])
        self.assertEqual(0, usage["complete_attempt_records"])


if __name__ == "__main__":
    unittest.main()
