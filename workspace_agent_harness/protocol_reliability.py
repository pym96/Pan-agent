from __future__ import annotations

import hashlib
import json
import math
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, Protocol, Sequence, cast

from .react_mvp import AgentVariant


CONFIG_SCHEMA = "workspace-agent-harness/protocol-reliability/v1"
CORPUS_SCHEMA = "workspace-agent-harness/protocol-context-corpus/v1"
RESULT_SCHEMA = "workspace-agent-harness/protocol-attempt/v1"


class ProtocolTransport(StrEnum):
    JSON_OBJECT = "json_object"
    STRICT_FUNCTION = "strict_function"


@dataclass(frozen=True)
class ProtocolAssessment:
    response_available: bool
    carrier_syntax_valid: bool
    action_schema_valid: bool
    canonical_action_valid: bool
    earliest_failure_code: str | None
    canonical_action: str | None

    def as_dict(self) -> dict[str, object]:
        return {
            "l0_response_available": self.response_available,
            "l1_carrier_syntax_valid": self.carrier_syntax_valid,
            "l2_action_schema_valid": self.action_schema_valid,
            "l3_canonical_action_valid": self.canonical_action_valid,
            "earliest_failure_code": self.earliest_failure_code,
            "canonical_action": self.canonical_action,
        }


@dataclass(frozen=True)
class HttpExchange:
    status_code: int
    response_body: bytes


