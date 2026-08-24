#!/usr/bin/env python3
"""Run the frozen protocol-reliability-v1.1 max-token sensitivity matrix."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Mapping, cast

from workspace_agent_harness.protocol_max_token_sensitivity import (
    ATTEMPT_SCHEMA,
    build_sensitivity_payload,
    decode_call_response,
    load_sensitivity_config,
    ordered_slots,
    response_diagnostics,
    verify_source_observations,
)
from workspace_agent_harness.protocol_reliability import (
    ProtocolTransport,
    RawHttpTransport,
    execute_protocol_call,
)
from workspace_agent_harness.react_mvp import AgentVariant


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = (
    PROJECT_ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "protocol-reliability-v1.1-max-token-sensitivity.json"
)
PARENT_CONFIG_PATH = (
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
PARENT_RUN_ROOT = PROJECT_ROOT / ".runs" / "protocol-reliability-v1"
PARENT_SUMMARY_PATH = (
    PROJECT_ROOT / ".runs" / "protocol-reliability-v1-summary-with-call-coverage.json"
)
PRIOR_SENSITIVITY_SUMMARY_PATH = (
    PROJECT_ROOT / ".runs" / "protocol-reliability-v1.1-max-token-sensitivity-summary.json"
)
DEFAULT_RUN_ROOT = (
    PROJECT_ROOT / ".runs" / "protocol-reliability-v1.1-max-token-sensitivity"
)


def main() -> int:
    args = _parse_args()
    config, parent, corpus = load_sensitivity_config(
        args.config,
        PARENT_CONFIG_PATH,
        CORPUS_PATH,
    )
    source_verification = verify_source_observations(
        config,
        parent_run_root=PARENT_RUN_ROOT,
        parent_summary_path=PARENT_SUMMARY_PATH,
        prior_sensitivity_summary_path=PRIOR_SENSITIVITY_SUMMARY_PATH,
    )
    context_by_id = {
        cast(str, item["context_id"]): item
        for raw in cast(list[object], corpus["contexts"])
        if (item := _mapping(raw, "context"))
    }
    slots = ordered_slots(config)
    if args.context_id is not None:
        slots = [
            slot
            for slot in slots
            if slot == (args.context_id, args.max_tokens, args.repetition)
        ]
        if len(slots) != 1:
            raise SystemExit("requested slot is outside the frozen sensitivity matrix")
    if args.dry_run:
        print(
            json.dumps(
                {
                    "experiment_id": config["experiment_id"],
                    "config_hash": config["content_hash"],
                    "context_corpus_hash": corpus["content_hash"],
                    "source_verification": source_verification,
                    "selected_slots": len(slots),
                    "first_slots": [
                        {
                            "context_id": context_id,
                            "max_completion_tokens": max_tokens,
                            "repetition": repetition,
                        }
                        for context_id, max_tokens, repetition in slots[:5]
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
    run_root = args.run_root or PROJECT_ROOT / ".runs" / cast(str, config["experiment_id"])
    fingerprints = _existing_fingerprints(run_root, cast(str, config["content_hash"]))
    _reject_fingerprint_drift(fingerprints)
    completed_now = 0
    consecutive_l0_failures = 0
    limit = len(slots) if args.max_slots is None else args.max_slots
    for context_id, max_tokens, repetition in slots:
        if completed_now >= limit:
            break
        attempt_root = run_root / attempt_id(context_id, max_tokens, repetition)
        attempt_path = attempt_root / "attempt.json"
        if attempt_path.is_file():
            if args.context_id is not None:
                raise SystemExit(f"refusing to overwrite attempt: {attempt_root}")
            continue
        if attempt_root.exists():
            raise SystemExit(f"incomplete append-only attempt blocks continuation: {attempt_root}")
        result = run_slot(
            config=config,
            parent_config=parent,
            corpus=corpus,
            context=context_by_id[context_id],
            max_completion_tokens=max_tokens,
            repetition=repetition,
            api_key=api_key,
            attempt_root=attempt_root,
        )
        _add_fingerprint(fingerprints, result)
        completed_now += 1
        call = _mapping(result["call"], "call")
        assessment = _mapping(call["assessment"], "assessment")
        if assessment.get("l0_response_available") is True:
            consecutive_l0_failures = 0
        else:
            consecutive_l0_failures += 1
        provider = _mapping(call["provider"], "provider")
        print(
            json.dumps(
                {
                    "attempt_id": result["attempt_id"],
                    "finish_reason": provider.get("finish_reason"),
                    "failure": assessment.get("earliest_failure_code"),
                    "completion_tokens": _mapping(provider["usage"], "usage").get(
                        "completion_tokens"
                    ),
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            flush=True,
        )
        stop_rules = _mapping(_mapping(config["experiment"], "experiment")["stop_rules"], "stop_rules")
        if call.get("http_status") in cast(list[int], stop_rules["fatal_http_statuses"]):
            raise SystemExit(f"sensitivity matrix stopped after fatal HTTP status {call['http_status']}")
        if consecutive_l0_failures >= cast(int, stop_rules["stop_after_consecutive_l0_failures"]):
            raise SystemExit(
                f"sensitivity matrix stopped after {consecutive_l0_failures} consecutive L0 failures"
            )
        _reject_fingerprint_drift(fingerprints)
    return 0


def run_slot(
    *,
    config: Mapping[str, object],
    parent_config: Mapping[str, object],
    corpus: Mapping[str, object],
    context: Mapping[str, object],
    max_completion_tokens: int,
    repetition: int,
    api_key: str,
    attempt_root: Path,
    http_transport: RawHttpTransport | None = None,
) -> dict[str, object]:
    experiment = _mapping(config["experiment"], "experiment")
    model = _mapping(experiment["model"], "model")
    endpoint = model.get("endpoint")
    timeout_seconds = model.get("timeout_seconds")
    if not isinstance(endpoint, str) or not isinstance(timeout_seconds, (int, float)):
        raise ValueError("sensitivity endpoint or timeout is invalid")
    context_id = cast(str, context["context_id"])
    attempt_root.mkdir(parents=True)
    payload = build_sensitivity_payload(
        parent_config=parent_config,
        context=context,
        max_completion_tokens=max_completion_tokens,
    )
    call = execute_protocol_call(
        api_key=api_key,
        endpoint=endpoint,
        payload=payload,
        variant=AgentVariant.REACT,
        protocol_transport=ProtocolTransport.STRICT_FUNCTION,
        artifact_root=attempt_root,
        call_label="original",
        timeout_seconds=float(timeout_seconds),
        http_transport=http_transport,
    )
    response = decode_call_response(call, attempt_root)
    result: dict[str, object] = {
        "schema": ATTEMPT_SCHEMA,
        "experiment_id": config["experiment_id"],
        "config_hash": config["content_hash"],
        "parent_config_hash": parent_config["content_hash"],
        "context_corpus_hash": corpus["content_hash"],
        "attempt_id": attempt_id(context_id, max_completion_tokens, repetition),
        "context_id": context_id,
        "context_sha256": context["context_sha256"],
        "cohort": context["cohort"],
        "call_depth": context["call_depth"],
        "depth_band": context["depth_band"],
        "variant": "react",
        "transport": ProtocolTransport.STRICT_FUNCTION.value,
        "max_completion_tokens": max_completion_tokens,
        "repetition": repetition,
        "repair_attempted": False,
        "call": call,
        "diagnostics": response_diagnostics(response),
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    if api_key.encode("utf-8") in rendered:
        raise RuntimeError("credential leaked into sensitivity attempt artifact")
    with (attempt_root / "attempt.json").open("xb") as handle:
        handle.write(rendered)
    return result


def attempt_id(context_id: str, max_tokens: int, repetition: int) -> str:
    return f"{context_id}-strict-max{max_tokens}-r{repetition}"


def _existing_fingerprints(run_root: Path, config_hash: str) -> set[str]:
    fingerprints: set[str] = set()
    if not run_root.is_dir():
        return fingerprints
    for attempt_path in sorted(run_root.glob("*/attempt.json")):
        attempt = _mapping(json.loads(attempt_path.read_text(encoding="utf-8")), "existing attempt")
        if attempt.get("config_hash") != config_hash:
            raise SystemExit(f"existing attempt uses a different config hash: {attempt_path}")
        _add_fingerprint(fingerprints, attempt)
    return fingerprints


def _add_fingerprint(fingerprints: set[str], result: Mapping[str, object]) -> None:
    call = _mapping(result["call"], "call")
    provider = _mapping(call["provider"], "provider")
    fingerprint = provider.get("system_fingerprint")
    if isinstance(fingerprint, str) and fingerprint:
        fingerprints.add(fingerprint)


def _reject_fingerprint_drift(fingerprints: set[str]) -> None:
    if len(fingerprints) > 1:
        raise SystemExit("sensitivity matrix stopped after non-empty system_fingerprint drift")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--context-id")
    parser.add_argument("--max-tokens", type=int)
    parser.add_argument("--repetition", type=int)
    parser.add_argument("--run-root", type=Path)
    parser.add_argument("--max-slots", type=int)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    single_values = (args.context_id, args.max_tokens, args.repetition)
    if any(value is not None for value in single_values) and not all(
        value is not None for value in single_values
    ):
        parser.error("single-slot mode requires context-id, max-tokens, and repetition")
    if args.repetition is not None and not 1 <= args.repetition <= 5:
        parser.error("repetition must be in the frozen 1..5 range")
    if args.max_slots is not None and args.max_slots <= 0:
        parser.error("max-slots must be positive")
    return args


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


if __name__ == "__main__":
    raise SystemExit(main())
