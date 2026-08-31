from __future__ import annotations

import hashlib
import json
import math
from copy import deepcopy
from dataclasses import dataclass, field
from enum import StrEnum
from types import MappingProxyType
from typing import Mapping, Protocol, TypeAlias


ProviderMetadata: TypeAlias = tuple[tuple[str, str], ...]


def provider_metadata(**values: str | None) -> ProviderMetadata:
    """Build deterministic, secret-free provider metadata."""

    return tuple(sorted((key, value) for key, value in values.items() if value is not None))


@dataclass(frozen=True)
class UserMessage:
    content: str

    def __post_init__(self) -> None:
        if not isinstance(self.content, str) or not self.content:
            raise ValueError("user message content must be non-empty text")


@dataclass(frozen=True)
class CanonicalToolCall:
    call_id: str
    tool_name: str
    arguments: Mapping[str, object]

    def __post_init__(self) -> None:
        if not self.call_id or not isinstance(self.call_id, str):
            raise ValueError("tool call ID must be non-empty text")
        if not self.tool_name or not isinstance(self.tool_name, str):
            raise ValueError("tool name must be non-empty text")
        if not isinstance(self.arguments, Mapping):
            raise ValueError("tool arguments must be an object")
        object.__setattr__(self, "arguments", MappingProxyType(dict(self.arguments)))


@dataclass(frozen=True)
class AssistantToolCall:
    call: CanonicalToolCall
    reasoning: str | None = None
    provider_metadata: ProviderMetadata = ()
    additional_calls: tuple[CanonicalToolCall, ...] = ()

    def __post_init__(self) -> None:
        _validate_optional_reasoning(self.reasoning)
        _validate_provider_metadata(self.provider_metadata)
        if not isinstance(self.call, CanonicalToolCall) or not isinstance(
            self.additional_calls,
            tuple,
        ) or not all(
            isinstance(call, CanonicalToolCall) for call in self.additional_calls
        ):
            raise ValueError("assistant calls must be canonical tool-call tuples")
        call_ids = tuple(call.call_id for call in self.calls)
        if len(set(call_ids)) != len(call_ids):
            raise ValueError("assistant tool-call turn must use unique call IDs")

    @property
    def calls(self) -> tuple[CanonicalToolCall, ...]:
        """Provider-ordered calls belonging to one canonical assistant turn."""

        return (self.call, *self.additional_calls)


@dataclass(frozen=True)
class ToolResultMessage:
    call_id: str
    tool_name: str
    content: str
    is_error: bool = False
    provider_metadata: ProviderMetadata = ()

    def __post_init__(self) -> None:
        if not self.call_id or not isinstance(self.call_id, str):
            raise ValueError("tool result call ID must be non-empty text")
        if not self.tool_name or not isinstance(self.tool_name, str):
            raise ValueError("tool result name must be non-empty text")
        if not isinstance(self.content, str):
            raise ValueError("tool result content must be text")
        _validate_provider_metadata(self.provider_metadata)


@dataclass(frozen=True)
class AssistantFinalMessage:
    content: str
    reasoning: str | None = None
    provider_metadata: ProviderMetadata = ()

    def __post_init__(self) -> None:
        if not self.content or not isinstance(self.content, str):
            raise ValueError("assistant final content must be non-empty text")
        _validate_optional_reasoning(self.reasoning)
        _validate_provider_metadata(self.provider_metadata)


CanonicalMessage: TypeAlias = (
    UserMessage | AssistantToolCall | ToolResultMessage | AssistantFinalMessage
)


@dataclass(frozen=True)
class CanonicalConversation:
    messages: tuple[CanonicalMessage, ...]

    def append(self, message: CanonicalMessage) -> "CanonicalConversation":
        return CanonicalConversation((*self.messages, message))

    def identity_material(self) -> object:
        return {"messages": [_message_material(message) for message in self.messages]}

    @property
    def identity(self) -> str:
        return identity_sha256(self.identity_material())


@dataclass(frozen=True)
class ActionTool:
    name: str
    description: str
    argument_name: str
    argument_description: str

    def __post_init__(self) -> None:
        for label, value in (
            ("tool name", self.name),
            ("tool description", self.description),
            ("tool argument name", self.argument_name),
            ("tool argument description", self.argument_description),
        ):
            if not isinstance(value, str) or not value:
                raise ValueError(f"{label} must be non-empty text")
        if self.argument_name == "thought":
            raise ValueError("reasoning cannot be a canonical executable argument")

    def identity_material(self) -> object:
        return {
            "name": self.name,
            "description": self.description,
            "argument_name": self.argument_name,
            "argument_description": self.argument_description,
        }


def bash_finish_tools() -> tuple[ActionTool, ...]:
    return (
        ActionTool(
            name="bash",
            description="Run one bash command in the isolated repository.",
            argument_name="command",
            argument_description="The exact non-empty bash command to execute.",
        ),
        ActionTool(
            name="finish",
            description="Finish when the repository patch is ready.",
            argument_name="output",
            argument_description="A concise final status message.",
        ),
    )


