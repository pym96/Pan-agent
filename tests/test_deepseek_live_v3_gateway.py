from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
import tempfile
import unittest

from workspace_agent_harness.behavioral_eval import load_behavioral_eval_manifest
from workspace_agent_harness.behavioral_eval import BehavioralEvalCampaign
from workspace_agent_harness.context_projection import ModelContext
from workspace_agent_harness.deepseek_live import (
    DeepSeekLiveTranslationAdapter,
    DeepSeekModelGateway,
    DeepSeekToolBinding,
    RetainedDeepSeekResponse,
    locked_deepseek_model_profile,
    locked_deepseek_v3_model_profile,
)
from workspace_agent_harness.evented import (
    CandidateFinal,
    CandidateToolBatch,
    CandidateToolCall,
    ExchangeFailed,
    ExchangeSettled,
    FinalDisposition,
    MAX_TOOL_CALLS_PER_BATCH,
    PreparedModelTurn,
)
from workspace_agent_harness.translation import (
    AssistantFinalMessage,
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    ToolResultMessage,
    UserMessage,
)


ROOT = Path(__file__).parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "deepseek_live_v3"


class DeepSeekLiveV3GatewayTest(unittest.TestCase):
    def test_v3_profile_omits_tool_choice_without_changing_retained_wire_factors(self) -> None:
        case = load_behavioral_eval_manifest().case("DO-02")
        bindings = _bindings(case)
        v2 = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_model_profile(), tool_bindings=bindings
        )
        v3 = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(), tool_bindings=bindings
        )

        v2_request = v2.encode_request(_prepared_turn(case, bindings))
        v3_request = v3.encode_request(_prepared_turn(case, bindings))

        self.assertEqual("required", v2_request.payload["tool_choice"])
        self.assertNotIn("tool_choice", v3_request.payload)
        for key in (
            "model",
            "messages",
            "thinking",
            "reasoning_effort",
            "max_tokens",
            "stream",
            "tools",
        ):
            self.assertEqual(v2_request.payload[key], v3_request.payload[key])
        self.assertEqual(v2_request.endpoint, v3_request.endpoint)
        self.assertNotEqual(v2_request.model_profile_identity, v3_request.model_profile_identity)
        self.assertNotEqual(v2_request.translation_identity, v3_request.translation_identity)
        self.assertEqual(
            "provider-controlled-default-omitted",
            locked_deepseek_v3_model_profile().tool_choice_contract,
        )

    def test_retained_tool_and_terminal_fixtures_keep_existing_typed_semantics(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        adapter, request = _adapter_and_request(case)

        action = adapter.decode_response(request, _fixture("valid-tool-call.response.json"))
        completed = adapter.decode_response(
            request, _fixture("valid-complete-tool.response.json")
        )
        abstained = adapter.decode_response(
            request, _fixture("valid-abstain-tool.response.json")
        )

        self.assertIsInstance(action, ExchangeSettled)
        assert isinstance(action, ExchangeSettled)
        self.assertIsInstance(action.candidate, CandidateToolCall)
        assert isinstance(action.candidate, CandidateToolCall)
        self.assertEqual("inspect_status", action.candidate.tool_name)
        self.assertEqual({"input": "{}"}, dict(action.candidate.arguments))
        self.assertEqual("Inspect the retained status before deciding.", action.candidate.reasoning)
        self.assertIsInstance(completed, ExchangeSettled)
        assert isinstance(completed, ExchangeSettled)
        self.assertEqual(FinalDisposition.COMPLETED, completed.candidate.disposition)
        self.assertEqual("ready", completed.candidate.content)
        self.assertIsInstance(abstained, ExchangeSettled)
        assert isinstance(abstained, ExchangeSettled)
        self.assertEqual(FinalDisposition.ABSTAINED, abstained.candidate.disposition)
        self.assertEqual("insufficient_evidence", abstained.candidate.reason_code)

    def test_opt_in_tool_content_is_non_authoritative_and_identity_bound(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = _bindings(case)
        strict_adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(),
            tool_bindings=bindings,
        )
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(),
            tool_bindings=bindings,
            allow_tool_call_content=True,
        )
        request = adapter.encode_request(_prepared_turn(case, bindings))
        document = _mutate(
            _fixture_document("valid-tool-call.response.json"),
            ("choices", 0, "message", "content"),
            "I will inspect the retained status.",
        )

        result = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(status_code=200, body=_json_bytes(document)),
        )

        self.assertIsInstance(result, ExchangeSettled)
        assert isinstance(result, ExchangeSettled)
        self.assertIsInstance(result.candidate, CandidateToolCall)
        assert isinstance(result.candidate, CandidateToolCall)
        self.assertEqual("inspect_status", result.candidate.tool_name)
        self.assertEqual({"input": "{}"}, dict(result.candidate.arguments))
        self.assertNotEqual(strict_adapter.identity, adapter.identity)

        malformed = _mutate(
            document,
            ("choices", 0, "message", "content"),
            {"not": "text"},
        )
        rejected = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(status_code=200, body=_json_bytes(malformed)),
        )
        self.assertIsInstance(rejected, ExchangeFailed)
        assert isinstance(rejected, ExchangeFailed)
        self.assertEqual("tool_content_invalid", rejected.failure.code)

    def test_opt_in_optional_reasoning_round_trips_a_valid_tool_call(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = _bindings(case)
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(),
            tool_bindings=bindings,
            allow_optional_reasoning=True,
        )
        strict_adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(),
            tool_bindings=bindings,
        )
        self.assertNotEqual(strict_adapter.identity, adapter.identity)
        request = adapter.encode_request(_prepared_turn(case, bindings))
        document = _mutate(
            _fixture_document("valid-tool-call.response.json"),
            ("choices", 0, "message", "reasoning_content"),
            "",
        )

        result = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(status_code=200, body=_json_bytes(document)),
        )

        self.assertIsInstance(result, ExchangeSettled)
        assert isinstance(result, ExchangeSettled)
        self.assertIsInstance(result.candidate, CandidateToolCall)
        assert isinstance(result.candidate, CandidateToolCall)
        self.assertIsNone(result.candidate.reasoning)
        conversation = CanonicalConversation(
            (
                UserMessage("Inspect."),
                AssistantToolCall(
                    call=CanonicalToolCall(
                        result.candidate.call_id,
                        result.candidate.tool_name,
                        result.candidate.arguments,
                    )
                ),
                ToolResultMessage(
                    result.candidate.call_id,
                    result.candidate.tool_name,
                    "{}",
                ),
            )
        )
        follow_up = adapter.encode_request(
            _prepared_turn(case, bindings, conversation)
        )
        assistant = follow_up.payload["messages"][2]
        self.assertEqual("", assistant["reasoning_content"])

    def test_opt_in_optional_reasoning_admits_absence_but_rejects_non_text(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = _bindings(case)
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(),
            tool_bindings=bindings,
            allow_optional_reasoning=True,
        )
        request = adapter.encode_request(_prepared_turn(case, bindings))
        documents = (
            _delete(
                _fixture_document("valid-final-content.response.json"),
                ("choices", 0, "message", "reasoning_content"),
            ),
            _mutate(
                _fixture_document("valid-final-content.response.json"),
                ("choices", 0, "message", "reasoning_content"),
                None,
            ),
        )
        for name, document in zip(("absent", "null"), documents, strict=True):
            with self.subTest(name=name):
                result = adapter.decode_response(
                    request,
                    RetainedDeepSeekResponse(
                        status_code=200,
                        body=_json_bytes(document),
                    ),
                )

                self.assertIsInstance(result, ExchangeSettled)
                assert isinstance(result, ExchangeSettled)
                self.assertIsInstance(result.candidate, CandidateFinal)
                assert isinstance(result.candidate, CandidateFinal)
                self.assertIsNone(result.candidate.reasoning)

        malformed = _mutate(
            _fixture_document("valid-final-content.response.json"),
            ("choices", 0, "message", "reasoning_content"),
            {"not": "text"},
        )
        rejected = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(status_code=200, body=_json_bytes(malformed)),
        )
        self.assertIsInstance(rejected, ExchangeFailed)
        assert isinstance(rejected, ExchangeFailed)
        self.assertEqual("reasoning_content_missing", rejected.failure.code)

    def test_retained_stop_content_becomes_attributed_completed_final(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        adapter, request = _adapter_and_request(case)
        response = _fixture("valid-final-content.response.json", duration_ms=23)

        result = adapter.decode_response(request, response)

        self.assertIsInstance(result, ExchangeSettled)
        assert isinstance(result, ExchangeSettled)
        self.assertIsInstance(result.candidate, CandidateFinal)
        assert isinstance(result.candidate, CandidateFinal)
        self.assertEqual(FinalDisposition.COMPLETED, result.candidate.disposition)
        self.assertEqual("The requested state is already satisfied.", result.candidate.content)
        self.assertEqual(
            "The retained status directly establishes completion.",
            result.candidate.reasoning,
        )
        self.assertEqual("stop", result.stop_reason)
        self.assertEqual(request.payload_identity, result.evidence.request_identity)
        self.assertEqual(response.identity, result.evidence.response_identity)
        self.assertEqual(39, result.evidence.usage.input_tokens)
        self.assertEqual(17, result.evidence.usage.output_tokens)
        self.assertEqual(56, result.evidence.usage.total_tokens)
        self.assertEqual(23, result.evidence.duration_ms)
        self.assertEqual("deepseek-v4-flash", result.evidence.returned_model)
        self.assertEqual("v3-fixture-fingerprint", result.evidence.system_fingerprint)
        self.assertIn(("finish_reason", "stop"), result.candidate.provider_metadata)
        self.assertIn(("response_id", "v3-response-final-1"), result.candidate.provider_metadata)

    def test_v3_response_matrix_fails_closed_with_exact_oracles(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        adapter, request = _adapter_and_request(case)
        valid_tool = _fixture_document("valid-tool-call.response.json")
        valid_final = _fixture_document("valid-final-content.response.json")

        cases: tuple[tuple[str, dict[str, object], str], ...] = (
            ("empty final", _mutate(valid_final, ("choices", 0, "message", "content"), ""), "final_content_invalid"),
            ("missing final reasoning", _delete(valid_final, ("choices", 0, "message", "reasoning_content")), "reasoning_content_missing"),
            ("malformed final reasoning", _mutate(valid_final, ("choices", 0, "message", "reasoning_content"), 7), "reasoning_content_missing"),
            ("empty final reasoning", _mutate(valid_final, ("choices", 0, "message", "reasoning_content"), ""), "reasoning_content_missing"),
            ("tool content conflict", _mutate(valid_tool, ("choices", 0, "message", "content"), "also text"), "content_tool_calls_conflict"),
            ("final tool conflict", _mutate(valid_final, ("choices", 0, "message", "tool_calls"), valid_tool["choices"][0]["message"]["tool_calls"]), "content_tool_calls_conflict"),
            ("multiple actions", _append_call(valid_tool), "action_count_invalid"),
            ("missing action", _delete(valid_tool, ("choices", 0, "message", "tool_calls")), "action_count_invalid"),
            ("malformed arguments", _mutate(valid_tool, ("choices", 0, "message", "tool_calls", 0, "function", "arguments"), "{"), "tool_arguments_not_json"),
            ("unknown tool", _mutate(valid_tool, ("choices", 0, "message", "tool_calls", 0, "function", "name"), "unknown"), "action_tool_unknown"),
            ("length", _mutate(valid_tool, ("choices", 0, "finish_reason"), "length"), "length_terminated"),
            ("invalid finish", _mutate(valid_final, ("choices", 0, "finish_reason"), "content_filter"), "finish_reason_invalid"),
        )
        for name, document, code in cases:
            with self.subTest(name=name):
                result = adapter.decode_response(
                    request,
                    RetainedDeepSeekResponse(status_code=200, body=_json_bytes(document)),
                )
                self.assertIsInstance(result, ExchangeFailed)
                assert isinstance(result, ExchangeFailed)
                self.assertEqual(code, result.failure.code)

        reused_request = replace(request, historical_call_ids=("v3-call-1",))
        reused = adapter.decode_response(
            reused_request, _fixture("valid-tool-call.response.json")
        )
        self.assertIsInstance(reused, ExchangeFailed)
        assert isinstance(reused, ExchangeFailed)
        self.assertEqual("tool_call_id_reused", reused.failure.code)

        http_error = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(
                status_code=400,
                body=b'{"error":{"message":"unsupported request"}}',
            ),
        )
        self.assertIsInstance(http_error, ExchangeFailed)
        assert isinstance(http_error, ExchangeFailed)
        self.assertEqual("provider_http_status", http_error.failure.code)

    def test_explicit_batch_contract_is_bounded_unique_and_domain_only(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = _bindings(case)
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(),
            tool_bindings=bindings,
            max_tool_calls_per_response=MAX_TOOL_CALLS_PER_BATCH,
        )
        request = adapter.encode_request(_prepared_turn(case, bindings))
        valid_tool = _fixture_document("valid-tool-call.response.json")

        valid_batch = _batch_document(valid_tool, 2)
        admitted = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(
                status_code=200,
                body=_json_bytes(valid_batch),
            ),
        )
        self.assertIsInstance(admitted, ExchangeSettled)
        assert isinstance(admitted, ExchangeSettled)
        self.assertIsInstance(admitted.candidate, CandidateToolBatch)
        assert isinstance(admitted.candidate, CandidateToolBatch)
        self.assertEqual(
            ("v3-call-1", "v3-call-2"),
            tuple(call.call_id for call in admitted.candidate.calls),
        )

        duplicate = _append_call(valid_tool)
        duplicate_result = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(status_code=200, body=_json_bytes(duplicate)),
        )
        self.assertIsInstance(duplicate_result, ExchangeFailed)
        assert isinstance(duplicate_result, ExchangeFailed)
        self.assertEqual("tool_call_id_duplicate", duplicate_result.failure.code)

        oversized = _batch_document(valid_tool, MAX_TOOL_CALLS_PER_BATCH + 1)
        oversized_result = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(status_code=200, body=_json_bytes(oversized)),
        )
        self.assertIsInstance(oversized_result, ExchangeFailed)
        assert isinstance(oversized_result, ExchangeFailed)
        self.assertEqual(
            "action_batch_limit_exceeded",
            oversized_result.failure.code,
        )

        mixed = _fixture_document("valid-complete-tool.response.json")
        mixed["choices"][0]["message"]["tool_calls"].append(
            valid_tool["choices"][0]["message"]["tool_calls"][0]
        )
        mixed_result = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(status_code=200, body=_json_bytes(mixed)),
        )
        self.assertIsInstance(mixed_result, ExchangeFailed)
        assert isinstance(mixed_result, ExchangeFailed)
        self.assertEqual("terminal_action_mixed", mixed_result.failure.code)

    def test_identity_and_history_mismatch_fail_before_any_tool_effect(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        adapter, request = _adapter_and_request(case)
        response = _fixture("valid-tool-call.response.json")

        with self.assertRaisesRegex(ValueError, "ModelProfile identity mismatch"):
            adapter.decode_response(
                replace(request, model_profile_identity="sha256:tampered"), response
            )
        with self.assertRaisesRegex(ValueError, "Translation identity mismatch"):
            adapter.decode_response(
                replace(request, translation_identity="sha256:tampered"), response
            )
        mutated = adapter.encode_request(_prepared_turn(case, _bindings(case)))
        mutated.payload["messages"][1]["content"] = "tampered after identity"
        with self.assertRaisesRegex(ValueError, "payload mutated"):
            adapter.decode_response(mutated, response)

        mismatched_history = CanonicalConversation(
            (
                UserMessage("Inspect."),
                AssistantToolCall(
                    call=CanonicalToolCall(
                        "history-mismatch", "inspect_status", {"input": "{}"}
                    ),
                    reasoning="Inspect first.",
                ),
                ToolResultMessage("different-id", "inspect_status", "{}"),
            )
        )
        with self.assertRaisesRegex(ValueError, "does not match"):
            adapter.encode_request(
                _prepared_turn(case, _bindings(case), mismatched_history)
            )

        gateway = DeepSeekModelGateway(
            adapter=adapter,
            transport=_QueueTransport((_fixture("valid-final-content.response.json"),)),
        )
        with tempfile.TemporaryDirectory() as directory:
            report = BehavioralEvalCampaign(
                manifest=load_behavioral_eval_manifest(),
                artifacts_root=Path(directory),
                gateway_factory=lambda selected: gateway,
            ).run(case_ids=("SA-01",))
            raw_event_log = (
                Path(directory) / report.cases[0].event_log_ref
            ).read_text(encoding="utf-8")
        self.assertEqual((), report.cases[0].tool_sequence)
        self.assertNotIn(
            "The retained status directly establishes completion.", raw_event_log
        )

    def test_v3_replays_full_reasoning_for_tool_and_non_tool_assistant_history(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = _bindings(case)
        source = json.loads(
            (FIXTURES / "valid-multiturn.conversation.json").read_text(encoding="utf-8")
        )
        messages = source["messages"]
        conversation = CanonicalConversation(
            (
                UserMessage(messages[0]["content"]),
                AssistantToolCall(
                    call=CanonicalToolCall(
                        call_id=messages[1]["call_id"],
                        tool_name=messages[1]["tool_name"],
                        arguments={"input": json.dumps(messages[1]["arguments"], separators=(",", ":"))},
                    ),
                    reasoning=messages[1]["reasoning"],
                ),
                ToolResultMessage(
                    call_id=messages[2]["call_id"],
                    tool_name=messages[2]["tool_name"],
                    content=messages[2]["content"],
                ),
                AssistantFinalMessage(
                    content=messages[3]["content"],
                    reasoning=messages[3]["reasoning"],
                ),
                UserMessage(messages[4]["content"]),
            )
        )
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(), tool_bindings=bindings
        )

        request = adapter.encode_request(_prepared_turn(case, bindings, conversation))

        assistant_messages = [
            message for message in request.payload["messages"] if message["role"] == "assistant"
        ]
        self.assertEqual(2, len(assistant_messages))
        self.assertEqual("First inspect the status.", assistant_messages[0]["reasoning_content"])
        self.assertEqual(
            "The question can be answered from the retained result.",
            assistant_messages[1]["reasoning_content"],
        )
        self.assertEqual("No action was needed for that question.", assistant_messages[1]["content"])
        self.assertNotIn("tool_calls", assistant_messages[1])
        self.assertFalse(
            any(
                message["role"] == "user" and str(message["content"]).startswith("Observation")
                for message in request.payload["messages"]
            )
        )

        missing_reasoning = CanonicalConversation(
            (
                UserMessage("Inspect."),
                AssistantToolCall(
                    call=CanonicalToolCall("missing-reasoning", "inspect_status", {"input": "{}"})
                ),
                ToolResultMessage("missing-reasoning", "inspect_status", "{}"),
            )
        )
        with self.assertRaisesRegex(ValueError, "reasoning history"):
            adapter.encode_request(_prepared_turn(case, bindings, missing_reasoning))


def _bindings(case) -> tuple[DeepSeekToolBinding, ...]:
    return tuple(
        DeepSeekToolBinding(
            runtime_tool=definition.action_tool,
            provider_parameters=definition.parameters,
        )
        for definition in case.tools
    )


def _prepared_turn(case, bindings, conversation=None) -> PreparedModelTurn:
    selected = conversation or CanonicalConversation((UserMessage(case.model_prompt),))
    context = ModelContext(
        conversation=selected,
        summary=None,
        source_history_identity=selected.identity,
        system_policy_identity=case.system_policy_identity,
        tool_set_identity="v3-test-tool-set",
        context_policy_identity="v3-test-context-policy",
        input_estimate_tokens=1,
        estimator_identity="v3-test-estimator",
        estimator_source="offline-fixture",
        estimator_confidence="high",
        context_window_tokens=1_000_000,
        context_window_provenance="verified",
        context_window_source="frozen-v3-profile",
        context_window_confidence="high",
    )
    return PreparedModelTurn(
        run_id="v3-fixture-run",
        turn_id="v3-fixture-turn",
        model_context=context,
        tools=tuple(binding.runtime_tool for binding in bindings),
    )


def _adapter_and_request(case):
    bindings = _bindings(case)
    adapter = DeepSeekLiveTranslationAdapter(
        profile=locked_deepseek_v3_model_profile(), tool_bindings=bindings
    )
    return adapter, adapter.encode_request(_prepared_turn(case, bindings))


def _fixture(name: str, *, duration_ms: int | None = None) -> RetainedDeepSeekResponse:
    return RetainedDeepSeekResponse(
        status_code=200,
        body=(FIXTURES / name).read_bytes(),
        duration_ms=duration_ms,
    )


def _fixture_document(name: str) -> dict[str, object]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _json_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _mutate(source: dict[str, object], path: tuple[object, ...], value: object) -> dict[str, object]:
    copied = json.loads(json.dumps(source))
    selected = copied
    for key in path[:-1]:
        selected = selected[key]
    selected[path[-1]] = value
    return copied


def _delete(source: dict[str, object], path: tuple[object, ...]) -> dict[str, object]:
    copied = json.loads(json.dumps(source))
    selected = copied
    for key in path[:-1]:
        selected = selected[key]
    del selected[path[-1]]
    return copied


def _append_call(source: dict[str, object]) -> dict[str, object]:
    copied = json.loads(json.dumps(source))
    copied["choices"][0]["message"]["tool_calls"].append(
        json.loads(json.dumps(copied["choices"][0]["message"]["tool_calls"][0]))
    )
    return copied


def _batch_document(
    source: dict[str, object],
    count: int,
) -> dict[str, object]:
    copied = json.loads(json.dumps(source))
    template = copied["choices"][0]["message"]["tool_calls"][0]
    copied["choices"][0]["message"]["tool_calls"] = []
    for index in range(1, count + 1):
        call = json.loads(json.dumps(template))
        call["id"] = f"v3-call-{index}"
        copied["choices"][0]["message"]["tool_calls"].append(call)
    return copied


class _QueueTransport:
    def __init__(self, responses: tuple[RetainedDeepSeekResponse, ...]) -> None:
        self._responses = responses
        self.calls = 0

    def send(self, request, cancel_signal):
        response = self._responses[self.calls]
        self.calls += 1
        return response


if __name__ == "__main__":
    unittest.main()
