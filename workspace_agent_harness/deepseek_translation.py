from __future__ import annotations

import json
from typing import Mapping, cast

from .translation import (
    ActionTool,
    AssistantFinalMessage,
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    FailureStage,
    HistoryCarrier,
    ProviderControlledOutput,
    ProviderRequest,
    ReasoningCarrier,
    RetainedProviderResponse,
    ToolResultMessage,
    TranslationConfig,
    TranslationFailure,
    TranslationOutcome,
    TranslationRejected,
    UserMessage,
    canonical_json_bytes,
    provider_metadata,
)


PROMPT_VERSION = "deepseek-native-translation-v1"


def diagnostic_system_prompt(reasoning_carrier: ReasoningCarrier) -> str:
    base = (
        "You operate an isolated software repository through the provided tools. "
        "Select exactly one function and return no prose. Use bash to act or finish "
        "when the repository patch is ready."
    )
    if reasoning_carrier is ReasoningCarrier.COMMAND_ONLY:
        return (
            f"{base} Do not add thought, analysis, rationale, or planning fields to "
            "tool arguments."
        )
    return (
        f"{base} Include one non-empty thought string of at most 1000 characters "
        "inside the selected function arguments for this diagnostic condition."
    )


class DeepSeekTranslationAdapter:
    """Translate typed canonical history to DeepSeek Chat Completions tool calls."""

    def __init__(self, config: TranslationConfig) -> None:
        profile = config.model_profile
        if profile.provider.casefold() != "deepseek":
            raise ValueError("DeepSeek adapter requires a DeepSeek ModelProfile")
        if not profile.endpoint.endswith("/chat/completions"):
            raise ValueError("DeepSeek endpoint must target chat/completions")
        self._config = config

    @property
    def config(self) -> TranslationConfig:
        return self._config

    def encode_request(
        self,
        conversation: CanonicalConversation,
        tools: tuple[ActionTool, ...],
    ) -> ProviderRequest:
        tool_map = _tool_map(tools)
        historical_call_ids = _validate_conversation(
            conversation,
            tool_map=tool_map,
            config=self._config,
        )
        messages: list[dict[str, object]] = [
            {"role": "system", "content": self._config.system_prompt}
        ]
        for message in conversation.messages:
            if isinstance(message, UserMessage):
                messages.append({"role": "user", "content": message.content})
            elif isinstance(message, AssistantToolCall):
                messages.append(self._assistant_history_message(message))
            elif isinstance(message, ToolResultMessage):
                messages.append(self._tool_result_history_message(message))
            else:
                raise AssertionError("terminal final history was not rejected")

        profile = self._config.model_profile
        payload: dict[str, object] = {
            "model": profile.model,
            "messages": messages,
            "thinking": {"type": profile.thinking},
            "temperature": profile.temperature,
            "stream": False,
            "tools": [self._provider_tool(tool) for tool in tools],
            "tool_choice": "required",
        }
        if isinstance(profile.max_output_tokens, int):
            payload["max_tokens"] = profile.max_output_tokens
        elif not isinstance(profile.max_output_tokens, ProviderControlledOutput):
            raise AssertionError("ModelProfile rejected an unknown output-limit state")

        return ProviderRequest(
            endpoint=profile.endpoint,
            payload=payload,
            model_profile_id=profile.identity,
            translation_config_id=self._config.identity,
            conversation_id=conversation.identity,
            conversation=conversation,
            tools=tools,
            historical_call_ids=historical_call_ids,
        )

    def decode_response(
        self,
        request: ProviderRequest,
        response: RetainedProviderResponse,
    ) -> TranslationOutcome:
        if request.model_profile_id != self._config.model_profile.identity:
            raise TranslationRejected(
                _request_failure("model_profile_identity_mismatch")
            )
        if request.translation_config_id != self._config.identity:
            raise TranslationRejected(
                _request_failure("translation_config_identity_mismatch")
            )
        if not request.payload_is_intact:
            raise TranslationRejected(_request_failure("request_payload_mutated"))
        response_sha256 = response.sha256
        if not 200 <= response.status_code < 300:
            return _failed_response(
                response_sha256,
                code="provider_http_status",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=False,
                details=(("http_status", str(response.status_code)),),
            )
        try:
            decoded = json.loads(response.body.decode("utf-8"))
        except UnicodeDecodeError:
            return _failed_response(
                response_sha256,
                code="response_not_utf8",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=False,
            )
        except json.JSONDecodeError:
            return _failed_response(
                response_sha256,
                code="response_not_json",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=False,
            )
        if not isinstance(decoded, dict):
            return _failed_response(
                response_sha256,
                code="response_not_object",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=False,
            )
        envelope = cast(dict[str, object], decoded)
        choices = envelope.get("choices")
        if not isinstance(choices, list) or len(choices) != 1:
            return _failed_response(
                response_sha256,
                code="response_choices_invalid",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=True,
            )
        choice = choices[0]
        if not isinstance(choice, dict):
            return _failed_response(
                response_sha256,
                code="response_choice_not_object",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=True,
            )
        finish_reason = choice.get("finish_reason")
        normalized_finish_reason = (
            finish_reason if isinstance(finish_reason, str) else None
        )
        if normalized_finish_reason == "length":
            return _failed_response(
                response_sha256,
                code="length_terminated",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        if normalized_finish_reason != "tool_calls":
            return _failed_response(
                response_sha256,
                code="finish_reason_invalid",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        message = choice.get("message")
        if not isinstance(message, dict):
            return _failed_response(
                response_sha256,
                code="response_message_missing",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        if message.get("role") != "assistant":
            return _failed_response(
                response_sha256,
                code="response_message_role_invalid",
                stage=FailureStage.RESPONSE_ENVELOPE,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        tool_calls = message.get("tool_calls")
        if not isinstance(tool_calls, list):
            return _failed_response(
                response_sha256,
                code="tool_calls_missing",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )

        call_ids: list[str] = []
        for raw_call in tool_calls:
            if not isinstance(raw_call, dict):
                return _failed_response(
                    response_sha256,
                    code="tool_call_not_object",
                    stage=FailureStage.RESPONSE_ACTION,
                    repair_eligible=True,
                    finish_reason=normalized_finish_reason,
                )
            call_id = raw_call.get("id")
            if not isinstance(call_id, str) or not call_id:
                return _failed_response(
                    response_sha256,
                    code="tool_call_id_missing",
                    stage=FailureStage.CORRELATION,
                    repair_eligible=True,
                    finish_reason=normalized_finish_reason,
                )
            call_ids.append(call_id)
        if len(set(call_ids)) != len(call_ids):
            return _failed_response(
                response_sha256,
                code="tool_call_id_duplicate",
                stage=FailureStage.CORRELATION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        if any(call_id in request.historical_call_ids for call_id in call_ids):
            return _failed_response(
                response_sha256,
                code="tool_call_id_reused",
                stage=FailureStage.CORRELATION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        if len(tool_calls) != self._config.max_actions_per_turn:
            return _failed_response(
                response_sha256,
                code="multiple_tool_calls",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
                details=(("tool_call_count", str(len(tool_calls))),),
            )

        raw_call = cast(dict[str, object], tool_calls[0])
        if raw_call.get("type") != "function":
            return _failed_response(
                response_sha256,
                code="tool_call_type_invalid",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        function = raw_call.get("function")
        if not isinstance(function, dict):
            return _failed_response(
                response_sha256,
                code="tool_function_missing",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        name = function.get("name")
        if not isinstance(name, str) or name not in {tool.name for tool in request.tools}:
            return _failed_response(
                response_sha256,
                code="action_tool_unknown",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        raw_arguments = function.get("arguments")
        if not isinstance(raw_arguments, str):
            return _failed_response(
                response_sha256,
                code="tool_arguments_not_text",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        try:
            parsed_arguments = json.loads(raw_arguments)
        except json.JSONDecodeError:
            return _failed_response(
                response_sha256,
                code="invalid_arguments_json",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        if not isinstance(parsed_arguments, dict):
            return _failed_response(
                response_sha256,
                code="tool_arguments_not_object",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )

        tool = next(tool for tool in request.tools if tool.name == name)
        argument_document = cast(dict[str, object], parsed_arguments)
        reasoning: str | None = None
        expected_fields = {tool.argument_name}
        if self._config.reasoning_carrier is ReasoningCarrier.THOUGHT_IN_ARGUMENTS:
            expected_fields.add("thought")
            raw_reasoning = argument_document.get("thought")
            if not isinstance(raw_reasoning, str) or not raw_reasoning.strip():
                return _failed_response(
                    response_sha256,
                    code="thought_required",
                    stage=FailureStage.RESPONSE_ACTION,
                    repair_eligible=True,
                    finish_reason=normalized_finish_reason,
                )
            if len(raw_reasoning) > self._config.max_thought_chars:
                return _failed_response(
                    response_sha256,
                    code="thought_too_long",
                    stage=FailureStage.RESPONSE_ACTION,
                    repair_eligible=True,
                    finish_reason=normalized_finish_reason,
                )
            reasoning = raw_reasoning
        elif "thought" in argument_document:
            return _failed_response(
                response_sha256,
                code="thought_not_allowed",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        if set(argument_document) != expected_fields:
            return _failed_response(
                response_sha256,
                code="action_arguments_schema",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )
        action_value = argument_document.get(tool.argument_name)
        if not isinstance(action_value, str) or not action_value.strip():
            return _failed_response(
                response_sha256,
                code="action_argument_invalid",
                stage=FailureStage.RESPONSE_ACTION,
                repair_eligible=True,
                finish_reason=normalized_finish_reason,
            )

        call_id = call_ids[0]
        metadata = provider_metadata(
            response_id=_text(envelope.get("id")),
            returned_model=_text(envelope.get("model")),
            system_fingerprint=_text(envelope.get("system_fingerprint")),
            finish_reason=normalized_finish_reason,
            tool_call_id=call_id,
        )
        if name == "finish":
            canonical_message: AssistantToolCall | AssistantFinalMessage = (
                AssistantFinalMessage(
                    content=action_value,
                    reasoning=reasoning,
                    provider_metadata=metadata,
                )
            )
        else:
            canonical_message = AssistantToolCall(
                call=CanonicalToolCall(
                    call_id=call_id,
                    tool_name=name,
                    arguments={tool.argument_name: action_value},
                ),
                reasoning=reasoning,
                provider_metadata=metadata,
            )
        return TranslationOutcome(
            response_sha256=response_sha256,
            message=canonical_message,
            next_conversation=_conversation_from_request(request).append(canonical_message),
        )

    def _assistant_history_message(
        self,
        message: AssistantToolCall,
    ) -> dict[str, object]:
        arguments = dict(message.call.arguments)
        if self._config.reasoning_carrier is ReasoningCarrier.THOUGHT_IN_ARGUMENTS:
            assert message.reasoning is not None
            arguments["thought"] = message.reasoning
        if self._config.history_carrier is HistoryCarrier.NATIVE_TOOL_CALLS:
            return {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": message.call.call_id,
                        "type": "function",
                        "function": {
                            "name": message.call.tool_name,
                            "arguments": canonical_json_bytes(arguments).decode("utf-8"),
                        },
                    }
                ],
            }
        document: dict[str, object] = {
            "type": "tool",
            "tool": message.call.tool_name,
            "arguments": dict(message.call.arguments),
        }
        if self._config.reasoning_carrier is ReasoningCarrier.THOUGHT_IN_ARGUMENTS:
            document["thought"] = message.reasoning
        return {
            "role": "assistant",
            "content": canonical_json_bytes(document).decode("utf-8"),
        }

    def _tool_result_history_message(
        self,
        message: ToolResultMessage,
    ) -> dict[str, object]:
        if self._config.history_carrier is HistoryCarrier.NATIVE_TOOL_CALLS:
            return {
                "role": "tool",
                "tool_call_id": message.call_id,
                "name": message.tool_name,
                "content": message.content,
            }
        return {
            "role": "user",
            "content": f"Observation from {message.tool_name}:\n{message.content}",
        }

    def _provider_tool(self, tool: ActionTool) -> dict[str, object]:
        properties: dict[str, object] = {
            tool.argument_name: {
                "type": "string",
                "description": tool.argument_description,
            }
        }
        required = [tool.argument_name]
        if self._config.reasoning_carrier is ReasoningCarrier.THOUGHT_IN_ARGUMENTS:
            properties["thought"] = {
                "type": "string",
                "description": "A non-empty action-relevant working note.",
                "maxLength": self._config.max_thought_chars,
            }
            required = ["thought", tool.argument_name]
        return {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "strict": True,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                    "additionalProperties": False,
                },
            },
        }


def _validate_conversation(
    conversation: CanonicalConversation,
    *,
    tool_map: Mapping[str, ActionTool],
    config: TranslationConfig,
) -> tuple[str, ...]:
    if not conversation.messages:
        raise TranslationRejected(_request_failure("history_empty"))
    if not isinstance(conversation.messages[0], UserMessage):
        raise TranslationRejected(_request_failure("history_must_start_with_user"))
    pending: AssistantToolCall | None = None
    call_ids: list[str] = []
    for index, message in enumerate(conversation.messages):
        if isinstance(message, UserMessage):
            if pending is not None:
                raise TranslationRejected(_request_failure("missing_tool_result"))
        elif isinstance(message, AssistantToolCall):
            if pending is not None:
                raise TranslationRejected(_request_failure("missing_tool_result"))
            if message.additional_calls:
                raise TranslationRejected(
                    _request_failure("historical_multi_call_unsupported")
                )
            if message.call.call_id in call_ids:
                raise TranslationRejected(
                    _request_failure("historical_tool_call_id_duplicate")
                )
            tool = tool_map.get(message.call.tool_name)
            if tool is None:
                raise TranslationRejected(_request_failure("historical_tool_unknown"))
            if set(message.call.arguments) != {tool.argument_name}:
                raise TranslationRejected(
                    _request_failure("historical_action_arguments_schema")
                )
            argument = message.call.arguments.get(tool.argument_name)
            if not isinstance(argument, str) or not argument.strip():
                raise TranslationRejected(
                    _request_failure("historical_action_argument_invalid")
                )
            if (
                config.reasoning_carrier is ReasoningCarrier.THOUGHT_IN_ARGUMENTS
                and message.reasoning is None
            ):
                raise TranslationRejected(_request_failure("historical_thought_missing"))
            pending = message
            call_ids.append(message.call.call_id)
        elif isinstance(message, ToolResultMessage):
            if pending is None:
                raise TranslationRejected(_request_failure("orphan_tool_result"))
            if message.call_id != pending.call.call_id:
                raise TranslationRejected(_request_failure("tool_result_id_mismatch"))
            if message.tool_name != pending.call.tool_name:
                raise TranslationRejected(_request_failure("tool_result_name_mismatch"))
            pending = None
        elif isinstance(message, AssistantFinalMessage):
            if pending is not None:
                raise TranslationRejected(_request_failure("missing_tool_result"))
            if index != len(conversation.messages) - 1:
                raise TranslationRejected(_request_failure("message_after_final"))
            raise TranslationRejected(_request_failure("terminal_history_has_no_next_turn"))
    if pending is not None:
        raise TranslationRejected(_request_failure("missing_tool_result"))
    if not isinstance(conversation.messages[-1], (UserMessage, ToolResultMessage)):
        raise TranslationRejected(_request_failure("history_not_ready_for_assistant"))
    return tuple(call_ids)


def _tool_map(tools: tuple[ActionTool, ...]) -> Mapping[str, ActionTool]:
    if not tools:
        raise TranslationRejected(_request_failure("tools_empty"))
    result: dict[str, ActionTool] = {}
    for tool in tools:
        if tool.name in result:
            raise TranslationRejected(_request_failure("tool_name_duplicate"))
        result[tool.name] = tool
    if "bash" not in result or "finish" not in result:
        raise TranslationRejected(_request_failure("bash_finish_tools_required"))
    return result


def _conversation_from_request(request: ProviderRequest) -> CanonicalConversation:
    conversation = request.conversation
    if conversation.identity != request.conversation_id:
        raise TranslationRejected(_request_failure("request_conversation_snapshot_missing"))
    return conversation


def _request_failure(code: str) -> TranslationFailure:
    return TranslationFailure(
        code=code,
        stage=FailureStage.REQUEST_HISTORY,
        repair_eligible=False,
    )


def _failed_response(
    response_sha256: str,
    *,
    code: str,
    stage: FailureStage,
    repair_eligible: bool,
    finish_reason: str | None = None,
    details: tuple[tuple[str, str], ...] = (),
) -> TranslationOutcome:
    return TranslationOutcome(
        response_sha256=response_sha256,
        failure=TranslationFailure(
            code=code,
            stage=stage,
            repair_eligible=repair_eligible,
            response_sha256=response_sha256,
            finish_reason=finish_reason,
            details=details,
        ),
    )


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


__all__ = [
    "DeepSeekTranslationAdapter",
    "PROMPT_VERSION",
    "diagnostic_system_prompt",
]
