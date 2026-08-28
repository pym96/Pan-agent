"""DeepSeek V4 Flash Translation and ModelGateway integration.

The public request/response seam is credential-free.  A live HTTP transport is
injected separately, so request planning and every Stage A test remain offline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import hashlib
from pathlib import Path
from threading import Event
import time
from types import MappingProxyType
from typing import Mapping, Protocol, cast
import urllib.error
import urllib.request

from .evented import (
    CandidateFinal,
    CandidateToolCall,
    ExchangeEvidence,
    ExchangeFailed,
    ExchangeResult,
    ExchangeSettled,
    ExchangeUsage,
    FinalDisposition,
    PreparedModelTurn,
    ProviderFailure,
    ProviderFailureKind,
)
from .translation import (
    ActionTool,
    AssistantFinalMessage,
    AssistantToolCall,
    ToolResultMessage,
    UserMessage,
    canonical_json_bytes,
    identity_sha256,
    provider_metadata,
)


DEEPSEEK_LIVE_TRANSLATION_VERSION = "deepseek-behavioral-native-tools/v1"
DEEPSEEK_LIVE_SYSTEM_PROMPT = (
    "Act on the task only through exactly one provided function per response. "
    "Use a domain function to inspect or mutate local state. Use complete only "
    "after the task is satisfied. Use abstain only when evidence is insufficient "
    "or authority denies the requested action. Never place reasoning, rationale, "
    "thought, or analysis in function arguments."
)


@dataclass(frozen=True)
class DeepSeekLiveModelProfile:
    provider: str = "DeepSeek"
    requested_model: str = "deepseek-v4-flash"
    endpoint: str = "https://api.deepseek.com/chat/completions"
    thinking: str = "enabled"
    reasoning_effort: str = "high"
    context_window_tokens: int = 1_000_000
    max_output_tokens: int = 384_000
    capability_observed_on: str = "2026-08-28"
    capability_source: str = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/"

    def __post_init__(self) -> None:
        if self.provider != "DeepSeek":
            raise ValueError("live profile provider must be DeepSeek")
        if self.requested_model != "deepseek-v4-flash":
            raise ValueError("live profile model must be deepseek-v4-flash")
        if self.endpoint != "https://api.deepseek.com/chat/completions":
            raise ValueError("live profile must use the stable Chat Completions endpoint")
        if self.thinking != "enabled" or self.reasoning_effort != "high":
            raise ValueError("live profile locks thinking=enabled at high effort")
        if self.context_window_tokens != 1_000_000:
            raise ValueError("live profile Context window must be 1,000,000 Tokens")
        if self.max_output_tokens != 384_000:
            raise ValueError("live profile maximum output must be 384,000 Tokens")

    def identity_material(self) -> dict[str, object]:
        return {
            "provider": self.provider,
            "requested_model": self.requested_model,
            "endpoint": self.endpoint,
            "wire": "openai-compatible-chat-completions",
            "stream": False,
            "thinking": self.thinking,
            "reasoning_effort": self.reasoning_effort,
            "sampling_parameters": "omitted-in-thinking-mode",
            "context_window_tokens": self.context_window_tokens,
            "max_output_tokens": self.max_output_tokens,
            "capability_observed_on": self.capability_observed_on,
            "capability_source": self.capability_source,
        }

    @property
    def identity(self) -> str:
        return identity_sha256(self.identity_material())


def locked_deepseek_model_profile() -> DeepSeekLiveModelProfile:
    return DeepSeekLiveModelProfile()


@dataclass(frozen=True)
class DeepSeekToolBinding:
    """Map one Runtime string envelope to one exact closed Provider schema."""

    runtime_tool: ActionTool
    provider_parameters: Mapping[str, object]

    def __post_init__(self) -> None:
        parameters = _json_copy(self.provider_parameters)
        assert isinstance(parameters, dict)
        _validate_closed_object_schema(parameters)
        if self.runtime_tool.argument_name != "input":
            raise ValueError("Behavioral tool binding requires the Runtime input envelope")
        object.__setattr__(self, "provider_parameters", MappingProxyType(parameters))

    def identity_material(self) -> dict[str, object]:
        return {
            "runtime_tool": self.runtime_tool.identity_material(),
            "provider_parameters": self.provider_parameters,
            "runtime_argument_codec": "canonical-json-object-in-input-string/v1",
        }


@dataclass(frozen=True)
class DeepSeekLiveRequest:
    endpoint: str
    payload: Mapping[str, object]
    prepared_turn_identity: str
    model_profile_identity: str
    translation_identity: str
    historical_call_ids: tuple[str, ...]
    _payload_identity: str = field(init=False, repr=False)

    def __post_init__(self) -> None:
        copied = _json_copy(self.payload)
        assert isinstance(copied, dict)
        payload = MappingProxyType(copied)
        object.__setattr__(self, "payload", payload)
        object.__setattr__(self, "_payload_identity", identity_sha256(payload))

    @property
    def payload_identity(self) -> str:
        return self._payload_identity

    @property
    def payload_is_intact(self) -> bool:
        return identity_sha256(self.payload) == self._payload_identity

    def secret_free_material(self) -> dict[str, object]:
        return {
            "endpoint": self.endpoint,
            "payload": self.payload,
            "payload_identity": self.payload_identity,
            "prepared_turn_identity": self.prepared_turn_identity,
            "model_profile_identity": self.model_profile_identity,
            "translation_identity": self.translation_identity,
        }


class DeepSeekLiveTranslationAdapter:
    """Translate one provider-neutral prepared turn into the frozen DeepSeek wire."""

    def __init__(
        self,
        *,
        profile: DeepSeekLiveModelProfile,
        tool_bindings: tuple[DeepSeekToolBinding, ...],
        system_prompt: str = DEEPSEEK_LIVE_SYSTEM_PROMPT,
    ) -> None:
        if not tool_bindings:
            raise ValueError("at least one domain tool binding is required")
        names = tuple(binding.runtime_tool.name for binding in tool_bindings)
        if len(set(names)) != len(names):
            raise ValueError("domain tool binding names must be unique")
        if {"complete", "abstain"}.intersection(names):
            raise ValueError("domain tools cannot shadow canonical terminal tools")
        if not system_prompt:
            raise ValueError("DeepSeek live system prompt must be non-empty")
        self._profile = profile
        self._bindings = tool_bindings
        self._bindings_by_name = {
            binding.runtime_tool.name: binding for binding in tool_bindings
        }
        self._system_prompt = system_prompt

    @property
    def identity(self) -> str:
        return identity_sha256(
            {
                "version": DEEPSEEK_LIVE_TRANSLATION_VERSION,
                "model_profile_identity": self._profile.identity,
                "system_prompt_sha256": identity_sha256(self._system_prompt),
                "history_carrier": "native-tool-calls",
                "reasoning_carrier": "reasoning_content-restricted",
                "executable_argument_carrier": "command-only",
                "provider_strict": False,
                "max_actions_per_turn": 1,
                "tool_bindings": [
                    binding.identity_material() for binding in self._bindings
                ],
                "terminal_tools": _terminal_tool_material(),
            }
        )

    def encode_request(self, prepared_turn: PreparedModelTurn) -> DeepSeekLiveRequest:
        if prepared_turn.tools != tuple(
            binding.runtime_tool for binding in self._bindings
        ):
            raise ValueError("prepared turn tools differ from Translation bindings")
        messages: list[dict[str, object]] = [
            {"role": "system", "content": self._system_prompt}
        ]
        historical_call_ids: list[str] = []
        awaiting_result: tuple[str, str] | None = None
        for message in prepared_turn.conversation.messages:
            if isinstance(message, UserMessage):
                if awaiting_result is not None:
                    raise ValueError("assistant tool call is missing its paired result")
                messages.append({"role": "user", "content": message.content})
            elif isinstance(message, AssistantToolCall):
                if awaiting_result is not None:
                    raise ValueError("assistant tool calls cannot overlap")
                binding = self._bindings_by_name.get(message.call.tool_name)
                if binding is None:
                    raise ValueError("canonical history contains an unknown tool call")
                if message.call.call_id in historical_call_ids:
                    raise ValueError("canonical history reuses a tool call ID")
                direct_arguments = _decode_runtime_arguments(
                    binding,
                    message.call.arguments,
                )
                historical_call_ids.append(message.call.call_id)
                awaiting_result = (message.call.call_id, message.call.tool_name)
                messages.append(
                    {
                        "role": "assistant",
                        "content": "",
                        "reasoning_content": message.reasoning or "",
                        "tool_calls": [
                            {
                                "id": message.call.call_id,
                                "type": "function",
                                "function": {
                                    "name": message.call.tool_name,
                                    "arguments": canonical_json_bytes(
                                        direct_arguments
                                    ).decode("utf-8"),
                                },
                            }
                        ],
                    }
                )
            elif isinstance(message, ToolResultMessage):
                if awaiting_result != (message.call_id, message.tool_name):
                    raise ValueError("tool result does not match the preceding call")
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": message.call_id,
                        "content": message.content,
                    }
                )
                awaiting_result = None
            elif isinstance(message, AssistantFinalMessage):
                raise ValueError("terminal assistant history cannot be sent again")
            else:
                raise ValueError("unsupported canonical history message")
        if awaiting_result is not None:
            raise ValueError("assistant tool call is missing its paired result")
        payload: dict[str, object] = {
            "model": self._profile.requested_model,
            "messages": messages,
            "thinking": {"type": self._profile.thinking},
            "reasoning_effort": self._profile.reasoning_effort,
            "max_tokens": self._profile.max_output_tokens,
            "stream": False,
            "tools": [
                _provider_tool(binding) for binding in self._bindings
            ] + _terminal_provider_tools(),
            "tool_choice": "required",
        }
        return DeepSeekLiveRequest(
            endpoint=self._profile.endpoint,
            payload=payload,
            prepared_turn_identity=prepared_turn.identity,
            model_profile_identity=self._profile.identity,
            translation_identity=self.identity,
            historical_call_ids=tuple(historical_call_ids),
        )

    def decode_response(
        self,
        request: DeepSeekLiveRequest,
        response: "RetainedDeepSeekResponse",
    ) -> ExchangeResult:
        if request.model_profile_identity != self._profile.identity:
            raise ValueError("DeepSeek request ModelProfile identity mismatch")
        if request.translation_identity != self.identity:
            raise ValueError("DeepSeek request Translation identity mismatch")
        if not request.payload_is_intact:
            raise ValueError("DeepSeek request payload mutated after identity")
        response_identity = response.identity
        if not 200 <= response.status_code < 300:
            return _http_failure(request, response)
        try:
            decoded = json.loads(response.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return _protocol_failure(
                request,
                response,
                "response_not_utf8_json",
            )
        if not isinstance(decoded, dict):
            return _protocol_failure(request, response, "response_not_object")
        envelope = cast(dict[str, object], decoded)
        choices = envelope.get("choices")
        if not isinstance(choices, list) or len(choices) != 1:
            return _protocol_failure(request, response, "response_choices_invalid")
        choice = choices[0]
        if not isinstance(choice, dict):
            return _protocol_failure(request, response, "response_choice_invalid")
        finish_reason = choice.get("finish_reason")
        if finish_reason == "length":
            return _protocol_failure(
                request,
                response,
                "length_terminated",
                finish_reason="length",
            )
        if finish_reason != "tool_calls":
            return _protocol_failure(
                request,
                response,
                "finish_reason_invalid",
                finish_reason=(finish_reason if isinstance(finish_reason, str) else None),
            )
        message = choice.get("message")
        if not isinstance(message, dict) or message.get("role") != "assistant":
            return _protocol_failure(request, response, "assistant_message_invalid")
        reasoning = message.get("reasoning_content")
        if not isinstance(reasoning, str):
            return _protocol_failure(request, response, "reasoning_content_missing")
        tool_calls = message.get("tool_calls")
        if not isinstance(tool_calls, list) or len(tool_calls) != 1:
            return _protocol_failure(request, response, "action_count_invalid")
        raw_call = tool_calls[0]
        if not isinstance(raw_call, dict) or raw_call.get("type") != "function":
            return _protocol_failure(request, response, "tool_call_invalid")
        call_id = raw_call.get("id")
        if not isinstance(call_id, str) or not call_id:
            return _protocol_failure(request, response, "tool_call_id_missing")
        if call_id in request.historical_call_ids:
            return _protocol_failure(request, response, "tool_call_id_reused")
        function = raw_call.get("function")
        if not isinstance(function, dict):
            return _protocol_failure(request, response, "tool_function_missing")
        tool_name = function.get("name")
        raw_arguments = function.get("arguments")
        if not isinstance(tool_name, str) or not isinstance(raw_arguments, str):
            return _protocol_failure(request, response, "tool_function_invalid")
        try:
            arguments = json.loads(raw_arguments)
        except json.JSONDecodeError:
            return _protocol_failure(request, response, "tool_arguments_not_json")
        if not isinstance(arguments, dict):
            return _protocol_failure(request, response, "tool_arguments_not_object")
        usage = _usage(envelope.get("usage"))
        metadata = provider_metadata(
            response_id=_optional_text(envelope.get("id")),
            returned_model=_optional_text(envelope.get("model")),
            system_fingerprint=_optional_text(envelope.get("system_fingerprint")),
            finish_reason="tool_calls",
            tool_call_id=call_id,
        )
        evidence = ExchangeEvidence(
            response_identity=response_identity,
            usage=usage,
            duration_ms=response.duration_ms,
            request_identity=request.payload_identity,
            requested_model=self._profile.requested_model,
            returned_model=_optional_text(envelope.get("model")),
            system_fingerprint=_optional_text(envelope.get("system_fingerprint")),
            finish_reason="tool_calls",
        )
        candidate: CandidateFinal | CandidateToolCall
        if tool_name == "complete":
            if _schema_error(_terminal_parameters(0), arguments):
                return _protocol_failure(request, response, "complete_arguments_invalid")
            candidate = CandidateFinal(
                content=cast(str, arguments["output"]),
                disposition=FinalDisposition.COMPLETED,
                reasoning=reasoning or None,
                provider_metadata=metadata,
            )
        elif tool_name == "abstain":
            if _schema_error(_terminal_parameters(1), arguments):
                return _protocol_failure(request, response, "abstain_arguments_invalid")
            candidate = CandidateFinal(
                content=cast(str, arguments["output"]),
                disposition=FinalDisposition.ABSTAINED,
                reason_code=cast(str, arguments["reason_code"]),
                reasoning=reasoning or None,
                provider_metadata=metadata,
            )
        else:
            binding = self._bindings_by_name.get(tool_name)
            if binding is None:
                return _protocol_failure(request, response, "action_tool_unknown")
            if _schema_error(binding.provider_parameters, arguments):
                return _protocol_failure(request, response, "action_arguments_schema")
            candidate = CandidateToolCall(
                call_id=call_id,
                tool_name=tool_name,
                arguments={
                    "input": canonical_json_bytes(arguments).decode("utf-8")
                },
                reasoning=reasoning or None,
                provider_metadata=metadata,
            )
        return ExchangeSettled(
            exchange_id=_exchange_id(request, response),
            candidate=candidate,
            stop_reason="tool_calls",
            evidence=evidence,
        )


@dataclass(frozen=True)
class RetainedDeepSeekResponse:
    status_code: int
    body: bytes
    duration_ms: int | None = None

    @property
    def identity(self) -> str:
        return "sha256:" + hashlib.sha256(self.body).hexdigest()


class DeepSeekChatTransport(Protocol):
    def send(
        self,
        request: DeepSeekLiveRequest,
        cancel_signal: Event,
    ) -> RetainedDeepSeekResponse: ...


class DeepSeekTransportError(RuntimeError):
    """Secret-free failure before an exact HTTP response can be retained."""


class DeepSeekHttpTransport:
    """Stable Chat Completions HTTP Adapter; construction performs no I/O."""

    def __init__(
        self,
        *,
        api_key: str,
        timeout_seconds: float = 30.0,
        urlopen=None,
        monotonic_ns=time.monotonic_ns,
    ) -> None:
        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError("DeepSeek API key cannot be empty")
        if timeout_seconds <= 0:
            raise ValueError("DeepSeek HTTP timeout must be positive")
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._urlopen = urlopen or urllib.request.urlopen
        self._monotonic_ns = monotonic_ns

    def send(
        self,
        request: DeepSeekLiveRequest,
        cancel_signal: Event,
    ) -> RetainedDeepSeekResponse:
        if cancel_signal.is_set():
            raise KeyboardInterrupt
        wire_request = urllib.request.Request(
            request.endpoint,
            data=canonical_json_bytes(request.payload),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "User-Agent": "workspace-agent-harness/deepseek-live-v0",
            },
            method="POST",
        )
        started = self._monotonic_ns()
        try:
            with self._urlopen(
                wire_request,
                timeout=self._timeout_seconds,
            ) as response:
                body = response.read()
                status = getattr(response, "status", None)
                if not isinstance(status, int):
                    status = response.getcode()
        except urllib.error.HTTPError as error:
            status = error.code
            body = error.read()
        except urllib.error.URLError as error:
            reason = type(error.reason).__name__
            raise DeepSeekTransportError(
                f"DeepSeek transport unavailable: {reason}"
            ) from None
        except (TimeoutError, OSError) as error:
            raise DeepSeekTransportError(
                f"DeepSeek transport unavailable: {type(error).__name__}"
            ) from None
        duration_ms = max(0, (self._monotonic_ns() - started) // 1_000_000)
        if cancel_signal.is_set():
            raise KeyboardInterrupt
        return RetainedDeepSeekResponse(
            status_code=status,
            body=body,
            duration_ms=duration_ms,
        )


class DeepSeekExchangeStore(Protocol):
    def record(
        self,
        request: DeepSeekLiveRequest,
        response: RetainedDeepSeekResponse,
    ) -> None: ...


class FileDeepSeekExchangeStore:
    """Append-only, credential-free exact request/response retention Adapter."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=False)
        self._count = 0

    def record(
        self,
        request: DeepSeekLiveRequest,
        response: RetainedDeepSeekResponse,
    ) -> None:
        self._count += 1
        exchange_root = self.root / f"exchange-{self._count:03d}"
        exchange_root.mkdir(exist_ok=False)
        (exchange_root / "request.body").write_bytes(
            canonical_json_bytes(request.payload)
        )
        (exchange_root / "request.json").write_bytes(
            canonical_json_bytes(request.secret_free_material()) + b"\n"
        )
        (exchange_root / "response.body").write_bytes(response.body)
        (exchange_root / "receipt.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/deepseek-exchange-receipt/v1",
                    "request_identity": request.payload_identity,
                    "response_identity": response.identity,
                    "http_status": response.status_code,
                    "duration_ms": response.duration_ms,
                }
            )
            + b"\n"
        )


