from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path
from typing import Mapping, cast

from workspace_agent_harness.deepseek_translation import (
    PROMPT_VERSION,
    DeepSeekTranslationAdapter,
    diagnostic_system_prompt,
)
from workspace_agent_harness.translation import (
    AssistantFinalMessage,
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    FailureStage,
    HistoryCarrier,
    ModelProfile,
    ProviderControlledOutput,
    ProviderRequest,
    ReasoningCarrier,
    RetainedProviderResponse,
    ToolResultMessage,
    TranslationConfig,
    TranslationRejected,
    UserMessage,
    bash_finish_tools,
    run_translation_turn,
)
from workspace_agent_harness.translation_diagnostics import (
    TranslationDiagnosticPlan,
    build_translation_dry_run,
)


FIXTURES = Path(__file__).parent / "fixtures" / "translation"


class FixtureTransport:
    def __init__(self, fixture_name: str) -> None:
        self._fixture_name = fixture_name
        self.requests: list[ProviderRequest] = []

    def send(self, request: ProviderRequest) -> RetainedProviderResponse:
        self.requests.append(request)
        return _retained(self._fixture_name)


class TranslationAdapterContractTest(unittest.TestCase):
    def test_native_history_round_trips_correlation_through_next_turn(self) -> None:
        conversation = _conversation_fixture("valid-multiturn.conversation.json")
        adapter = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
            max_output_tokens=16_384,
        )
        request = adapter.encode_request(conversation, bash_finish_tools())
        messages = cast(list[object], request.payload["messages"])
        expected = _read_json("valid-native-history.request-messages.json")

        self.assertEqual(expected, messages[1:])
        self.assertEqual(16_384, request.payload["max_tokens"])
        self.assertNotIn("Observation from", json.dumps(messages, ensure_ascii=False))
        self.assertEqual(("call_fixture_1",), request.historical_call_ids)

        transport = FixtureTransport("clean-command-only.response.json")
        attempt = run_translation_turn(
            adapter=adapter,
            transport=transport,
            conversation=conversation,
            tools=bash_finish_tools(),
        )

        self.assertTrue(attempt.outcome.succeeded)
        self.assertEqual(1, len(transport.requests))
        action = attempt.outcome.message
        self.assertIsInstance(action, AssistantToolCall)
        assert isinstance(action, AssistantToolCall)
        self.assertEqual("call_fixture_2", action.call.call_id)
        self.assertEqual("bash", action.call.tool_name)
        self.assertEqual(
            {"command": "git status --short"},
            dict(action.call.arguments),
        )
        self.assertIsNone(action.reasoning)
        next_conversation = attempt.outcome.next_conversation
        assert next_conversation is not None
        with_result = next_conversation.append(
            ToolResultMessage(
                call_id=action.call.call_id,
                tool_name=action.call.tool_name,
                content=" M workspace_agent_harness/translation.py\n",
            )
        )
        next_request = adapter.encode_request(with_result, bash_finish_tools())
        next_messages = cast(list[dict[str, object]], next_request.payload["messages"])
        self.assertEqual("assistant", next_messages[-2]["role"])
        self.assertEqual("call_fixture_2", _native_call_id(next_messages[-2]))
        self.assertEqual("tool", next_messages[-1]["role"])
        self.assertEqual("call_fixture_2", next_messages[-1]["tool_call_id"])

    def test_reasoning_is_separate_and_both_diagnostic_carriers_are_reproducible(self) -> None:
        conversation = _conversation_fixture("valid-multiturn.conversation.json")
        native_thought = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.THOUGHT_IN_ARGUMENTS,
        )
        native_request = native_thought.encode_request(
            conversation,
            bash_finish_tools(),
        )
        native_messages = cast(
            list[dict[str, object]],
            native_request.payload["messages"],
        )
        history_arguments = json.loads(_native_arguments(native_messages[2]))
        self.assertEqual(
            {
                "command": "pwd",
                "thought": "Inspect the working directory first.",
            },
            history_arguments,
        )
        self.assertEqual(
            {"command": "pwd"},
            dict(cast(AssistantToolCall, conversation.messages[1]).call.arguments),
        )

        outcome = native_thought.decode_response(
            native_request,
            _retained("clean-thought.response.json"),
        )
        action = outcome.message
        self.assertIsInstance(action, AssistantToolCall)
        assert isinstance(action, AssistantToolCall)
        self.assertEqual("Inspect the current changes.", action.reasoning)
        self.assertEqual(
            {"command": "git status --short"},
            dict(action.call.arguments),
        )

        legacy_thought = _adapter(
            HistoryCarrier.LEGACY_JSON_TEXT,
            ReasoningCarrier.THOUGHT_IN_ARGUMENTS,
        )
        legacy_messages = cast(
            list[dict[str, object]],
            legacy_thought.encode_request(
                conversation,
                bash_finish_tools(),
            ).payload["messages"],
        )
        legacy_action = json.loads(cast(str, legacy_messages[2]["content"]))
        self.assertEqual("Inspect the working directory first.", legacy_action["thought"])
        self.assertEqual({"command": "pwd"}, legacy_action["arguments"])
        self.assertEqual("user", legacy_messages[3]["role"])
        self.assertIn("Observation from bash", legacy_messages[3]["content"])

        command_only = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
        )
        command_request = command_only.encode_request(
            conversation,
            bash_finish_tools(),
        )
        for provider_tool in cast(list[dict[str, object]], command_request.payload["tools"]):
            function = cast(dict[str, object], provider_tool["function"])
            parameters = cast(dict[str, object], function["parameters"])
            properties = cast(dict[str, object], parameters["properties"])
            self.assertNotIn("thought", properties)
            self.assertNotIn("thought", cast(list[str], parameters["required"]))
        rejected = command_only.decode_response(
            command_request,
            _retained("clean-thought.response.json"),
        )
        assert rejected.failure is not None
        self.assertEqual("thought_not_allowed", rejected.failure.code)

    def test_model_profile_is_the_only_translated_output_limit_source(self) -> None:
        conversation = _conversation_fixture("valid-multiturn.conversation.json")
        explicit = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
            max_output_tokens=8_192,
        )
        explicit_request = explicit.encode_request(conversation, bash_finish_tools())
        self.assertEqual(8_192, explicit_request.payload["max_tokens"])

        provider_controlled = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
            max_output_tokens=ProviderControlledOutput("fixture-provider-default"),
        )
        provider_request = provider_controlled.encode_request(
            conversation,
            bash_finish_tools(),
        )
        self.assertNotIn("max_tokens", provider_request.payload)
        self.assertNotIn("2048", json.dumps(dict(provider_request.payload)))
        self.assertNotEqual(
            explicit.config.model_profile.identity,
            provider_controlled.config.model_profile.identity,
        )
        self.assertEqual(
            {"mode": "provider-controlled", "reason": "fixture-provider-default"},
            provider_controlled.config.model_profile.identity_material()[
                "max_output_tokens"
            ],
        )
        with self.assertRaisesRegex(ValueError, "max_output_tokens"):
            ModelProfile(
                provider="DeepSeek",
                model="deepseek-v4-flash",
                endpoint="https://api.deepseek.com/beta/chat/completions",
                max_output_tokens=None,  # type: ignore[arg-type]
                temperature=0,
                thinking="disabled",
            )

    def test_retained_negative_fixtures_fail_closed_with_attributable_codes(self) -> None:
        adapter = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
        )
        request = adapter.encode_request(
            _conversation_fixture("valid-multiturn.conversation.json"),
            bash_finish_tools(),
        )
        expected = {
            "dsml-runaway.response.json": (
                "length_terminated",
                FailureStage.RESPONSE_ENVELOPE,
            ),
            "malformed-arguments.response.json": (
                "invalid_arguments_json",
                FailureStage.RESPONSE_ACTION,
            ),
            "missing-id.response.json": (
                "tool_call_id_missing",
                FailureStage.CORRELATION,
            ),
            "duplicate-ids.response.json": (
                "tool_call_id_duplicate",
                FailureStage.CORRELATION,
            ),
            "multi-call.response.json": (
                "multiple_tool_calls",
                FailureStage.RESPONSE_ACTION,
            ),
            "schema-invalid.response.json": (
                "action_arguments_schema",
                FailureStage.RESPONSE_ACTION,
            ),
        }
        for fixture_name, (code, stage) in expected.items():
            with self.subTest(fixture=fixture_name):
                response = _retained(fixture_name)
                outcome = adapter.decode_response(request, response)
                self.assertFalse(outcome.succeeded)
                self.assertIsNone(outcome.message)
                self.assertIsNone(outcome.next_conversation)
                assert outcome.failure is not None
                self.assertEqual(code, outcome.failure.code)
                self.assertIs(stage, outcome.failure.stage)
                self.assertTrue(outcome.failure.repair_eligible)
                self.assertEqual(response.sha256, outcome.failure.response_sha256)

    def test_orphan_history_and_reused_response_id_stop_before_transport_or_tool(self) -> None:
        adapter = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
        )
        transport = FixtureTransport("clean-command-only.response.json")
        with self.assertRaises(TranslationRejected) as raised:
            run_translation_turn(
                adapter=adapter,
                transport=transport,
                conversation=_conversation_fixture(
                    "orphan-tool-result.conversation.json"
                ),
                tools=bash_finish_tools(),
            )
        self.assertEqual("orphan_tool_result", raised.exception.failure.code)
        self.assertEqual([], transport.requests)

        conversation = _conversation_fixture("valid-multiturn.conversation.json")
        request = adapter.encode_request(conversation, bash_finish_tools())
        response = cast(dict[str, object], _read_json("clean-command-only.response.json"))
        choices = cast(list[dict[str, object]], response["choices"])
        message = cast(dict[str, object], choices[0]["message"])
        calls = cast(list[dict[str, object]], message["tool_calls"])
        calls[0]["id"] = "call_fixture_1"
        outcome = adapter.decode_response(
            request,
            RetainedProviderResponse(
                status_code=200,
                body=json.dumps(response, sort_keys=True).encode("utf-8"),
            ),
        )
        assert outcome.failure is not None
        self.assertEqual("tool_call_id_reused", outcome.failure.code)
        self.assertIs(FailureStage.CORRELATION, outcome.failure.stage)

    def test_finish_tool_decodes_to_canonical_final_message(self) -> None:
        adapter = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
        )
        conversation = _conversation_fixture("valid-multiturn.conversation.json")
        request = adapter.encode_request(conversation, bash_finish_tools())
        response = cast(dict[str, object], _read_json("clean-command-only.response.json"))
        choices = cast(list[dict[str, object]], response["choices"])
        message = cast(dict[str, object], choices[0]["message"])
        calls = cast(list[dict[str, object]], message["tool_calls"])
        function = cast(dict[str, object], calls[0]["function"])
        function["name"] = "finish"
        function["arguments"] = '{"output":"patch ready"}'
        outcome = adapter.decode_response(
            request,
            RetainedProviderResponse(
                status_code=200,
                body=json.dumps(response, sort_keys=True).encode("utf-8"),
            ),
        )
        self.assertIsInstance(outcome.message, AssistantFinalMessage)
        assert isinstance(outcome.message, AssistantFinalMessage)
        self.assertEqual("patch ready", outcome.message.content)
        self.assertEqual(conversation.messages, outcome.next_conversation.messages[:-1])  # type: ignore[union-attr]

    def test_mutated_provider_request_is_rejected_before_action_decode(self) -> None:
        adapter = _adapter(
            HistoryCarrier.NATIVE_TOOL_CALLS,
            ReasoningCarrier.COMMAND_ONLY,
        )
        request = adapter.encode_request(
            _conversation_fixture("valid-multiturn.conversation.json"),
            bash_finish_tools(),
        )
        messages = cast(list[dict[str, object]], request.payload["messages"])
        messages[1]["content"] = "tampered after identity"
        self.assertFalse(request.payload_is_intact)
        with self.assertRaises(TranslationRejected) as raised:
            adapter.decode_response(
                request,
                _retained("clean-command-only.response.json"),
            )
        self.assertEqual("request_payload_mutated", raised.exception.failure.code)

    def test_dry_run_is_exact_deterministic_four_cell_enumeration(self) -> None:
        plan = TranslationDiagnosticPlan(
            model_profile=_profile(
                ProviderControlledOutput(
                    "dry-run-only; live plan must freeze an explicit ceiling"
                )
            ),
            conversation=_conversation_fixture("valid-multiturn.conversation.json"),
            tools=bash_finish_tools(),
            repetitions=5,
        )
        first = build_translation_dry_run(plan)
        second = build_translation_dry_run(plan)

        self.assertEqual(first, second)
        self.assertEqual(0, first["live_calls"])
        self.assertIsNone(first["causal_result"])
        cells = cast(list[dict[str, object]], first["cells"])
        self.assertEqual(
            [
                "legacy-json-text__thought-in-arguments",
                "legacy-json-text__command-only",
                "native-tool-calls__thought-in-arguments",
                "native-tool-calls__command-only",
            ],
            [cell["cell_id"] for cell in cells],
        )
        for fixed_field in (
            "model_profile_id",
            "context_id",
            "tool_set_id",
            "repetition_plan_id",
        ):
            self.assertEqual(1, len({cell[fixed_field] for cell in cells}))
        self.assertEqual(4, len({cell["translation_config_id"] for cell in cells}))
        self.assertEqual(4, len({cell["request_payload_sha256"] for cell in cells}))

    def test_fixture_manifest_is_secret_free_and_source_hash_is_checkable(self) -> None:
        manifest = cast(dict[str, object], _read_json("manifest.json"))
        fixtures = cast(dict[str, dict[str, object]], manifest["fixtures"])
        self.assertEqual(
            {
                path.name
                for path in FIXTURES.iterdir()
                if path.name != "manifest.json"
            },
            set(fixtures),
        )
        for fixture_name in fixtures:
            body = (FIXTURES / fixture_name).read_bytes()
            json.loads(body.decode("utf-8"))
            self.assertEqual(
                fixtures[fixture_name]["fixture_sha256"],
                "sha256:" + hashlib.sha256(body).hexdigest(),
            )
            self.assertNotIn(b"Bearer ", body)
            self.assertNotIn(b"DEEPSEEK_API_KEY", body)
        dsml = fixtures["dsml-runaway.response.json"]
        self.assertEqual(
            "sha256:c99c37f5537a652a915c891efecfffd29c6a9679a1ab8efd581a027a638a97ad",
            dsml["source_response_sha256"],
        )
        source = Path(__file__).parents[1] / cast(str, dsml["source_artifact"])
        if source.is_file():
            self.assertEqual(
                dsml["source_response_sha256"],
                "sha256:" + hashlib.sha256(source.read_bytes()).hexdigest(),
            )