class RawHttpTransport(Protocol):
    def post(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> HttpExchange: ...


class UrllibRawHttpTransport:
    """Return the exact HTTP body while keeping credentials out of errors."""

    def post(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> HttpExchange:
        request = urllib.request.Request(
            url,
            data=canonical_json_bytes(payload),
            headers=dict(headers),
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                return HttpExchange(
                    status_code=int(response.status),
                    response_body=response.read(),
                )
        except urllib.error.HTTPError as error:
            return HttpExchange(
                status_code=error.code,
                response_body=error.read(),
            )
        except urllib.error.URLError as error:
            reason = type(error.reason).__name__
            raise RuntimeError(f"provider transport error: {reason}") from None


def load_protocol_config(
    config_path: Path,
    corpus_path: Path,
) -> tuple[Mapping[str, object], Mapping[str, object]]:
    config = _read_hashed_object(config_path, CONFIG_SCHEMA, "configuration")
    corpus = _read_hashed_object(corpus_path, CORPUS_SCHEMA, "context corpus")
    expected_corpus_hash = config.get("context_corpus_hash")
    if expected_corpus_hash != corpus.get("content_hash"):
        raise ValueError("protocol context corpus hash does not match configuration")
    contexts = corpus.get("contexts")
    if not isinstance(contexts, list) or len(contexts) != 24:
        raise ValueError("protocol context corpus must contain exactly 24 contexts")
    ids: list[str] = []
    cohort_counts = {"challenge": 0, "control": 0}
    strata: set[tuple[str, str]] = set()
    for item in contexts:
        context = _mapping(item, "protocol context")
        context_id = context.get("context_id")
        variant = context.get("variant")
        cohort = context.get("cohort")
        depth_band = context.get("depth_band")
        messages = context.get("messages")
        if not isinstance(context_id, str) or not context_id:
            raise ValueError("every protocol context requires a context_id")
        if variant not in {item.value for item in AgentVariant}:
            raise ValueError(f"{context_id}: invalid Agent variant")
        if cohort not in cohort_counts:
            raise ValueError(f"{context_id}: invalid context cohort")
        if depth_band not in {"call-1", "calls-2-5", "calls-6-15", "calls-16+"}:
            raise ValueError(f"{context_id}: invalid call-depth band")
        if not isinstance(messages, list) or not messages:
            raise ValueError(f"{context_id}: messages must be a non-empty array")
        _validate_frozen_messages(messages, context_id)
        ids.append(context_id)
        cohort_counts[cast(str, cohort)] += 1
        if cohort == "control":
            strata.add((cast(str, variant), cast(str, depth_band)))
    if len(set(ids)) != len(ids):
        raise ValueError("protocol context IDs must be unique")
    if cohort_counts != {"challenge": 16, "control": 8}:
        raise ValueError("protocol corpus must freeze 16 challenge and 8 control contexts")
    expected_strata = {
        (variant.value, band)
        for variant in AgentVariant
        for band in ("call-1", "calls-2-5", "calls-6-15", "calls-16+")
    }
    if strata != expected_strata:
        raise ValueError("control contexts must cover both variants and four depth bands")
    experiment = _mapping(config.get("experiment"), "experiment")
    if experiment.get("repetitions") != 5:
        raise ValueError("protocol reliability v1 requires five repetitions")
    if experiment.get("transports") != [
        ProtocolTransport.JSON_OBJECT.value,
        ProtocolTransport.STRICT_FUNCTION.value,
    ]:
        raise ValueError("protocol reliability transports have drifted")
    repair = _mapping(experiment.get("repair"), "repair")
    if repair.get("max_additional_calls") != 1:
        raise ValueError("protocol repair depth must remain one")
    if repair.get("eligible_failure_levels") != ["L1", "L2", "L3"]:
        raise ValueError("only response-level L1-L3 failures may be repaired")
    return MappingProxyType(dict(config)), MappingProxyType(dict(corpus))


def build_request_payload(
    *,
    config: Mapping[str, object],
    context: Mapping[str, object],
    transport: ProtocolTransport,
    repair_failure_code: str | None = None,
    previous_response: Mapping[str, object] | None = None,
) -> dict[str, object]:
    experiment = _mapping(config.get("experiment"), "experiment")
    model = _mapping(experiment.get("model"), "model")
    prompts = _mapping(experiment.get("prompts"), "prompts")
    variant = AgentVariant(cast(str, context["variant"]))
    system_key = (
        f"{transport.value}:{variant.value}"
    )
    system_prompt = prompts.get(system_key)
    if not isinstance(system_prompt, str) or not system_prompt:
        raise ValueError(f"missing frozen system prompt: {system_key}")
    frozen_messages = context.get("messages")
    if not isinstance(frozen_messages, list):
        raise ValueError("frozen context messages must be an array")
    messages: list[dict[str, object]] = [
        {"role": "system", "content": system_prompt},
        *[dict(_mapping(item, "frozen message")) for item in frozen_messages],
    ]
    if repair_failure_code is not None:
        if previous_response is None:
            raise ValueError("repair requires the previous provider response")
        repair_template = prompts.get("repair")
        if not isinstance(repair_template, str) or "{failure_code}" not in repair_template:
            raise ValueError("repair prompt template has drifted")
        previous_message = _previous_message_material(previous_response)
        messages.append(
            {
                "role": "user",
                "content": repair_template.format(
                    failure_code=repair_failure_code,
                    previous_response=json.dumps(
                        previous_message,
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                    ),
                ),
            }
        )
    payload: dict[str, object] = {
        "model": model["model_id"],
        "messages": messages,
        "thinking": {"type": model["thinking"]},
        "temperature": model["temperature"],
        "max_tokens": model["max_completion_tokens"],
        "stream": False,
    }
    if transport is ProtocolTransport.JSON_OBJECT:
        payload["response_format"] = {"type": "json_object"}
    else:
        payload["tools"] = strict_action_tools(variant)
        payload["tool_choice"] = "required"
    return payload


def strict_action_tools(variant: AgentVariant) -> list[dict[str, object]]:
    thought_properties: dict[str, object] = {}
    thought_required: list[str] = []
    if variant is AgentVariant.REACT:
        thought_properties = {
            "thought": {
                "type": "string",
                "description": "A non-empty action-relevant working note, at most 1000 characters.",
            }
        }
        thought_required = ["thought"]

    def tool(name: str, description: str, field: str, field_description: str) -> dict[str, object]:
        return {
            "type": "function",
            "function": {
                "name": name,
                "strict": True,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        **thought_properties,
                        field: {"type": "string", "description": field_description},
                    },
                    "required": [*thought_required, field],
                    "additionalProperties": False,
                },
            },
        }

    return [
        tool("bash", "Run one bash command in the isolated repository.", "command", "The exact non-empty bash command to execute."),
        tool("finish", "Finish when the repository patch is ready.", "output", "A concise final status message."),
    ]


def assess_provider_response(
    response: Mapping[str, object],
    *,
    transport: ProtocolTransport,
    variant: AgentVariant,
    max_thought_chars: int = 1_000,
) -> ProtocolAssessment:
    message, envelope_failure = _single_message(response)
    if envelope_failure is not None:
        return _failure("L1", envelope_failure)
    assert message is not None
    if transport is ProtocolTransport.JSON_OBJECT:
        content = message.get("content")
        if not isinstance(content, str):
            return _failure("L1", "l1.content_not_text")
        try:
            document = json.loads(content)
        except json.JSONDecodeError:
            return _failure("L1", "l1.invalid_json")
        if not isinstance(document, dict):
            return _failure("L1", "l1.action_not_object")
        return _assess_json_action(
            cast(dict[str, object], document),
            variant=variant,
            max_thought_chars=max_thought_chars,
        )
    return _assess_strict_action(
        message,
        variant=variant,
        max_thought_chars=max_thought_chars,
    )


def unavailable_assessment(code: str) -> ProtocolAssessment:
    if not code.startswith("l0."):
        raise ValueError("unavailable response code must be an L0 failure")
    return ProtocolAssessment(False, False, False, False, code, None)


def decode_provider_body(exchange: HttpExchange) -> tuple[Mapping[str, object] | None, str | None]:
    if exchange.status_code < 200 or exchange.status_code >= 300:
        return None, f"l0.http_{exchange.status_code}"
    try:
        value = json.loads(exchange.response_body.decode("utf-8"))
    except UnicodeDecodeError:
        return None, "l0.response_not_utf8"
    except json.JSONDecodeError:
        return None, "l0.response_not_json"
    if not isinstance(value, dict):
        return None, "l0.response_not_object"
    return cast(Mapping[str, object], value), None


def execute_protocol_call(
    *,
    api_key: str,
    endpoint: str,
    payload: Mapping[str, object],
    variant: AgentVariant,
    protocol_transport: ProtocolTransport,
    artifact_root: Path,
    call_label: str,
    timeout_seconds: float,
    http_transport: RawHttpTransport | None = None,
) -> dict[str, object]:
    if not api_key or api_key.isspace():
        raise ValueError("DeepSeek API key cannot be empty")
    if not endpoint.startswith("https://"):
        raise ValueError("provider endpoint must use HTTPS")
    if not re.fullmatch(r"[a-z][a-z0-9_-]*", call_label):
        raise ValueError("invalid provider call label")
    artifact_root.mkdir(parents=True, exist_ok=True)
    request_path = artifact_root / f"{call_label}.request.json"
    response_path = artifact_root / f"{call_label}.response.body"
    request_bytes = json.dumps(
        payload,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ).encode("utf-8") + b"\n"
    if api_key.encode("utf-8") in request_bytes:
        raise ValueError("credential leaked into provider request payload")
    _write_exclusive(request_path, request_bytes)
    requested_at = datetime.now(UTC)
    started = time.monotonic()
    client = http_transport or UrllibRawHttpTransport()
    try:
        exchange = client.post(
            url=endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "workspace-agent-harness/protocol-reliability-v1",
            },
            payload=payload,
            timeout_seconds=timeout_seconds,
        )
    except Exception as error:
        finished_at = datetime.now(UTC)
        assessment = unavailable_assessment("l0.transport_error")
        return {
            "call_label": call_label,
            "requested_at_utc": requested_at.isoformat(),
            "finished_at_utc": finished_at.isoformat(),
            "duration_seconds": time.monotonic() - started,
            "endpoint": endpoint,
            "http_status": None,
            "transport_error_type": type(error).__name__,
            "request_path": request_path.name,
            "request_sha256": "sha256:" + sha256_hex(request_bytes),
            "response_path": None,
            "response_sha256": None,
            "response_credential_redacted": False,
            "assessment": assessment.as_dict(),
            "provider": _empty_provider_metadata(cast(str, payload.get("model"))),
        }
    response_body = exchange.response_body
    credential_redacted = api_key.encode("utf-8") in response_body
    if credential_redacted:
        response_body = response_body.replace(api_key.encode("utf-8"), b"[REDACTED]")
    _write_exclusive(response_path, response_body)
    finished_at = datetime.now(UTC)
    response, l0_failure = decode_provider_body(
        HttpExchange(exchange.status_code, response_body)
    )
    if l0_failure is not None:
        assessment = unavailable_assessment(l0_failure)
        provider = _empty_provider_metadata(cast(str, payload.get("model")))
    else:
        assert response is not None
        assessment = assess_provider_response(
            response,
            transport=protocol_transport,
            variant=variant,
        )
        provider = provider_metadata(response, cast(str, payload.get("model")))
    return {
        "call_label": call_label,
        "requested_at_utc": requested_at.isoformat(),
        "finished_at_utc": finished_at.isoformat(),
        "duration_seconds": time.monotonic() - started,
        "endpoint": endpoint,
        "http_status": exchange.status_code,
        "transport_error_type": None,
        "request_path": request_path.name,
        "request_sha256": "sha256:" + sha256_hex(request_bytes),
        "response_path": response_path.name,
        "response_sha256": "sha256:" + sha256_hex(response_body),
        "response_credential_redacted": credential_redacted,
        "assessment": assessment.as_dict(),
        "provider": provider,
    }


