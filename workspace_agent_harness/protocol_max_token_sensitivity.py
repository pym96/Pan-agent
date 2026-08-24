from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, cast

from .protocol_reliability import (
    ProtocolTransport,
    build_request_payload,
    content_hash,
    decode_provider_body,
    load_protocol_config,
    sha256_hex,
    HttpExchange,
)


CONFIG_SCHEMA = "workspace-agent-harness/protocol-max-token-sensitivity/v1"
ATTEMPT_SCHEMA = "workspace-agent-harness/protocol-max-token-sensitivity-attempt/v1"


def load_sensitivity_config(
    config_path: Path,
    parent_config_path: Path,
    corpus_path: Path,
) -> tuple[Mapping[str, object], Mapping[str, object], Mapping[str, object]]:
    value = json.loads(Path(config_path).read_text(encoding="utf-8"))
    config = _mapping(value, "sensitivity configuration")
    if config.get("schema") != CONFIG_SCHEMA:
        raise ValueError("unsupported max-token sensitivity configuration schema")
    declared_hash = config.get("content_hash")
    if not isinstance(declared_hash, str) or declared_hash != content_hash(config):
        raise ValueError("max-token sensitivity configuration content hash mismatch")

    parent, corpus = load_protocol_config(parent_config_path, corpus_path)
    source = _mapping(config.get("source_experiment"), "source_experiment")
    if source.get("config_hash") != parent.get("content_hash"):
        raise ValueError("sensitivity parent configuration hash mismatch")
    if config.get("context_corpus_hash") != corpus.get("content_hash"):
        raise ValueError("sensitivity context corpus hash mismatch")

    experiment = _mapping(config.get("experiment"), "experiment")
    context_ids = experiment.get("ordered_context_ids")
    arms = experiment.get("max_completion_token_arms")
    repetitions = experiment.get("repetitions")
    if not isinstance(context_ids, list) or len(context_ids) != 5 or len(set(context_ids)) != 5:
        raise ValueError("max-token sensitivity requires five unique Context IDs")
    experiment_id = config.get("experiment_id")
    frozen_matrices = {
        "protocol-reliability-v1.1-max-token-sensitivity": ([2048, 4096, 8192], 75),
        "protocol-reliability-v1.2-max-token-16k-extension": ([16384], 25),
    }
    expected_matrix = frozen_matrices.get(experiment_id)
    if expected_matrix is None:
        raise ValueError("unsupported max-token sensitivity experiment identity")
    expected_arms, expected_calls = expected_matrix
    if arms != expected_arms:
        raise ValueError("max-token sensitivity arms drifted from the experiment identity")
    if repetitions != 5 or experiment.get("raw_call_count") != expected_calls:
        raise ValueError("max-token sensitivity matrix dimensions drifted")
    if experiment.get("transport") != ProtocolTransport.STRICT_FUNCTION.value:
        raise ValueError("max-token sensitivity must use Strict Function Calling")
    if experiment.get("variant") != "react" or experiment.get("repair") is not False:
        raise ValueError("max-token sensitivity must use ReAct without repair")

    corpus_contexts = {
        cast(str, item["context_id"]): item
        for raw in cast(list[object], corpus["contexts"])
        if (item := _mapping(raw, "context"))
    }
    if any(context_id not in corpus_contexts for context_id in context_ids):
        raise ValueError("sensitivity Context is absent from the frozen corpus")
    for context_id in context_ids:
        context = corpus_contexts[cast(str, context_id)]
        if context.get("variant") != "react":
            raise ValueError("every max-token sensitivity Context must be ReAct")

    model = _mapping(experiment.get("model"), "model")
    parent_model = _mapping(_mapping(parent["experiment"], "parent experiment")["model"], "parent model")
    for field in ("provider", "model_id", "thinking", "temperature", "stream", "timeout_seconds"):
        if model.get(field) != parent_model.get(field):
            raise ValueError(f"sensitivity model field drifted from parent: {field}")
    parent_endpoints = _mapping(parent_model["endpoints"], "parent endpoints")
    if model.get("endpoint") != parent_endpoints.get(ProtocolTransport.STRICT_FUNCTION.value):
        raise ValueError("sensitivity Strict endpoint drifted from parent")

    stop_rules = _mapping(experiment.get("stop_rules"), "stop_rules")
    if stop_rules.get("fatal_http_statuses") != [401, 402, 403]:
        raise ValueError("sensitivity fatal HTTP stops have drifted")
    if stop_rules.get("stop_after_consecutive_l0_failures") != 3:
        raise ValueError("sensitivity L0 stop threshold has drifted")
    return MappingProxyType(dict(config)), parent, corpus