class DeepSeekModelGateway:
    """One deep ModelGateway over Translation, transport, and raw retention."""

    def __init__(
        self,
        *,
        adapter: DeepSeekLiveTranslationAdapter,
        transport: DeepSeekChatTransport,
        exchange_store: DeepSeekExchangeStore | None = None,
    ) -> None:
        self._adapter = adapter
        self._transport = transport
        self._exchange_store = exchange_store

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeResult:
        request = self._adapter.encode_request(prepared_turn)
        try:
            response = self._transport.send(request, cancel_signal)
        except DeepSeekTransportError as error:
            return ExchangeFailed(
                exchange_id=identity_sha256(
                    {
                        "request": request.payload_identity,
                        "transport_failure": str(error),
                    }
                ),
                failure=ProviderFailure(
                    kind=ProviderFailureKind.TRANSPORT,
                    code="transport_unavailable",
                    message=str(error),
                ),
                evidence=ExchangeEvidence(
                    request_identity=request.payload_identity,
                    requested_model="deepseek-v4-flash",
                ),
            )
        if self._exchange_store is not None:
            self._exchange_store.record(request, response)
        return self._adapter.decode_response(request, response)


def _provider_tool(binding: DeepSeekToolBinding) -> dict[str, object]:
    return {
        "type": "function",
        "function": {
            "name": binding.runtime_tool.name,
            "description": binding.runtime_tool.description,
            "parameters": _json_copy(binding.provider_parameters),
        },
    }