def provider_metadata(
    response: Mapping[str, object],
    requested_model: str,
) -> dict[str, object]:
    usage = response.get("usage")
    usage_value = usage if isinstance(usage, Mapping) else {}
    choice_finish_reason: str | None = None
    choices = response.get("choices")
    if isinstance(choices, list) and len(choices) == 1 and isinstance(choices[0], Mapping):
        candidate = choices[0].get("finish_reason")
        if isinstance(candidate, str):
            choice_finish_reason = candidate
    return {
        "requested_model": requested_model,
        "returned_model": response.get("model") if isinstance(response.get("model"), str) else None,
        "system_fingerprint": (
            response.get("system_fingerprint")
            if isinstance(response.get("system_fingerprint"), str)
            else None
        ),
        "finish_reason": choice_finish_reason,
        "usage": {
            "prompt_tokens": _optional_nonnegative_int(usage_value.get("prompt_tokens")),
            "completion_tokens": _optional_nonnegative_int(usage_value.get("completion_tokens")),
            "total_tokens": _optional_nonnegative_int(usage_value.get("total_tokens")),
        },
    }


def extract_context_corpus(
    *,
    run_root: Path,
    source_config_hash: str,
    source_manifest_hash: str,
    selection_seed: str,
) -> dict[str, object]:
    failures: dict[str, dict[str, object]] = {}
    valid_candidates: dict[str, dict[str, object]] = {}
    trace_paths = sorted(run_root.glob("*/trace.jsonl"))
    if len(trace_paths) != 30:
        raise ValueError("source run must contain exactly 30 Trace files")
    for trace_path in trace_paths:
        attempt_id = trace_path.parent.name
        variant = _variant_from_attempt_id(attempt_id)
        events = _read_trace(trace_path)
        started = events[0]
        if started.get("event_type") != "run_started":
            raise ValueError(f"{attempt_id}: Trace must begin with run_started")
        started_payload = _mapping(started.get("payload"), "run_started payload")
        prompt = started_payload.get("prompt")
        if not isinstance(prompt, str):
            raise ValueError(f"{attempt_id}: run prompt is missing")
        messages: list[dict[str, str]] = [{"role": "user", "content": prompt}]
        call_depth = 0
        pending_output: str | None = None
        terminal: Mapping[str, object] | None = None
        for event in events[1:]:
            event_type = event.get("event_type")
            payload = _mapping(event.get("payload"), "Trace payload")
            if event_type == "model_output":
                if pending_output is not None:
                    raise ValueError(f"{attempt_id}: consecutive model outputs")
                content = payload.get("content")
                if not isinstance(content, str):
                    raise ValueError(f"{attempt_id}: model output is not text")
                call_depth += 1
                identity = _context_identity(variant, messages)
                candidate = valid_candidates.setdefault(
                    identity,
                    _context_record(
                        variant=variant,
                        messages=messages,
                        call_depth=call_depth,
                        cohort="control",
                    ),
                )
                _append_source(candidate, attempt_id, trace_path, call_depth)
                pending_output = content
            elif event_type == "tool_completed":
                if pending_output is None:
                    raise ValueError(f"{attempt_id}: tool observation lacks model output")
                observation = payload.get("observation")
                tool_name = payload.get("tool")
                if not isinstance(observation, str):
                    raise ValueError(f"{attempt_id}: observation is not text")
                label = tool_name if isinstance(tool_name, str) else "tool"
                messages.extend(
                    [
                        {"role": "assistant", "content": pending_output},
                        {
                            "role": "user",
                            "content": f"Observation from {label}:\n{observation}",
                        },
                    ]
                )
                pending_output = None
            elif event_type == "run_completed":
                terminal = _mapping(payload.get("result"), "run result")
        if terminal is None:
            raise ValueError(f"{attempt_id}: Trace has no terminal event")
        terminal_error = terminal.get("error")
        model_calls = terminal.get("model_calls")
        if terminal.get("status") == "model_error" and terminal_error in {
            "provider content is not valid JSON",
            "ReAct response requires a non-empty thought",
        }:
            if pending_output is not None:
                raise ValueError(f"{attempt_id}: terminal protocol failure follows unobserved valid output")
            if model_calls != call_depth + 1:
                raise ValueError(f"{attempt_id}: failed call depth cannot be reconstructed")
            failure_depth = call_depth + 1
            identity = _context_identity(variant, messages)
            failure_code = (
                "l1.invalid_json"
                if terminal_error == "provider content is not valid JSON"
                else "l2.react_thought"
            )
            candidate = failures.setdefault(
                identity,
                {
                    **_context_record(
                        variant=variant,
                        messages=messages,
                        call_depth=failure_depth,
                        cohort="challenge",
                    ),
                    "source_failure_code": failure_code,
                },
            )
            if candidate.get("source_failure_code") != failure_code:
                raise ValueError("one frozen context produced multiple source failure codes")
            _append_source(candidate, attempt_id, trace_path, failure_depth)
    if len(failures) != 16:
        raise ValueError(
            f"expected 16 unique terminal failure contexts, found {len(failures)}"
        )
    for identity in failures:
        valid_candidates.pop(identity, None)
    controls: list[dict[str, object]] = []
    for variant in AgentVariant:
        for band in ("call-1", "calls-2-5", "calls-6-15", "calls-16+"):
            eligible = [
                (identity, item)
                for identity, item in valid_candidates.items()
                if item["variant"] == variant.value and item["depth_band"] == band
            ]
            if not eligible:
                raise ValueError(f"no valid control for {variant.value}/{band}")
            selected_identity, selected = min(
                eligible,
                key=lambda pair: sha256_hex(
                    f"{selection_seed}\0{variant.value}\0{band}\0{pair[0]}".encode("utf-8")
                ),
            )
            selected = dict(selected)
            selected["selection_digest"] = "sha256:" + sha256_hex(
                f"{selection_seed}\0{variant.value}\0{band}\0{selected_identity}".encode("utf-8")
            )
            controls.append(selected)
    challenge = [failures[key] for key in sorted(failures)]
    contexts = [*challenge, *controls]
    for index, context in enumerate(contexts, start=1):
        context["context_id"] = f"prv1-c{index:02d}-{cast(str, context['context_sha256'])[7:19]}"
    corpus: dict[str, object] = {
        "schema": CORPUS_SCHEMA,
        "source": {
            "suite_id": "react-mvp-5",
            "run_root": ".runs/react-mvp-5",
            "config_hash": source_config_hash,
            "artifact_manifest_sha256": source_manifest_hash,
            "trace_count": len(trace_paths),
        },
        "selection": {
            "challenge": "all unique terminal protocol-failure pre-call contexts",
            "control": "minimum sha256(seed + NUL + variant + NUL + depth_band + NUL + context_identity) per stratum",
            "seed": selection_seed,
            "challenge_count": 16,
            "control_count": 8,
        },
        "contexts": contexts,
    }
    corpus["content_hash"] = content_hash(corpus)
    return corpus