@dataclass(frozen=True)
class ProviderControlledOutput:
    """Explicitly omit a client-requested output ceiling for this profile."""

    reason: str = "provider-controlled"

    def __post_init__(self) -> None:
        if not isinstance(self.reason, str) or not self.reason:
            raise ValueError("provider-controlled output reason must be non-empty")


@dataclass(frozen=True)
class ModelProfile:
    provider: str
    model: str
    endpoint: str
    max_output_tokens: int | ProviderControlledOutput
    temperature: float
    thinking: str

    def __post_init__(self) -> None:
        for label, value in (
            ("provider", self.provider),
            ("model", self.model),
            ("endpoint", self.endpoint),
            ("thinking mode", self.thinking),
        ):
            if not isinstance(value, str) or not value:
                raise ValueError(f"model {label} must be non-empty text")
        if not self.endpoint.startswith("https://"):
            raise ValueError("model endpoint must use HTTPS")
        if isinstance(self.max_output_tokens, bool) or not isinstance(
            self.max_output_tokens,
            (int, ProviderControlledOutput),
        ):
            raise ValueError(
                "max_output_tokens must be a positive integer or ProviderControlledOutput"
            )
        if isinstance(self.max_output_tokens, int) and self.max_output_tokens <= 0:
            raise ValueError("max_output_tokens must be positive")
        if isinstance(self.temperature, bool) or not isinstance(
            self.temperature,
            (int, float),
        ):
            raise ValueError("model temperature must be numeric")
        if not math.isfinite(float(self.temperature)) or self.temperature < 0:
            raise ValueError("model temperature must be finite and non-negative")

    def identity_material(self) -> object:
        limit: object
        if isinstance(self.max_output_tokens, int):
            limit = {"mode": "explicit", "tokens": self.max_output_tokens}
        else:
            limit = {
                "mode": "provider-controlled",
                "reason": self.max_output_tokens.reason,
            }
        return {
            "provider": self.provider,
            "model": self.model,
            "endpoint": self.endpoint,
            "max_output_tokens": limit,
            "temperature": self.temperature,
            "thinking": self.thinking,
        }

    @property
    def identity(self) -> str:
        return identity_sha256(self.identity_material())


class HistoryCarrier(StrEnum):
    LEGACY_JSON_TEXT = "legacy-json-text"
    NATIVE_TOOL_CALLS = "native-tool-calls"


class ReasoningCarrier(StrEnum):
    THOUGHT_IN_ARGUMENTS = "thought-in-arguments"
    COMMAND_ONLY = "command-only"


@dataclass(frozen=True)
class TranslationConfig:
    model_profile: ModelProfile
    history_carrier: HistoryCarrier
    reasoning_carrier: ReasoningCarrier
    system_prompt: str
    prompt_version: str
    max_thought_chars: int = 1_000
    max_actions_per_turn: int = 1

    def __post_init__(self) -> None:
        if not isinstance(self.system_prompt, str) or not self.system_prompt:
            raise ValueError("translation system prompt must be non-empty text")
        if not isinstance(self.prompt_version, str) or not self.prompt_version:
            raise ValueError("translation prompt version must be non-empty text")
        if self.max_thought_chars <= 0:
            raise ValueError("max_thought_chars must be positive")
        if self.max_actions_per_turn != 1:
            raise ValueError("this Translation Adapter permits exactly one action per turn")

    def identity_material(self) -> object:
        return {
            "model_profile_id": self.model_profile.identity,
            "history_carrier": self.history_carrier.value,
            "reasoning_carrier": self.reasoning_carrier.value,
            "system_prompt_sha256": identity_sha256(self.system_prompt),
            "prompt_version": self.prompt_version,
            "max_thought_chars": self.max_thought_chars,
            "max_actions_per_turn": self.max_actions_per_turn,
        }

    @property
    def identity(self) -> str:
        return identity_sha256(self.identity_material())


@dataclass(frozen=True)
class ProviderRequest:
    endpoint: str
    payload: Mapping[str, object]
    model_profile_id: str
    translation_config_id: str
    conversation_id: str
    conversation: CanonicalConversation
    tools: tuple[ActionTool, ...]
    historical_call_ids: tuple[str, ...]
    _payload_sha256: str = field(init=False, repr=False)

    def __post_init__(self) -> None:
        payload = MappingProxyType(deepcopy(dict(self.payload)))
        object.__setattr__(self, "payload", payload)
        object.__setattr__(
            self,
            "_payload_sha256",
            "sha256:" + hashlib.sha256(canonical_json_bytes(payload)).hexdigest(),
        )
        if self.conversation.identity != self.conversation_id:
            raise ValueError("provider request conversation identity mismatch")

    @property
    def payload_sha256(self) -> str:
        return self._payload_sha256

    @property
    def payload_is_intact(self) -> bool:
        current = "sha256:" + hashlib.sha256(canonical_json_bytes(self.payload)).hexdigest()
        return current == self._payload_sha256


@dataclass(frozen=True)
class RetainedProviderResponse:
    status_code: int
    body: bytes

    @property
    def sha256(self) -> str:
        return "sha256:" + hashlib.sha256(self.body).hexdigest()