def verify_source_observations(
    config: Mapping[str, object],
    *,
    parent_run_root: Path,
    parent_summary_path: Path,
    prior_sensitivity_summary_path: Path | None = None,
) -> dict[str, object]:
    source = _mapping(config["source_experiment"], "source_experiment")
    expected_summary_hash = source.get("corrected_summary_sha256")
    actual_summary_hash = "sha256:" + sha256_hex(parent_summary_path.read_bytes())
    if expected_summary_hash != actual_summary_hash:
        raise ValueError("parent corrected-summary hash mismatch")
    parent_summary = _mapping(
        json.loads(parent_summary_path.read_text(encoding="utf-8")),
        "parent summary",
    )
    if parent_summary.get("config_hash") != source.get("config_hash"):
        raise ValueError("parent summary configuration identity mismatch")
    if parent_summary.get("artifact_manifest_sha256") != source.get("artifact_manifest_sha256"):
        raise ValueError("parent raw-manifest identity mismatch")

    observed: Counter[str] = Counter()
    total_strict = 0
    for attempt_path in sorted(parent_run_root.glob("*/attempt.json")):
        attempt = _mapping(json.loads(attempt_path.read_text(encoding="utf-8")), "parent attempt")
        if attempt.get("config_hash") != source.get("config_hash"):
            raise ValueError("parent attempt configuration identity mismatch")
        if attempt.get("transport") != ProtocolTransport.STRICT_FUNCTION.value:
            continue
        total_strict += 1
        call = _mapping(_mapping(attempt["calls"], "calls")["original"], "original call")
        provider = _mapping(call["provider"], "provider")
        if provider.get("finish_reason") != "length":
            continue
        usage = _mapping(provider["usage"], "usage")
        assessment = _mapping(call["assessment"], "assessment")
        if usage.get("completion_tokens") != 2048:
            raise ValueError("parent length response did not hit the frozen 2048 cap")
        if assessment.get("earliest_failure_code") != "l1.invalid_arguments_json":
            raise ValueError("parent length response has an unexpected failure class")
        observed[cast(str, attempt["context_id"])] += 1

    expected_counts = source.get("length_hits_by_context")
    if not isinstance(expected_counts, Mapping) or dict(observed) != dict(expected_counts):
        raise ValueError("selected Contexts do not exactly cover parent length responses")
    if total_strict != 120 or sum(observed.values()) != 21:
        raise ValueError("parent Strict denominator or length count has drifted")
    result: dict[str, object] = {
        "strict_attempts": total_strict,
        "length_hits": sum(observed.values()),
        "length_hits_by_context": dict(sorted(observed.items())),
        "corrected_summary_sha256": actual_summary_hash,
    }
    prior = config.get("source_sensitivity")
    if prior is not None:
        prior_source = _mapping(prior, "source_sensitivity")
        if prior_sensitivity_summary_path is None or not prior_sensitivity_summary_path.is_file():
            raise ValueError("prior sensitivity summary is required for this extension")
        actual_prior_hash = "sha256:" + sha256_hex(prior_sensitivity_summary_path.read_bytes())
        if actual_prior_hash != prior_source.get("summary_sha256"):
            raise ValueError("prior sensitivity summary hash mismatch")
        prior_summary = _mapping(
            json.loads(prior_sensitivity_summary_path.read_text(encoding="utf-8")),
            "prior sensitivity summary",
        )
        if prior_summary.get("experiment_id") != prior_source.get("experiment_id"):
            raise ValueError("prior sensitivity experiment identity mismatch")
        if prior_summary.get("config_hash") != prior_source.get("config_hash"):
            raise ValueError("prior sensitivity configuration identity mismatch")
        if prior_summary.get("artifact_manifest_sha256") != prior_source.get("artifact_manifest_sha256"):
            raise ValueError("prior sensitivity raw-manifest identity mismatch")
        result["prior_sensitivity_summary_sha256"] = actual_prior_hash
        result["prior_sensitivity_artifact_manifest_sha256"] = prior_summary.get(
            "artifact_manifest_sha256"
        )
    return result