def wilson_interval(successes: int, total: int, z: float = 1.959963984540054) -> tuple[float, float] | None:
    if total < 0 or successes < 0 or successes > total:
        raise ValueError("invalid Wilson interval counts")
    if total == 0:
        return None
    proportion = successes / total
    denominator = 1 + z * z / total
    centre = (proportion + z * z / (2 * total)) / denominator
    margin = z * math.sqrt(
        proportion * (1 - proportion) / total + z * z / (4 * total * total)
    ) / denominator
    return centre - margin, centre + margin


def content_hash(value: Mapping[str, object]) -> str:
    material = dict(value)
    material.pop("content_hash", None)
    return "sha256:" + sha256_hex(canonical_json_bytes(material))


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _assess_json_action(
    document: Mapping[str, object],
    *,
    variant: AgentVariant,
    max_thought_chars: int,
) -> ProtocolAssessment:
    thought_failure = _thought_failure(document, variant, max_thought_chars)
    if thought_failure:
        return _failure("L2", thought_failure)
    action_type = document.get("type")
    if action_type not in {"tool", "final"}:
        return _failure("L2", "l2.action_type")
    thought_field = {"thought"} if variant is AgentVariant.REACT else set()
    if action_type == "tool":
        if set(document) != {"type", "tool", "arguments", *thought_field}:
            return _failure("L2", "l2.tool_fields")
        if not isinstance(document.get("tool"), str):
            return _failure("L2", "l2.tool_name_type")
        arguments = document.get("arguments")
        if not isinstance(arguments, dict) or set(arguments) != {"command"}:
            return _failure("L2", "l2.bash_arguments")
        command = arguments.get("command")
        if not isinstance(command, str):
            return _failure("L2", "l2.command_type")
        if document.get("tool") != "bash":
            return _failure("L3", "l3.unsupported_tool")
        if not command.strip():
            return _failure("L3", "l3.empty_command")
    else:
        if set(document) != {"type", "output", *thought_field}:
            return _failure("L2", "l2.final_fields")
        if not isinstance(document.get("output"), str):
            return _failure("L2", "l2.output_type")
    canonical = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return ProtocolAssessment(True, True, True, True, None, canonical)