def _terminal_provider_tools() -> list[dict[str, object]]:
    return [
        {
            "type": "function",
            "function": {
                "name": "complete",
                "description": "Settle the task as completed after its exact success condition is met.",
                "parameters": {
                    "type": "object",
                    "properties": {"output": {"type": "string"}},
                    "required": ["output"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "abstain",
                "description": "Settle without action only for an allowed evidence or authority reason.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reason_code": {
                            "type": "string",
                            "enum": ["insufficient_evidence", "authority_denied"],
                        },
                        "output": {"type": "string"},
                    },
                    "required": ["reason_code", "output"],
                    "additionalProperties": False,
                },
            },
        },
    ]


def _terminal_tool_material() -> object:
    return [item["function"] for item in _terminal_provider_tools()]


def _terminal_parameters(index: int) -> Mapping[str, object]:
    function = _terminal_provider_tools()[index]["function"]
    if not isinstance(function, Mapping):
        raise AssertionError("terminal function definition must be an object")
    parameters = function.get("parameters")
    if not isinstance(parameters, Mapping):
        raise AssertionError("terminal parameters must be an object")
    return parameters


def _validate_closed_object_schema(schema: Mapping[str, object]) -> None:
    if set(schema) != {"type", "properties", "required", "additionalProperties"}:
        raise ValueError("Provider tool schema must be one closed object")
    if schema.get("type") != "object" or schema.get("additionalProperties") is not False:
        raise ValueError("Provider tool schema must reject additional properties")
    properties = schema.get("properties")
    required = schema.get("required")
    if not isinstance(properties, Mapping) or not isinstance(required, list):
        raise ValueError("Provider tool properties and required fields are malformed")
    if set(required) != set(properties) or not all(
        isinstance(name, str) and name for name in required
    ):
        raise ValueError("every Provider tool property must be required")
    for name, definition in properties.items():
        if not isinstance(name, str) or not name or not isinstance(definition, Mapping):
            raise ValueError("Provider tool property definitions are malformed")
        if definition.get("type") != "string":
            raise ValueError("Behavioral Eval v0 Provider tools support string fields")