def ordered_slots(config: Mapping[str, object]) -> list[tuple[str, int, int]]:
    experiment = _mapping(config["experiment"], "experiment")
    context_ids = cast(list[str], experiment["ordered_context_ids"])
    arms = cast(list[int], experiment["max_completion_token_arms"])
    repetitions = cast(int, experiment["repetitions"])
    order = _mapping(experiment["execution_order"], "execution_order")
    seed = cast(str, order["seed"])
    slots = [
        (context_id, max_tokens, repetition)
        for context_id in context_ids
        for max_tokens in arms
        for repetition in range(1, repetitions + 1)
    ]
    return sorted(
        slots,
        key=lambda slot: sha256_hex(
            f"{seed}\0{slot[0]}\0{slot[1]}\0{slot[2]}".encode("utf-8")
        ),
    )


def build_sensitivity_payload(
    *,
    parent_config: Mapping[str, object],
    context: Mapping[str, object],
    max_completion_tokens: int,
) -> dict[str, object]:
    if max_completion_tokens not in {2048, 4096, 8192, 16384}:
        raise ValueError("max-token arm is outside the frozen sensitivity matrix")
    payload = build_request_payload(
        config=parent_config,
        context=context,
        transport=ProtocolTransport.STRICT_FUNCTION,
    )
    payload["max_tokens"] = max_completion_tokens
    return payload


def response_diagnostics(response: Mapping[str, object] | None) -> dict[str, object]:
    argument_strings: list[str] = []
    if response is not None:
        choices = response.get("choices")
        if isinstance(choices, list) and len(choices) == 1 and isinstance(choices[0], Mapping):
            message = choices[0].get("message")
            if isinstance(message, Mapping):
                tool_calls = message.get("tool_calls")
                if isinstance(tool_calls, list):
                    for raw_call in tool_calls:
                        if not isinstance(raw_call, Mapping):
                            continue
                        function = raw_call.get("function")
                        if not isinstance(function, Mapping):
                            continue
                        arguments = function.get("arguments")
                        if isinstance(arguments, str):
                            argument_strings.append(arguments)
    combined = "\n".join(argument_strings)
    return {
        "tool_call_count_with_string_arguments": len(argument_strings),
        "arguments_char_count": sum(len(item) for item in argument_strings),
        "dsml_marker_count": combined.count("DSML"),
        "end_of_thinking_marker_count": combined.count("end▁of▁thinking"),
        "invoke_marker_count": combined.count("invoke name="),
    }


def decode_call_response(
    call: Mapping[str, object],
    attempt_root: Path,
) -> Mapping[str, object] | None:
    response_path = call.get("response_path")
    status = call.get("http_status")
    if not isinstance(response_path, str) or not isinstance(status, int):
        return None
    return decode_provider_body(HttpExchange(status, (attempt_root / response_path).read_bytes()))[0]


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


__all__ = [
    "ATTEMPT_SCHEMA",
    "build_sensitivity_payload",
    "decode_call_response",
    "load_sensitivity_config",
    "ordered_slots",
    "response_diagnostics",
    "verify_source_observations",
]