def _assess_strict_action(
    message: Mapping[str, object],
    *,
    variant: AgentVariant,
    max_thought_chars: int,
) -> ProtocolAssessment:
    tool_calls = message.get("tool_calls")
    if not isinstance(tool_calls, list):
        return _failure("L1", "l1.tool_calls_missing")
    if len(tool_calls) != 1:
        return _failure("L2", "l2.action_count")
    call = tool_calls[0]
    if not isinstance(call, Mapping):
        return _failure("L1", "l1.tool_call_not_object")
    function = call.get("function")
    if call.get("type") != "function" or not isinstance(function, Mapping):
        return _failure("L1", "l1.function_envelope")
    name = function.get("name")
    arguments_text = function.get("arguments")
    if not isinstance(name, str):
        return _failure("L1", "l1.function_name_not_text")
    if not isinstance(arguments_text, str):
        return _failure("L1", "l1.arguments_not_text")
    try:
        arguments = json.loads(arguments_text)
    except json.JSONDecodeError:
        return _failure("L1", "l1.invalid_arguments_json")
    if not isinstance(arguments, dict):
        return _failure("L1", "l1.arguments_not_object")
    if name not in {"bash", "finish"}:
        return _failure("L2", "l2.function_name")
    thought_failure = _thought_failure(arguments, variant, max_thought_chars)
    if thought_failure:
        return _failure("L2", thought_failure)
    thought_field = {"thought"} if variant is AgentVariant.REACT else set()
    if name == "bash":
        if set(arguments) != {"command", *thought_field}:
            return _failure("L2", "l2.bash_arguments")
        command = arguments.get("command")
        if not isinstance(command, str):
            return _failure("L2", "l2.command_type")
        if not command.strip():
            return _failure("L3", "l3.empty_command")
        document: dict[str, object] = {
            "type": "tool",
            "tool": "bash",
            "arguments": {"command": command},
        }
    else:
        if set(arguments) != {"output", *thought_field}:
            return _failure("L2", "l2.finish_arguments")
        output = arguments.get("output")
        if not isinstance(output, str):
            return _failure("L2", "l2.output_type")
        document = {"type": "final", "output": output}
    if variant is AgentVariant.REACT:
        document["thought"] = arguments["thought"]
    canonical = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return ProtocolAssessment(True, True, True, True, None, canonical)