def _decode_runtime_arguments(
    binding: DeepSeekToolBinding,
    arguments: Mapping[str, object],
) -> dict[str, object]:
    if set(arguments) != {"input"} or not isinstance(arguments.get("input"), str):
        raise ValueError("Runtime tool history must contain one JSON input string")
    try:
        decoded = json.loads(cast(str, arguments["input"]))
    except json.JSONDecodeError as error:
        raise ValueError("Runtime tool history input is not JSON") from error
    if not isinstance(decoded, dict) or _schema_error(
        binding.provider_parameters,
        decoded,
    ):
        raise ValueError("Runtime tool history input violates its closed schema")
    return decoded


def _schema_error(schema: object, arguments: Mapping[str, object]) -> bool:
    if not isinstance(schema, Mapping):
        return True
    properties = schema.get("properties")
    required = schema.get("required")
    if not isinstance(properties, Mapping) or not isinstance(required, (list, tuple)):
        return True
    if set(arguments) != set(required) or set(arguments) != set(properties):
        return True
    for name, value in arguments.items():
        definition = properties.get(name)
        if not isinstance(definition, Mapping):
            return True
        if definition.get("type") == "string" and not isinstance(value, str):
            return True
        allowed = definition.get("enum")
        if allowed is not None and (
            not isinstance(allowed, (list, tuple)) or value not in allowed
        ):
            return True
    return False