class FailureStage(StrEnum):
    REQUEST_HISTORY = "request-history"
    RESPONSE_ENVELOPE = "response-envelope"
    RESPONSE_ACTION = "response-action"
    CORRELATION = "correlation"


@dataclass(frozen=True)
class TranslationFailure:
    code: str
    stage: FailureStage
    repair_eligible: bool
    response_sha256: str | None = None
    finish_reason: str | None = None
    details: tuple[tuple[str, str], ...] = ()


class TranslationRejected(ValueError):
    def __init__(self, failure: TranslationFailure) -> None:
        self.failure = failure
        super().__init__(f"{failure.stage.value}: {failure.code}")


@dataclass(frozen=True)
class TranslationOutcome:
    response_sha256: str
    message: AssistantToolCall | AssistantFinalMessage | None = None
    next_conversation: CanonicalConversation | None = None
    failure: TranslationFailure | None = None

    def __post_init__(self) -> None:
        success = self.message is not None and self.next_conversation is not None
        if success == (self.failure is not None):
            raise ValueError("translation outcome must contain exactly one success or failure")

    @property
    def succeeded(self) -> bool:
        return self.failure is None


class TranslationAdapter(Protocol):
    """Own provider request encoding and retained-response decoding."""

    def encode_request(
        self,
        conversation: CanonicalConversation,
        tools: tuple[ActionTool, ...],
    ) -> ProviderRequest: ...

    def decode_response(
        self,
        request: ProviderRequest,
        response: RetainedProviderResponse,
    ) -> TranslationOutcome: ...


class TranslationTransport(Protocol):
    """Injected provider exchange seam; tests use retained fixture transports."""

    def send(self, request: ProviderRequest) -> RetainedProviderResponse: ...


@dataclass(frozen=True)
class TranslationAttempt:
    request: ProviderRequest
    response: RetainedProviderResponse
    outcome: TranslationOutcome


def run_translation_turn(
    *,
    adapter: TranslationAdapter,
    transport: TranslationTransport,
    conversation: CanonicalConversation,
    tools: tuple[ActionTool, ...],
) -> TranslationAttempt:
    request = adapter.encode_request(conversation, tools)
    response = transport.send(request)
    return TranslationAttempt(
        request=request,
        response=response,
        outcome=adapter.decode_response(request, response),
    )


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        _jsonable(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def identity_sha256(value: object) -> str:
    return "sha256:" + hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _message_material(message: CanonicalMessage) -> object:
    if isinstance(message, UserMessage):
        return {"role": "user", "content": message.content}
    if isinstance(message, AssistantToolCall):
        if message.additional_calls:
            return {
                "role": "assistant-tool-call-batch",
                "calls": [
                    {
                        "call_id": call.call_id,
                        "tool_name": call.tool_name,
                        "arguments": call.arguments,
                    }
                    for call in message.calls
                ],
                "reasoning": message.reasoning,
                "provider_metadata": message.provider_metadata,
            }
        return {
            "role": "assistant-tool-call",
            "call_id": message.call.call_id,
            "tool_name": message.call.tool_name,
            "arguments": message.call.arguments,
            "reasoning": message.reasoning,
            "provider_metadata": message.provider_metadata,
        }
    if isinstance(message, ToolResultMessage):
        return {
            "role": "tool-result",
            "call_id": message.call_id,
            "tool_name": message.tool_name,
            "content": message.content,
            "is_error": message.is_error,
            "provider_metadata": message.provider_metadata,
        }
    return {
        "role": "assistant-final",
        "content": message.content,
        "reasoning": message.reasoning,
        "provider_metadata": message.provider_metadata,
    }


def _jsonable(value: object) -> object:
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_jsonable(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    raise TypeError(f"value is not JSON-compatible: {type(value).__name__}")


def _validate_optional_reasoning(reasoning: str | None) -> None:
    if reasoning is not None and (not isinstance(reasoning, str) or not reasoning.strip()):
        raise ValueError("reasoning must be non-empty text when present")


def _validate_provider_metadata(metadata: ProviderMetadata) -> None:
    if not isinstance(metadata, tuple):
        raise ValueError("provider metadata must be an immutable tuple")
    for item in metadata:
        if (
            not isinstance(item, tuple)
            or len(item) != 2
            or not all(isinstance(value, str) and value for value in item)
        ):
            raise ValueError("provider metadata entries must be non-empty text pairs")


__all__ = [
    "ActionTool",
    "AssistantFinalMessage",
    "AssistantToolCall",
    "CanonicalConversation",
    "CanonicalMessage",
    "CanonicalToolCall",
    "FailureStage",
    "HistoryCarrier",
    "ModelProfile",
    "ProviderControlledOutput",
    "ProviderRequest",
    "ReasoningCarrier",
    "RetainedProviderResponse",
    "ToolResultMessage",
    "TranslationAdapter",
    "TranslationAttempt",
    "TranslationConfig",
    "TranslationFailure",
    "TranslationOutcome",
    "TranslationRejected",
    "TranslationTransport",
    "UserMessage",
    "bash_finish_tools",
    "canonical_json_bytes",
    "identity_sha256",
    "provider_metadata",
    "run_translation_turn",
]