def _thought_failure(
    value: Mapping[str, object],
    variant: AgentVariant,
    max_chars: int,
) -> str | None:
    if variant is AgentVariant.ACT_ONLY:
        return "l2.act_only_thought" if "thought" in value else None
    thought = value.get("thought")
    if not isinstance(thought, str) or not thought.strip():
        return "l2.react_thought"
    if len(thought) > max_chars:
        return "l2.react_thought_too_long"
    return None


def _single_message(
    response: Mapping[str, object],
) -> tuple[Mapping[str, object] | None, str | None]:
    choices = response.get("choices")
    if not isinstance(choices, list) or len(choices) != 1:
        return None, "l1.choice_envelope"
    choice = choices[0]
    if not isinstance(choice, Mapping):
        return None, "l1.choice_not_object"
    message = choice.get("message")
    if not isinstance(message, Mapping):
        return None, "l1.message_missing"
    return cast(Mapping[str, object], message), None


def _failure(level: str, code: str) -> ProtocolAssessment:
    rank = {"L1": 1, "L2": 2, "L3": 3}[level]
    return ProtocolAssessment(
        response_available=True,
        carrier_syntax_valid=rank > 1,
        action_schema_valid=rank > 2,
        canonical_action_valid=False,
        earliest_failure_code=code,
        canonical_action=None,
    )