def _usage(value: object) -> ExchangeUsage:
    if not isinstance(value, Mapping):
        return ExchangeUsage()

    def token(key: str) -> int | None:
        raw = value.get(key)
        return raw if isinstance(raw, int) and not isinstance(raw, bool) and raw >= 0 else None

    return ExchangeUsage(
        input_tokens=token("prompt_tokens"),
        output_tokens=token("completion_tokens"),
        total_tokens=token("total_tokens"),
    )


def _optional_text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _exchange_id(
    request: DeepSeekLiveRequest,
    response: RetainedDeepSeekResponse,
) -> str:
    return identity_sha256(
        {
            "request": request.payload_identity,
            "response": response.identity,
        }
    )


def _protocol_failure(
    request: DeepSeekLiveRequest,
    response: RetainedDeepSeekResponse,
    code: str,
    *,
    finish_reason: str | None = None,
) -> ExchangeFailed:
    return ExchangeFailed(
        exchange_id=_exchange_id(request, response),
        failure=ProviderFailure(
            kind=ProviderFailureKind.PROTOCOL,
            code=code,
            message=f"DeepSeek response rejected: {code}",
        ),
        evidence=ExchangeEvidence(
            response_identity=response.identity,
            duration_ms=response.duration_ms,
            request_identity=request.payload_identity,
            requested_model="deepseek-v4-flash",
            finish_reason=finish_reason,
        ),
    )


