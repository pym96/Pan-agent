#!/usr/bin/env python3
"""Run frozen protocol-reliability-v1 fixed-context provider calls."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Mapping, cast

from workspace_agent_harness.protocol_reliability import (
    HttpExchange,
    RawHttpTransport,
    RESULT_SCHEMA,
    ProtocolTransport,
    build_request_payload,
    canonical_json_bytes,
    decode_provider_body,
    execute_protocol_call,
    load_protocol_config,
    sha256_hex,
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
DEFAULT_RUN_ROOT = PROJECT_ROOT / ".runs" / "protocol-reliability-v1"


def main() -> int:
    args = _parse_args()
    config, corpus = load_protocol_config(CONFIG_PATH, CORPUS_PATH)
    contexts = cast(list[object], corpus["contexts"])
    context_by_id = {
        cast(str, _mapping(item, "context")["context_id"]): _mapping(item, "context")
        for item in contexts
    }
    slots = _ordered_slots(config, context_by_id)
    if args.context_id:
        slots = [
            slot
            for slot in slots
            if slot[0] == args.context_id
            and slot[1] is ProtocolTransport(args.transport)
            and slot[2] == args.repetition
        ]
        if len(slots) != 1:
            raise SystemExit("requested slot is outside the frozen matrix")
    if args.dry_run:
        print(
            json.dumps(
                {
                    "experiment_id": config["experiment_id"],
                    "config_hash": config["content_hash"],
                    "context_corpus_hash": corpus["content_hash"],
                    "selected_slots": len(slots),
                    "first_slots": [
                        {
                            "context_id": context_id,
                            "transport": transport.value,
                            "repetition": repetition,
                        }
                        for context_id, transport, repetition in slots[:5]
                    ],
                },
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
        )
        return 0
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key.strip():
        raise SystemExit("DEEPSEEK_API_KEY is required")
    fingerprints = _existing_fingerprints(args.run_root, cast(str, config["content_hash"]))
    _reject_fingerprint_drift(fingerprints)
    limit = args.max_slots if args.max_slots is not None else len(slots)
    completed_now = 0
    consecutive_l0_failures = 0
    for context_id, transport, repetition in slots:
        if completed_now >= limit:
            break
        attempt_root = args.run_root / _attempt_id(context_id, transport, repetition)
        attempt_path = attempt_root / "attempt.json"
        if attempt_path.is_file():
            if args.context_id:
                raise SystemExit(f"refusing to overwrite attempt: {attempt_root}")
            continue
        if attempt_root.exists():
            raise SystemExit(f"incomplete append-only attempt blocks continuation: {attempt_root}")
        result = run_slot(
            config=config,
            corpus=corpus,
            context=context_by_id[context_id],
            protocol_transport=transport,
            repetition=repetition,
            api_key=api_key,
            attempt_root=attempt_root,
        )
        _add_result_fingerprints(fingerprints, result)
        completed_now += 1
        original = _mapping(result["calls"], "calls")
        original_call = _mapping(original["original"], "original call")
        original_assessment = _mapping(original_call["assessment"], "assessment")
        if original_assessment["l0_response_available"] is True:
            consecutive_l0_failures = 0
        else:
            consecutive_l0_failures += 1
        print(
            json.dumps(
                {
                    "attempt_id": result["attempt_id"],
                    "original_failure": original_assessment["earliest_failure_code"],
                    "repair_attempted": result["repair_attempted"],
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            flush=True,
        )
        status = original_call.get("http_status")
        stop_rules = _mapping(
            _mapping(config["experiment"], "experiment")["stop_rules"],
            "stop_rules",
        )
        fatal_statuses = stop_rules["fatal_http_statuses"]
        if isinstance(fatal_statuses, list) and status in fatal_statuses:
            raise SystemExit(f"formal matrix stopped after fatal HTTP status {status}")
        threshold = stop_rules["stop_after_consecutive_l0_failures"]
        if isinstance(threshold, int) and consecutive_l0_failures >= threshold:
            raise SystemExit(
                f"formal matrix stopped after {consecutive_l0_failures} consecutive L0 failures"
            )
        _reject_fingerprint_drift(fingerprints)
    return 0


def run_slot(
    *,
    config: Mapping[str, object],
    corpus: Mapping[str, object],
    context: Mapping[str, object],
    protocol_transport: ProtocolTransport,
    repetition: int,
    api_key: str,
    attempt_root: Path,
    http_transport: RawHttpTransport | None = None,
) -> dict[str, object]:
    experiment = _mapping(config["experiment"], "experiment")
    model = _mapping(experiment["model"], "model")
    endpoints = _mapping(model["endpoints"], "endpoints")
    endpoint = endpoints.get(protocol_transport.value)
    if not isinstance(endpoint, str):
        raise ValueError("frozen provider endpoint is missing")
    timeout_seconds = model["timeout_seconds"]
    if not isinstance(timeout_seconds, (int, float)) or timeout_seconds <= 0:
        raise ValueError("provider timeout must be positive")
    attempt_id = _attempt_id(
        cast(str, context["context_id"]),
        protocol_transport,
        repetition,
    )
    attempt_root.mkdir(parents=True)
    payload = build_request_payload(
        config=config,
        context=context,
        transport=protocol_transport,
    )
    original = execute_protocol_call(
        api_key=api_key,
        endpoint=endpoint,
        payload=payload,
        variant=AgentVariant(cast(str, context["variant"])),
        protocol_transport=protocol_transport,
        artifact_root=attempt_root,
        call_label="original",
        timeout_seconds=float(timeout_seconds),
        http_transport=http_transport,
    )
    original_assessment = _mapping(original["assessment"], "original assessment")
    failure_code = original_assessment.get("earliest_failure_code")
    repair: dict[str, object] | None = None
    repair_attempted = (
        original_assessment.get("l0_response_available") is True
        and isinstance(failure_code, str)
        and failure_code.startswith(("l1.", "l2.", "l3."))
    )
    if repair_attempted:
        response = _load_response(original, attempt_root)
        if response is None:
            raise RuntimeError("repair-eligible original call lacks a decoded response")
        repair_payload = build_request_payload(
            config=config,
            context=context,
            transport=protocol_transport,
            repair_failure_code=cast(str, failure_code),
            previous_response=response,
        )
        repair = execute_protocol_call(
            api_key=api_key,
            endpoint=endpoint,
            payload=repair_payload,
            variant=AgentVariant(cast(str, context["variant"])),
            protocol_transport=protocol_transport,
            artifact_root=attempt_root,
            call_label="repair",
            timeout_seconds=float(timeout_seconds),
            http_transport=http_transport,
        )
    no_repair_scheme = "J0" if protocol_transport is ProtocolTransport.JSON_OBJECT else "S0"
    repair_scheme = "J1" if protocol_transport is ProtocolTransport.JSON_OBJECT else "S1"
    effective_repair = repair if repair is not None else original
    result: dict[str, object] = {
        "schema": RESULT_SCHEMA,
        "experiment_id": config["experiment_id"],
        "config_hash": config["content_hash"],
        "context_corpus_hash": corpus["content_hash"],
        "attempt_id": attempt_id,
        "context_id": context["context_id"],
        "context_sha256": context["context_sha256"],
        "cohort": context["cohort"],
        "variant": context["variant"],
        "call_depth": context["call_depth"],
        "depth_band": context["depth_band"],
        "transport": protocol_transport.value,
        "repetition": repetition,
        "repair_attempted": repair_attempted,
        "calls": {
            "original": original,
            "repair": repair,
        },
        "scheme_results": {
            no_repair_scheme: _scheme_result(original, [original]),
            repair_scheme: _scheme_result(
                effective_repair,
                [original, repair] if repair is not None else [original],
            ),
        },
    }
    attempt_bytes = json.dumps(
        result,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ).encode("utf-8") + b"\n"
    if api_key.encode("utf-8") in attempt_bytes:
        raise RuntimeError("credential leaked into protocol attempt artifact")
    with (attempt_root / "attempt.json").open("xb") as handle:
        handle.write(attempt_bytes)
    return result


def _scheme_result(
    effective_call: Mapping[str, object],
    charged_calls: list[Mapping[str, object] | None],
) -> dict[str, object]:
    calls = [call for call in charged_calls if call is not None]
    usage_fields = ("prompt_tokens", "completion_tokens", "total_tokens")
    cumulative_usage: dict[str, int | None] = {}
    for field in usage_fields:
        values: list[int] = []
        complete = True
        for call in calls:
            provider = _mapping(call["provider"], "provider")
            usage = _mapping(provider["usage"], "usage")
            value = usage.get(field)
            if not isinstance(value, int):
                complete = False
                break
            values.append(value)
        cumulative_usage[field] = sum(values) if complete else None
    return {
        "effective_call_label": effective_call["call_label"],
        "assessment": effective_call["assessment"],
        "provider_call_count": len(calls),
        "cumulative_usage": cumulative_usage,
    }


def _load_response(
    call: Mapping[str, object],
    attempt_root: Path,
) -> Mapping[str, object] | None:
    response_name = call.get("response_path")
    status = call.get("http_status")
    if not isinstance(response_name, str) or not isinstance(status, int):
        return None
    body = (attempt_root / response_name).read_bytes()
    return decode_provider_body(HttpExchange(status, body))[0]


def _ordered_slots(
    config: Mapping[str, object],
    contexts: Mapping[str, Mapping[str, object]],
) -> list[tuple[str, ProtocolTransport, int]]:
    experiment = _mapping(config["experiment"], "experiment")
    order = _mapping(experiment["execution_order"], "execution_order")
    seed = order["seed"]
    repetitions = experiment["repetitions"]
    transports = experiment["transports"]
    if not isinstance(seed, str) or not isinstance(repetitions, int):
        raise ValueError("frozen execution order is invalid")
    if not isinstance(transports, list):
        raise ValueError("frozen transports must be an array")
    slots = [
        (context_id, ProtocolTransport(cast(str, transport)), repetition)
        for context_id in contexts
        for transport in transports
        for repetition in range(1, repetitions + 1)
    ]
    return sorted(
        slots,
        key=lambda slot: sha256_hex(
            f"{seed}\0{slot[0]}\0{slot[1].value}\0{slot[2]}".encode("utf-8")
        ),
    )


def _attempt_id(
    context_id: str,
    protocol_transport: ProtocolTransport,
    repetition: int,
) -> str:
    label = "json" if protocol_transport is ProtocolTransport.JSON_OBJECT else "strict"
    return f"{context_id}-{label}-r{repetition}"


def _existing_fingerprints(
    run_root: Path,
    config_hash: str,
) -> dict[ProtocolTransport, set[str]]:
    fingerprints = {transport: set() for transport in ProtocolTransport}
    if not run_root.is_dir():
        return fingerprints
    for attempt_path in sorted(run_root.glob("*/attempt.json")):
        value = json.loads(attempt_path.read_text(encoding="utf-8"))
        attempt = _mapping(value, "existing attempt")
        if attempt.get("config_hash") != config_hash:
            raise SystemExit(f"existing attempt uses a different config hash: {attempt_path}")
        _add_result_fingerprints(fingerprints, attempt)
    return fingerprints


def _add_result_fingerprints(
    fingerprints: dict[ProtocolTransport, set[str]],
    result: Mapping[str, object],
) -> None:
    transport = ProtocolTransport(cast(str, result["transport"]))
    calls = _mapping(result["calls"], "calls")
    for label in ("original", "repair"):
        call = calls.get(label)
        if call is None:
            continue
        provider = _mapping(_mapping(call, f"{label} call")["provider"], "provider")
        fingerprint = provider.get("system_fingerprint")
        if isinstance(fingerprint, str) and fingerprint:
            fingerprints[transport].add(fingerprint)


def _reject_fingerprint_drift(
    fingerprints: Mapping[ProtocolTransport, set[str]],
) -> None:
    drifted = [
        transport.value
        for transport, values in fingerprints.items()
        if len(values) > 1
    ]
    if drifted:
        raise SystemExit(
            "formal matrix stopped after system_fingerprint drift within transport: "
            + ", ".join(sorted(drifted))
        )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--context-id")
    parser.add_argument("--transport", choices=[item.value for item in ProtocolTransport])
    parser.add_argument("--repetition", type=int)
    parser.add_argument("--run-root", type=Path, default=DEFAULT_RUN_ROOT)
    parser.add_argument("--max-slots", type=int)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    single_values = (args.context_id, args.transport, args.repetition)
    if any(value is not None for value in single_values) and not all(
        value is not None for value in single_values
    ):
        parser.error("single-slot mode requires context-id, transport, and repetition")
    if args.max_slots is not None and args.max_slots <= 0:
        parser.error("max-slots must be positive")
    if args.repetition is not None and not 1 <= args.repetition <= 5:
        parser.error("repetition must be in the frozen 1..5 range")
    return args


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


if __name__ == "__main__":
    raise SystemExit(main())
