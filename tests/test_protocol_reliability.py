from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import Mapping

from workspace_agent_harness.protocol_reliability import (
    HttpExchange,
    ProtocolTransport,
    assess_provider_response,
    build_request_payload,
    execute_protocol_call,
    extract_context_corpus,
    load_protocol_config,
    unavailable_assessment,
    wilson_interval,
)
from workspace_agent_harness.react_mvp import AgentVariant


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
SOURCE_RUN_ROOT = PROJECT_ROOT / ".runs" / "react-mvp-5"


def _response(message: Mapping[str, object], **metadata: object) -> dict[str, object]:
    return {
        "choices": [{"finish_reason": "stop", "message": dict(message)}],
        "model": metadata.get("model", "deepseek-v4-flash"),
        "system_fingerprint": metadata.get("system_fingerprint", "fp-test"),
        "usage": metadata.get(
            "usage",
            {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14},
        ),
    }


class _FakeHttp:
    def __init__(self, exchange: HttpExchange) -> None:
        self.exchange = exchange
        self.calls: list[dict[str, object]] = []

    def post(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> HttpExchange:
        self.calls.append(
            {
                "url": url,
                "headers": dict(headers),
                "payload": dict(payload),
                "timeout_seconds": timeout_seconds,
            }
        )
        return self.exchange


class ProtocolReliabilityContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config, cls.corpus = load_protocol_config(CONFIG_PATH, CORPUS_PATH)
        cls.context = cls.corpus["contexts"][0]

    def test_frozen_lock_has_24_real_contexts_and_four_schemes(self) -> None:
        contexts = self.corpus["contexts"]
        self.assertEqual(24, len(contexts))
        self.assertEqual(16, sum(item["cohort"] == "challenge" for item in contexts))
        self.assertEqual(8, sum(item["cohort"] == "control" for item in contexts))
        schemes = self.config["experiment"]["schemes"]
        self.assertEqual({"J0", "J1", "S0", "S1"}, set(schemes))
        self.assertEqual(240, self.config["experiment"]["raw_original_call_count"])
        self.assertEqual(240, self.config["experiment"]["maximum_repair_call_count"])

    def test_corpus_contains_no_obvious_credential_material(self) -> None:
        for path in (CONFIG_PATH, CORPUS_PATH):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("Authorization", text)
            self.assertNotRegex(text, r"\bsk-[A-Za-z0-9_-]{16,}\b")

    def test_json_and_strict_payloads_share_frozen_context(self) -> None:
        json_payload = build_request_payload(
            config=self.config,
            context=self.context,
            transport=ProtocolTransport.JSON_OBJECT,
        )
        strict_payload = build_request_payload(
            config=self.config,
            context=self.context,
            transport=ProtocolTransport.STRICT_FUNCTION,
        )
        self.assertEqual(json_payload["messages"][1:], strict_payload["messages"][1:])
        self.assertEqual({"type": "json_object"}, json_payload["response_format"])
        self.assertNotIn("tools", json_payload)
        self.assertEqual("required", strict_payload["tool_choice"])
        self.assertNotIn("response_format", strict_payload)
        for tool in strict_payload["tools"]:
            function = tool["function"]
            self.assertIs(function["strict"], True)
            parameters = function["parameters"]
            self.assertIs(parameters["additionalProperties"], False)
            self.assertEqual(
                set(parameters["properties"]),
                set(parameters["required"]),
            )

    def test_repair_payload_adds_one_bounded_protocol_feedback_message(self) -> None:
        original = _response({"role": "assistant", "content": "not-json"})
        base = build_request_payload(
            config=self.config,
            context=self.context,
            transport=ProtocolTransport.JSON_OBJECT,
        )
        repaired = build_request_payload(
            config=self.config,
            context=self.context,
            transport=ProtocolTransport.JSON_OBJECT,
            repair_failure_code="l1.invalid_json",
            previous_response=original,
        )
        self.assertEqual(len(base["messages"]) + 1, len(repaired["messages"]))
        feedback = repaired["messages"][-1]["content"]
        self.assertIn("l1.invalid_json", feedback)
        self.assertIn("not-json", feedback)
        self.assertIn("Do not advance the task", feedback)

    def test_json_assessment_separates_l1_l2_and_l3(self) -> None:
        invalid_json = assess_provider_response(
            _response({"role": "assistant", "content": "```json"}),
            transport=ProtocolTransport.JSON_OBJECT,
            variant=AgentVariant.REACT,
        )
        self.assertEqual("l1.invalid_json", invalid_json.earliest_failure_code)
        self.assertFalse(invalid_json.carrier_syntax_valid)

        missing_thought = assess_provider_response(
            _response(
                {
                    "role": "assistant",
                    "content": '{"type":"final","output":"done"}',
                }
            ),
            transport=ProtocolTransport.JSON_OBJECT,
            variant=AgentVariant.REACT,
        )
        self.assertTrue(missing_thought.carrier_syntax_valid)
        self.assertEqual("l2.react_thought", missing_thought.earliest_failure_code)

        unsupported_tool = assess_provider_response(
            _response(
                {
                    "role": "assistant",
                    "content": '{"type":"tool","tool":"python","arguments":{"command":"x"}}',
                }
            ),
            transport=ProtocolTransport.JSON_OBJECT,
            variant=AgentVariant.ACT_ONLY,
        )
        self.assertTrue(unsupported_tool.action_schema_valid)
        self.assertEqual("l3.unsupported_tool", unsupported_tool.earliest_failure_code)

        valid = assess_provider_response(
            _response(
                {
                    "role": "assistant",
                    "content": '{"type":"tool","tool":"bash","arguments":{"command":"pwd"}}',
                }
            ),
            transport=ProtocolTransport.JSON_OBJECT,
            variant=AgentVariant.ACT_ONLY,
        )
        self.assertTrue(valid.canonical_action_valid)
        self.assertIsNone(valid.earliest_failure_code)

    def test_strict_assessment_separates_l1_l2_and_l3(self) -> None:
        def message(name: str, arguments: str) -> dict[str, object]:
            return {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call-1",
                        "type": "function",
                        "function": {"name": name, "arguments": arguments},
                    }
                ],
            }

        invalid_arguments = assess_provider_response(
            _response(message("bash", "{")),
            transport=ProtocolTransport.STRICT_FUNCTION,
            variant=AgentVariant.ACT_ONLY,
        )
        self.assertEqual("l1.invalid_arguments_json", invalid_arguments.earliest_failure_code)

        missing_thought = assess_provider_response(
            _response(message("bash", '{"command":"pwd"}')),
            transport=ProtocolTransport.STRICT_FUNCTION,
            variant=AgentVariant.REACT,
        )
        self.assertEqual("l2.react_thought", missing_thought.earliest_failure_code)

        empty_command = assess_provider_response(
            _response(message("bash", '{"command":""}')),
            transport=ProtocolTransport.STRICT_FUNCTION,
            variant=AgentVariant.ACT_ONLY,
        )
        self.assertTrue(empty_command.action_schema_valid)
        self.assertEqual("l3.empty_command", empty_command.earliest_failure_code)

        valid = assess_provider_response(
            _response(message("finish", '{"thought":"done","output":"ready"}')),
            transport=ProtocolTransport.STRICT_FUNCTION,
            variant=AgentVariant.REACT,
        )
        self.assertTrue(valid.canonical_action_valid)
        self.assertEqual(
            {"output": "ready", "thought": "done", "type": "final"},
            json.loads(valid.canonical_action),
        )

    def test_l0_is_unconditional_and_has_no_repair_eligible_response(self) -> None:
        assessment = unavailable_assessment("l0.http_429")
        self.assertFalse(assessment.response_available)
        self.assertFalse(assessment.carrier_syntax_valid)
        self.assertEqual("l0.http_429", assessment.earliest_failure_code)

    def test_raw_call_retains_secret_free_request_response_and_usage(self) -> None:
        body = json.dumps(
            _response(
                {
                    "role": "assistant",
                    "content": '{"type":"final","output":"done"}',
                }
            )
        ).encode("utf-8")
        fake = _FakeHttp(HttpExchange(200, body))
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            record = execute_protocol_call(
                api_key="sk-secret-test-value",
                endpoint="https://api.deepseek.com/chat/completions",
                payload={
                    "model": "deepseek-v4-flash",
                    "messages": [{"role": "user", "content": "test"}],
                },
                variant=AgentVariant.ACT_ONLY,
                protocol_transport=ProtocolTransport.JSON_OBJECT,
                artifact_root=root,
                call_label="original",
                timeout_seconds=5,
                http_transport=fake,
            )
            self.assertTrue(record["assessment"]["l3_canonical_action_valid"])
            self.assertEqual(14, record["provider"]["usage"]["total_tokens"])
            for path in root.iterdir():
                self.assertNotIn(b"sk-secret-test-value", path.read_bytes())
            self.assertEqual(
                "Bearer sk-secret-test-value",
                fake.calls[0]["headers"]["Authorization"],
            )

    def test_wilson_interval_reports_none_for_no_denominator(self) -> None:
        self.assertIsNone(wilson_interval(0, 0))
        lower, upper = wilson_interval(5, 10)
        self.assertAlmostEqual(0.2365930905, lower, places=8)
        self.assertAlmostEqual(0.7634069095, upper, places=8)

    @unittest.skipUnless(SOURCE_RUN_ROOT.is_dir(), "local raw ReAct MVP Traces are absent")
    def test_frozen_corpus_reconstructs_exactly_from_source_traces(self) -> None:
        regenerated = extract_context_corpus(
            run_root=SOURCE_RUN_ROOT,
            source_config_hash=self.config["source_experiment"]["config_hash"],
            source_manifest_hash=self.config["source_experiment"]["artifact_manifest_sha256"],
            selection_seed=self.corpus["selection"]["seed"],
        )
        self.assertEqual(self.corpus, regenerated)


if __name__ == "__main__":
    unittest.main()