def _adapter(
    history: HistoryCarrier,
    reasoning: ReasoningCarrier,
    *,
    max_output_tokens: int | ProviderControlledOutput = 4_096,
) -> DeepSeekTranslationAdapter:
    return DeepSeekTranslationAdapter(
        TranslationConfig(
            model_profile=_profile(max_output_tokens),
            history_carrier=history,
            reasoning_carrier=reasoning,
            system_prompt=diagnostic_system_prompt(reasoning),
            prompt_version=PROMPT_VERSION,
        )
    )


def _profile(
    max_output_tokens: int | ProviderControlledOutput,
) -> ModelProfile:
    return ModelProfile(
        provider="DeepSeek",
        model="deepseek-v4-flash",
        endpoint="https://api.deepseek.com/beta/chat/completions",
        max_output_tokens=max_output_tokens,
        temperature=0,
        thinking="disabled",
    )


def _read_json(name: str) -> object:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _retained(name: str) -> RetainedProviderResponse:
    return RetainedProviderResponse(status_code=200, body=(FIXTURES / name).read_bytes())


def _conversation_fixture(name: str) -> CanonicalConversation:
    value = cast(dict[str, object], _read_json(name))
    messages: list[UserMessage | AssistantToolCall | ToolResultMessage] = []
    for raw_message in cast(list[dict[str, object]], value["messages"]):
        message_type = raw_message["type"]
        if message_type == "user":
            messages.append(UserMessage(cast(str, raw_message["content"])))
        elif message_type == "assistant_tool_call":
            messages.append(
                AssistantToolCall(
                    call=CanonicalToolCall(
                        call_id=cast(str, raw_message["call_id"]),
                        tool_name=cast(str, raw_message["tool_name"]),
                        arguments=cast(Mapping[str, object], raw_message["arguments"]),
                    ),
                    reasoning=cast(str | None, raw_message.get("reasoning")),
                )
            )
        elif message_type == "tool_result":
            messages.append(
                ToolResultMessage(
                    call_id=cast(str, raw_message["call_id"]),
                    tool_name=cast(str, raw_message["tool_name"]),
                    content=cast(str, raw_message["content"]),
                    is_error=cast(bool, raw_message.get("is_error", False)),
                )
            )
        else:
            raise AssertionError(f"unknown canonical fixture message: {message_type}")
    return CanonicalConversation(tuple(messages))


def _native_call_id(message: dict[str, object]) -> str:
    calls = cast(list[dict[str, object]], message["tool_calls"])
    return cast(str, calls[0]["id"])


def _native_arguments(message: dict[str, object]) -> str:
    calls = cast(list[dict[str, object]], message["tool_calls"])
    function = cast(dict[str, object], calls[0]["function"])
    return cast(str, function["arguments"])


if __name__ == "__main__":
    unittest.main()
