from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from threading import Event

from workspace_agent_harness.behavioral_eval import (
    BehavioralEvalCampaign,
    EvaluatorVerdict,
    load_behavioral_eval_manifest,
)
from workspace_agent_harness.context_projection import ModelContext
from workspace_agent_harness.deepseek_live import (
    DeepSeekLiveTranslationAdapter,
    DeepSeekModelGateway,
    DeepSeekHttpTransport,
    DeepSeekToolBinding,
    FileDeepSeekExchangeStore,
    RetainedDeepSeekResponse,
    locked_deepseek_model_profile,
)
from workspace_agent_harness.evented import (
    CandidateFinal,
    CandidateToolCall,
    ExchangeFailed,
    ExchangeSettled,
    FinalDisposition,
    ProviderFailureKind,
    PreparedModelTurn,
    RunEventView,
    load_run_event_log,
    render_run_events,
)
from workspace_agent_harness.translation import (
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    ToolResultMessage,
    UserMessage,
    canonical_json_bytes,
)


class DeepSeekLiveGatewayTest(unittest.TestCase):
    def test_locked_request_uses_exact_native_schemas_and_thinking_profile(self) -> None:
        case = load_behavioral_eval_manifest().case("DO-02")
        bindings = tuple(
            DeepSeekToolBinding(
                runtime_tool=definition.action_tool,
                provider_parameters=definition.parameters,
            )
            for definition in case.tools
        )
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_model_profile(),
            tool_bindings=bindings,
        )

        request = adapter.encode_request(_prepared_turn(case, bindings))

        self.assertEqual("https://api.deepseek.com/chat/completions", request.endpoint)
        self.assertEqual("deepseek-v4-flash", request.payload["model"])
        self.assertEqual({"type": "enabled"}, request.payload["thinking"])
        self.assertEqual("high", request.payload["reasoning_effort"])
        self.assertEqual(384_000, request.payload["max_tokens"])
        self.assertEqual("required", request.payload["tool_choice"])
        self.assertIs(request.payload["stream"], False)
        for omitted in ("temperature", "top_p", "presence_penalty", "frequency_penalty"):
            self.assertNotIn(omitted, request.payload)

        provider_tools = {
            item["function"]["name"]: item["function"]
            for item in request.payload["tools"]
        }
        self.assertEqual(
            json.loads(canonical_json_bytes(case.tools[1].parameters)),
            provider_tools["write_file"]["parameters"],
        )
        self.assertNotIn("strict", provider_tools["write_file"])
        self.assertEqual(
            {"complete", "abstain", "create_directory", "write_file"},
            set(provider_tools),
        )
        self.assertNotIn("input", json.dumps(provider_tools["write_file"]))

    def test_reasoning_and_native_call_result_history_round_trip_separately(self) -> None:
        case = load_behavioral_eval_manifest().case("DO-02")
        bindings = _bindings(case)
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_model_profile(),
            tool_bindings=bindings,
        )
        first = adapter.encode_request(_prepared_turn(case, bindings))
        response = RetainedDeepSeekResponse(
            status_code=200,
            body=json.dumps(
                {
                    "id": "resp-1",
                    "model": "deepseek-v4-flash",
                    "system_fingerprint": "fp-1",
                    "choices": [
                        {
                            "finish_reason": "tool_calls",
                            "message": {
                                "role": "assistant",
                                "content": "",
                                "reasoning_content": "The directory must exist first.",
                                "tool_calls": [
                                    {
                                        "id": "call-1",
                                        "type": "function",
                                        "function": {
                                            "name": "create_directory",
                                            "arguments": '{"path":"reports"}',
                                        },
                                    }
                                ],
                            },
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 100,
                        "completion_tokens": 20,
                        "total_tokens": 120,
                    },
                },
                sort_keys=True,
            ).encode(),
            duration_ms=17,
        )

        decoded = adapter.decode_response(first, response)

        self.assertIsInstance(decoded, ExchangeSettled)
        assert isinstance(decoded, ExchangeSettled)
        self.assertIsInstance(decoded.candidate, CandidateToolCall)
        assert isinstance(decoded.candidate, CandidateToolCall)
        self.assertEqual(
            {"input": '{"path":"reports"}'},
            dict(decoded.candidate.arguments),
        )
        self.assertNotIn("reasoning", decoded.candidate.arguments)
        self.assertEqual(
            "The directory must exist first.",
            decoded.candidate.reasoning,
        )
        self.assertEqual(100, decoded.evidence.usage.input_tokens)
        self.assertEqual("deepseek-v4-flash", decoded.evidence.returned_model)
        self.assertEqual("fp-1", decoded.evidence.system_fingerprint)

        conversation = CanonicalConversation(
            (
                UserMessage(case.model_prompt),
                AssistantToolCall(
                    call=CanonicalToolCall(
                        call_id=decoded.candidate.call_id,
                        tool_name=decoded.candidate.tool_name,
                        arguments=decoded.candidate.arguments,
                    ),
                    reasoning=decoded.candidate.reasoning,
                ),
                ToolResultMessage(
                    call_id=decoded.candidate.call_id,
                    tool_name=decoded.candidate.tool_name,
                    content='{"created":"reports"}',
                ),
            )
        )
        second = adapter.encode_request(_prepared_turn(case, bindings, conversation))
        messages = second.payload["messages"]
        assistant = messages[-2]
        tool_result = messages[-1]
        self.assertEqual("assistant", assistant["role"])
        self.assertEqual(
            "The directory must exist first.", assistant["reasoning_content"]
        )
        self.assertEqual(
            {"path": "reports"},
            json.loads(assistant["tool_calls"][0]["function"]["arguments"]),
        )
        self.assertEqual("tool", tool_result["role"])
        self.assertEqual("call-1", tool_result["tool_call_id"])

    def test_terminal_mapping_and_malformed_actions_fail_closed(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-02")
        bindings = _bindings(case)
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_model_profile(),
            tool_bindings=bindings,
        )
        request = adapter.encode_request(_prepared_turn(case, bindings))

        completed = adapter.decode_response(
            request,
            _response("complete", {"output": "done"}, call_id="terminal-1"),
        )
        self.assertIsInstance(completed, ExchangeSettled)
        assert isinstance(completed, ExchangeSettled)
        self.assertEqual(
            FinalDisposition.COMPLETED,
            completed.candidate.disposition,
        )

        abstained = adapter.decode_response(
            request,
            _response(
                "abstain",
                {"reason_code": "insufficient_evidence", "output": "ambiguous"},
                call_id="terminal-2",
            ),
        )
        self.assertIsInstance(abstained, ExchangeSettled)
        assert isinstance(abstained, ExchangeSettled)
        self.assertIsInstance(abstained.candidate, CandidateFinal)
        assert isinstance(abstained.candidate, CandidateFinal)
        self.assertEqual(FinalDisposition.ABSTAINED, abstained.candidate.disposition)
        self.assertEqual("insufficient_evidence", abstained.candidate.reason_code)

        invalid_responses = (
            _response("unknown", {}, call_id="bad-unknown"),
            _response(
                "abstain",
                {"reason_code": "made_up", "output": "no"},
                call_id="bad-reason",
            ),
            _response(
                case.tools[0].name,
                {},
                call_id="bad-length",
                finish_reason="length",
            ),
            _response(case.tools[0].name, {}, call_id="bad-reused"),
        )
        reused_request = adapter.encode_request(
            _prepared_turn(
                case,
                bindings,
                CanonicalConversation(
                    (
                        UserMessage(case.model_prompt),
                        AssistantToolCall(
                            call=CanonicalToolCall(
                                call_id="bad-reused",
                                tool_name=case.tools[0].name,
                                arguments={"input": "{}"},
                            ),
                            reasoning="inspect",
                        ),
                        ToolResultMessage(
                            call_id="bad-reused",
                            tool_name=case.tools[0].name,
                            content="{}",
                        ),
                    )
                ),
            )
        )
        for index, response in enumerate(invalid_responses):
            selected_request = reused_request if index == 3 else request
            with self.subTest(index=index):
                self.assertIsInstance(
                    adapter.decode_response(selected_request, response),
                    ExchangeFailed,
                )

    def test_multiple_calls_missing_reasoning_and_context_overflow_fail_closed(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-02")
        bindings = _bindings(case)
        adapter = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_model_profile(),
            tool_bindings=bindings,
        )
        request = adapter.encode_request(_prepared_turn(case, bindings))
        multiple_document = json.loads(
            _response(case.tools[0].name, {}, call_id="call-a").body
        )
        multiple_document["choices"][0]["message"]["tool_calls"].append(
            multiple_document["choices"][0]["message"]["tool_calls"][0]
        )
        missing_reasoning_document = json.loads(
            _response(case.tools[0].name, {}, call_id="call-b").body
        )
        del missing_reasoning_document["choices"][0]["message"]["reasoning_content"]

        multiple = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(
                status_code=200,
                body=json.dumps(multiple_document).encode(),
            ),
        )
        missing_reasoning = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(
                status_code=200,
                body=json.dumps(missing_reasoning_document).encode(),
            ),
        )
        overflow = adapter.decode_response(
            request,
            RetainedDeepSeekResponse(
                status_code=400,
                body=b'{"error":{"message":"Maximum context length exceeded"}}',
            ),
        )

        self.assertIsInstance(multiple, ExchangeFailed)
        self.assertEqual("action_count_invalid", multiple.failure.code)
        self.assertIsInstance(missing_reasoning, ExchangeFailed)
        self.assertEqual("reasoning_content_missing", missing_reasoning.failure.code)
        self.assertIsInstance(overflow, ExchangeFailed)
        self.assertEqual(ProviderFailureKind.CONTEXT_OVERFLOW, overflow.failure.kind)
        self.assertEqual("context_overflow", overflow.failure.code)

    def test_malformed_gateway_response_executes_no_tool_effect(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = _bindings(case)
        malformed_document = json.loads(
            _response("inspect_status", {}, call_id="bad-first").body
        )
        del malformed_document["choices"][0]["message"]["reasoning_content"]
        gateway = DeepSeekModelGateway(
            adapter=DeepSeekLiveTranslationAdapter(
                profile=locked_deepseek_model_profile(),
                tool_bindings=bindings,
            ),
            transport=_QueueTransport(
                (
                    RetainedDeepSeekResponse(
                        status_code=200,
                        body=json.dumps(malformed_document).encode(),
                    ),
                )
            ),
        )
        with tempfile.TemporaryDirectory() as directory:
            report = BehavioralEvalCampaign(
                manifest=load_behavioral_eval_manifest(),
                artifacts_root=Path(directory),
                gateway_factory=lambda selected: gateway,
            ).run(case_ids=("SA-01",))

        self.assertEqual((), report.cases[0].tool_sequence)

    def test_gateway_runs_public_agent_loop_and_reasoning_never_enters_views(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = _bindings(case)
        transport = _QueueTransport(
            (
                _response("inspect_status", {}, call_id="sa-call-1"),
                _response("complete", {"output": "ready"}, call_id="sa-final-1"),
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            gateway = DeepSeekModelGateway(
                adapter=DeepSeekLiveTranslationAdapter(
                    profile=locked_deepseek_model_profile(),
                    tool_bindings=bindings,
                ),
                transport=transport,
                exchange_store=FileDeepSeekExchangeStore(root / "raw-exchanges"),
            )
            report = BehavioralEvalCampaign(
                manifest=load_behavioral_eval_manifest(),
                artifacts_root=root / "campaign",
                gateway_factory=lambda selected: gateway,
            ).run(case_ids=("SA-01",))

            self.assertEqual(EvaluatorVerdict.PASSED, report.cases[0].evaluator_verdict)
            self.assertEqual(2, len(transport.requests))
            second_messages = transport.requests[1].payload["messages"]
            assistant = next(
                message for message in second_messages if message["role"] == "assistant"
            )
            self.assertEqual("restricted reasoning", assistant["reasoning_content"])
            log_path = root / "campaign" / report.cases[0].event_log_ref
            raw_log = log_path.read_text(encoding="utf-8")
            self.assertNotIn("restricted reasoning", raw_log)
            for view in RunEventView:
                self.assertNotIn(
                    "restricted reasoning",
                    render_run_events(
                        load_run_event_log(log_path),
                        view=view,
                    ),
                )
            retained = sorted((root / "raw-exchanges").glob("exchange-*"))
            self.assertEqual(2, len(retained))
            self.assertEqual(
                canonical_json_bytes(transport.requests[0].payload),
                (retained[0] / "request.body").read_bytes(),
            )
            self.assertEqual(
                transport.responses[0].body,
                (retained[0] / "response.body").read_bytes(),
            )

    def test_http_transport_retains_exact_body_without_exposing_credential(self) -> None:
        case = load_behavioral_eval_manifest().case("SA-03")
        bindings = _bindings(case)
        request = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_model_profile(),
            tool_bindings=bindings,
        ).encode_request(_prepared_turn(case, bindings))
        body = _response("inspect_authority", {}, call_id="authority-1").body
        opener = _FakeUrlOpen(body)
        credential = "stage-b-only-secret"
        response = DeepSeekHttpTransport(
            api_key=credential,
            urlopen=opener,
        ).send(request, Event())

        self.assertEqual(body, response.body)
        self.assertEqual(1, opener.calls)
        self.assertEqual(
            f"Bearer {credential}",
            opener.request.get_header("Authorization"),
        )
        self.assertNotIn(
            credential,
            json.dumps(request.secret_free_material(), default=str),
        )
        self.assertNotIn(credential.encode(), response.body)


class _QueueTransport:
    def __init__(self, responses: tuple[RetainedDeepSeekResponse, ...]) -> None:
        self.responses = responses
        self.requests = []

    def send(self, request, cancel_signal: Event) -> RetainedDeepSeekResponse:
        self.requests.append(request)
        return self.responses[len(self.requests) - 1]


class _FakeHttpResponse:
    status = 200

    def __init__(self, body: bytes) -> None:
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self) -> bytes:
        return self._body


class _FakeUrlOpen:
    def __init__(self, body: bytes) -> None:
        self._body = body
        self.calls = 0
        self.request = None

    def __call__(self, request, *, timeout):
        self.calls += 1
        self.request = request
        return _FakeHttpResponse(self._body)


def _bindings(case) -> tuple[DeepSeekToolBinding, ...]:
    return tuple(
        DeepSeekToolBinding(
            runtime_tool=definition.action_tool,
            provider_parameters=definition.parameters,
        )
        for definition in case.tools
    )


def _response(
    tool_name: str,
    arguments: dict[str, object],
    *,
    call_id: str,
    finish_reason: str = "tool_calls",
) -> RetainedDeepSeekResponse:
    return RetainedDeepSeekResponse(
        status_code=200,
        body=json.dumps(
            {
                "id": f"response-{call_id}",
                "model": "deepseek-v4-flash",
                "system_fingerprint": "fp-test",
                "choices": [
                    {
                        "finish_reason": finish_reason,
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "reasoning_content": "restricted reasoning",
                            "tool_calls": [
                                {
                                    "id": call_id,
                                    "type": "function",
                                    "function": {
                                        "name": tool_name,
                                        "arguments": json.dumps(arguments, sort_keys=True),
                                    },
                                }
                            ],
                        },
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
            sort_keys=True,
        ).encode(),
        duration_ms=1,
    )


def _prepared_turn(
    case,
    bindings: tuple[DeepSeekToolBinding, ...],
    conversation: CanonicalConversation | None = None,
) -> PreparedModelTurn:
    conversation = conversation or CanonicalConversation((UserMessage(case.model_prompt),))
    context = ModelContext(
        conversation=conversation,
        summary=None,
        source_history_identity=conversation.identity,
        system_policy_identity=case.system_policy_identity,
        tool_set_identity="test-tool-set",
        context_policy_identity="test-context-policy",
        input_estimate_tokens=1,
        estimator_identity="test-estimator",
        estimator_source="test",
        estimator_confidence="high",
        context_window_tokens=1_000_000,
        context_window_provenance="verified",
        context_window_source="DeepSeek official model page observed 2026-08-28",
        context_window_confidence="high",
    )
    return PreparedModelTurn(
        run_id="run-test",
        turn_id="run-test:turn:1",
        model_context=context,
        tools=tuple(binding.runtime_tool for binding in bindings),
    )


if __name__ == "__main__":
    unittest.main()