def _previous_message_material(response: Mapping[str, object]) -> object:
    choices = response.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], Mapping):
        message = choices[0].get("message")
        if isinstance(message, Mapping):
            return dict(message)
    return dict(response)


def _read_hashed_object(path: Path, schema: str, label: str) -> dict[str, object]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"protocol {label} must be a JSON object")
    if value.get("schema") != schema:
        raise ValueError(f"unsupported protocol {label} schema")
    declared_hash = value.get("content_hash")
    if not isinstance(declared_hash, str) or declared_hash != content_hash(value):
        raise ValueError(f"protocol {label} content hash mismatch")
    return cast(dict[str, object], value)


def _validate_frozen_messages(messages: Sequence[object], context_id: str) -> None:
    for message in messages:
        value = _mapping(message, "frozen message")
        if set(value) != {"role", "content"}:
            raise ValueError(f"{context_id}: frozen messages require role/content only")
        if value.get("role") not in {"user", "assistant"}:
            raise ValueError(f"{context_id}: invalid frozen message role")
        if not isinstance(value.get("content"), str):
            raise ValueError(f"{context_id}: frozen message content must be text")


def _variant_from_attempt_id(attempt_id: str) -> AgentVariant:
    if re.search(r"-act-only-r[1-9][0-9]*$", attempt_id):
        return AgentVariant.ACT_ONLY
    if re.search(r"-react-r[1-9][0-9]*$", attempt_id):
        return AgentVariant.REACT
    raise ValueError(f"cannot derive variant from attempt ID: {attempt_id}")