def _http_failure(
    request: DeepSeekLiveRequest,
    response: RetainedDeepSeekResponse,
) -> ExchangeFailed:
    body_text = response.body.decode("utf-8", errors="replace").casefold()
    if response.status_code == 401:
        kind = ProviderFailureKind.AUTHENTICATION
        code = "authentication_failed"
    elif response.status_code == 403:
        kind = ProviderFailureKind.AUTHORIZATION
        code = "authorization_failed"
    elif response.status_code == 402:
        kind = ProviderFailureKind.BALANCE
        code = "balance_unavailable"
    elif response.status_code == 429:
        kind = ProviderFailureKind.RATE_LIMIT
        code = "rate_limited"
    elif response.status_code == 400 and any(
        marker in body_text
        for marker in ("context length", "context_length", "maximum context", "too long")
    ):
        kind = ProviderFailureKind.CONTEXT_OVERFLOW
        code = "context_overflow"
    elif response.status_code >= 500:
        kind = ProviderFailureKind.TRANSPORT
        code = "provider_server_error"
    else:
        kind = ProviderFailureKind.PROTOCOL
        code = "provider_http_status"
    return ExchangeFailed(
        exchange_id=_exchange_id(request, response),
        failure=ProviderFailure(
            kind=kind,
            code=code,
            message=f"DeepSeek HTTP status {response.status_code}",
        ),
        evidence=ExchangeEvidence(
            response_identity=response.identity,
            duration_ms=response.duration_ms,
            request_identity=request.payload_identity,
            requested_model="deepseek-v4-flash",
        ),
    )


def _json_copy(value: object) -> object:
    return json.loads(canonical_json_bytes(value).decode("utf-8"))


__all__ = [
    "DEEPSEEK_LIVE_SYSTEM_PROMPT",
    "DEEPSEEK_LIVE_TRANSLATION_VERSION",
    "DeepSeekLiveModelProfile",
    "DeepSeekLiveRequest",
    "DeepSeekLiveTranslationAdapter",
    "DeepSeekHttpTransport",
    "DeepSeekModelGateway",
    "DeepSeekTransportError",
    "DeepSeekToolBinding",
    "FileDeepSeekExchangeStore",
    "RetainedDeepSeekResponse",
    "locked_deepseek_model_profile",
]