def _read_trace(path: Path) -> list[Mapping[str, object]]:
    events: list[Mapping[str, object]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"{path}: Trace event must be an object")
        events.append(cast(Mapping[str, object], value))
    if not events:
        raise ValueError(f"{path}: Trace is empty")
    return events


def _context_identity(variant: AgentVariant, messages: Sequence[Mapping[str, str]]) -> str:
    return sha256_hex(canonical_json_bytes({"variant": variant.value, "messages": list(messages)}))


def _context_record(
    *,
    variant: AgentVariant,
    messages: Sequence[Mapping[str, str]],
    call_depth: int,
    cohort: str,
) -> dict[str, object]:
    identity = _context_identity(variant, messages)
    return {
        "cohort": cohort,
        "variant": variant.value,
        "call_depth": call_depth,
        "depth_band": _depth_band(call_depth),
        "context_sha256": "sha256:" + identity,
        "messages": [dict(message) for message in messages],
        "source_attempt_ids": [],
        "source_trace_sha256s": [],
        "source_call_depths": [],
    }


def _append_source(
    candidate: dict[str, object],
    attempt_id: str,
    trace_path: Path,
    call_depth: int,
) -> None:
    attempts = cast(list[str], candidate["source_attempt_ids"])
    hashes = cast(list[str], candidate["source_trace_sha256s"])
    depths = cast(list[int], candidate["source_call_depths"])
    if attempt_id not in attempts:
        attempts.append(attempt_id)
        hashes.append("sha256:" + sha256_hex(trace_path.read_bytes()))
        depths.append(call_depth)


def _depth_band(call_depth: int) -> str:
    if call_depth == 1:
        return "call-1"
    if 2 <= call_depth <= 5:
        return "calls-2-5"
    if 6 <= call_depth <= 15:
        return "calls-6-15"
    if call_depth >= 16:
        return "calls-16+"
    raise ValueError("call depth must be positive")


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


def _empty_provider_metadata(requested_model: str) -> dict[str, object]:
    return {
        "requested_model": requested_model,
        "returned_model": None,
        "system_fingerprint": None,
        "finish_reason": None,
        "usage": {
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
        },
    }


def _optional_nonnegative_int(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    return None


def _write_exclusive(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as handle:
        handle.write(value)


__all__ = [
    "CONFIG_SCHEMA",
    "CORPUS_SCHEMA",
    "HttpExchange",
    "ProtocolAssessment",
    "ProtocolTransport",
    "RawHttpTransport",
    "UrllibRawHttpTransport",
    "assess_provider_response",
    "build_request_payload",
    "canonical_json_bytes",
    "content_hash",
    "decode_provider_body",
    "execute_protocol_call",
    "extract_context_corpus",
    "load_protocol_config",
    "provider_metadata",
    "sha256_hex",
    "strict_action_tools",
    "unavailable_assessment",
    "wilson_interval",
]
