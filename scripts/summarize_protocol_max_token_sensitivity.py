#!/usr/bin/env python3
"""Deterministically summarize the v1.1 max-token sensitivity artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Mapping, cast

from scripts.run_protocol_max_token_sensitivity import attempt_id
from workspace_agent_harness.protocol_max_token_sensitivity import (
    ATTEMPT_SCHEMA,
    decode_call_response,
    load_sensitivity_config,
    ordered_slots,
    response_diagnostics,
    verify_source_observations,
)
from workspace_agent_harness.protocol_reliability import wilson_interval


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "protocol-reliability-v1.1-max-token-sensitivity.json"
PARENT_CONFIG_PATH = PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "protocol-reliability-v1.json"
CORPUS_PATH = PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "protocol-reliability-v1-contexts.json"
PARENT_RUN_ROOT = PROJECT_ROOT / ".runs" / "protocol-reliability-v1"
PARENT_SUMMARY_PATH = PROJECT_ROOT / ".runs" / "protocol-reliability-v1-summary-with-call-coverage.json"
PRIOR_SENSITIVITY_SUMMARY_PATH = PROJECT_ROOT / ".runs" / "protocol-reliability-v1.1-max-token-sensitivity-summary.json"
DEFAULT_RUN_ROOT = PROJECT_ROOT / ".runs" / "protocol-reliability-v1.1-max-token-sensitivity"


def main() -> int:
    args = _parse_args()
    config, _, _ = load_sensitivity_config(args.config, PARENT_CONFIG_PATH, CORPUS_PATH)
    run_root = args.run_root or PROJECT_ROOT / ".runs" / cast(str, config["experiment_id"])
    result = summarize(run_root, config_path=args.config)
    rendered = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output is None:
        print(rendered, end="")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as handle:
            handle.write(rendered)
        print(args.output)
    return 0


def summarize(run_root: Path, *, config_path: Path = CONFIG_PATH) -> dict[str, object]:
    config, parent, corpus = load_sensitivity_config(config_path, PARENT_CONFIG_PATH, CORPUS_PATH)
    source_verification = verify_source_observations(
        config,
        parent_run_root=PARENT_RUN_ROOT,
        parent_summary_path=PARENT_SUMMARY_PATH,
        prior_sensitivity_summary_path=PRIOR_SENSITIVITY_SUMMARY_PATH,
    )
    contexts = {
        cast(str, item["context_id"]): item
        for raw in cast(list[object], corpus["contexts"])
        if (item := _mapping(raw, "context"))
    }
    rows = [
        _read_slot(
            run_root=run_root,
            config=config,
            parent=parent,
            corpus=corpus,
            context=contexts[context_id],
            max_tokens=max_tokens,
            repetition=repetition,
        )
        for context_id, max_tokens, repetition in ordered_slots(config)
    ]
    complete = [row for row in rows if row["artifact_state"] == "complete"]
    arms = cast(list[int], _mapping(config["experiment"], "experiment")["max_completion_token_arms"])
    context_ids = cast(list[str], _mapping(config["experiment"], "experiment")["ordered_context_ids"])
    return {
        "schema": "workspace-agent-harness/protocol-max-token-sensitivity-summary/v1",
        "experiment_id": config["experiment_id"],
        "config_hash": config["content_hash"],
        "parent_config_hash": parent["content_hash"],
        "context_corpus_hash": corpus["content_hash"],
        "run_root": _locator(run_root),
        "artifact_manifest_sha256": _artifact_manifest_sha256(run_root),
        "source_verification": source_verification,
        "matrix": {
            "planned_calls": len(rows),
            "complete_attempts": len(complete),
            "missing_or_incomplete_attempts": len(rows) - len(complete),
            "repair_calls": 0,
        },
        "by_max_completion_tokens": {
            str(arm): _aggregate([row for row in rows if row["max_completion_tokens"] == arm], arm)
            for arm in arms
        },
        "by_context_and_max_completion_tokens": {
            context_id: {
                str(arm): _aggregate(
                    [
                        row
                        for row in rows
                        if row["context_id"] == context_id and row["max_completion_tokens"] == arm
                    ],
                    arm,
                )
                for arm in arms
            }
            for context_id in context_ids
        },
        "provider_identity": _provider_identity(complete),
        "claim_boundary": config["claim_boundary"],
    }


def _read_slot(
    *,
    run_root: Path,
    config: Mapping[str, object],
    parent: Mapping[str, object],
    corpus: Mapping[str, object],
    context: Mapping[str, object],
    max_tokens: int,
    repetition: int,
) -> dict[str, object]:
    context_id = cast(str, context["context_id"])
    expected_id = attempt_id(context_id, max_tokens, repetition)
    attempt_root = run_root / expected_id
    attempt_path = attempt_root / "attempt.json"
    base: dict[str, object] = {
        "attempt_id": expected_id,
        "context_id": context_id,
        "cohort": context["cohort"],
        "max_completion_tokens": max_tokens,
        "repetition": repetition,
    }
    if not attempt_path.is_file():
        return {**base, "artifact_state": "missing"}
    attempt = _mapping(json.loads(attempt_path.read_text(encoding="utf-8")), "attempt")
    expected_fields = {
        "schema": ATTEMPT_SCHEMA,
        "experiment_id": config["experiment_id"],
        "config_hash": config["content_hash"],
        "parent_config_hash": parent["content_hash"],
        "context_corpus_hash": corpus["content_hash"],
        "attempt_id": expected_id,
        "context_id": context_id,
        "context_sha256": context["context_sha256"],
        "variant": "react",
        "transport": "strict_function",
        "max_completion_tokens": max_tokens,
        "repetition": repetition,
        "repair_attempted": False,
    }
    for field, expected in expected_fields.items():
        if attempt.get(field) != expected:
            raise ValueError(f"{expected_id}: attempt identity mismatch for {field}")
    call = _mapping(attempt.get("call"), "call")
    request_path = _artifact_path(attempt_root, call.get("request_path"), "request")
    if _sha256(request_path) != call.get("request_sha256"):
        raise ValueError(f"{expected_id}: request artifact hash mismatch")
    request = _mapping(json.loads(request_path.read_text(encoding="utf-8")), "request")
    if request.get("max_tokens") != max_tokens:
        raise ValueError(f"{expected_id}: request max_tokens does not match arm")
    if request.get("stream") is not False or request.get("tool_choice") != "required":
        raise ValueError(f"{expected_id}: request transport contract drifted")

    response_path_value = call.get("response_path")
    if response_path_value is not None:
        response_path = _artifact_path(attempt_root, response_path_value, "response")
        if _sha256(response_path) != call.get("response_sha256"):
            raise ValueError(f"{expected_id}: response artifact hash mismatch")
    response = decode_call_response(call, attempt_root)
    diagnostics = response_diagnostics(response)
    if attempt.get("diagnostics") != diagnostics:
        raise ValueError(f"{expected_id}: response diagnostics mismatch")
    provider = _mapping(call.get("provider"), "provider")
    usage = _mapping(provider.get("usage"), "usage")
    assessment = _mapping(call.get("assessment"), "assessment")
    return {
        **base,
        "artifact_state": "complete",
        "attempt_sha256": _sha256(attempt_path),
        "assessment": dict(assessment),
        "finish_reason": provider.get("finish_reason"),
        "returned_model": provider.get("returned_model"),
        "system_fingerprint": provider.get("system_fingerprint"),
        "usage": dict(usage),
        "diagnostics": diagnostics,
        "requested_at_utc": call.get("requested_at_utc"),
        "finished_at_utc": call.get("finished_at_utc"),
    }


def _aggregate(rows: list[dict[str, object]], arm: int) -> dict[str, object]:
    complete = [row for row in rows if row["artifact_state"] == "complete"]
    levels = (
        "l0_response_available",
        "l1_carrier_syntax_valid",
        "l2_action_schema_valid",
        "l3_canonical_action_valid",
    )
    unconditional: dict[str, object] = {}
    for level in levels:
        successes = sum(
            _mapping(row["assessment"], "assessment").get(level) is True
            for row in complete
        )
        interval = wilson_interval(successes, len(complete))
        unconditional[level] = {
            "successes": successes,
            "denominator": len(complete),
            "rate": successes / len(complete) if complete else None,
            "wilson_95": list(interval) if interval is not None else None,
        }
    failure_counts = Counter(
        cast(str, failure)
        for row in complete
        if isinstance(
            failure := _mapping(row["assessment"], "assessment").get("earliest_failure_code"),
            str,
        )
    )
    finish_reasons = Counter(
        cast(str, reason)
        for row in complete
        if isinstance(reason := row.get("finish_reason"), str)
    )
    usage = {
        field: _numeric_summary(
            [
                value
                for row in complete
                if isinstance(
                    value := _mapping(row["usage"], "usage").get(field),
                    int,
                )
            ],
            len(complete),
        )
        for field in ("prompt_tokens", "completion_tokens", "total_tokens")
    }
    diagnostics = [
        _mapping(row["diagnostics"], "diagnostics")
        for row in complete
    ]
    cap_hits = sum(
        row.get("finish_reason") == "length"
        and _mapping(row["usage"], "usage").get("completion_tokens") == arm
        for row in complete
    )
    return {
        "planned_attempts": len(rows),
        "complete_attempts": len(complete),
        "missing_or_incomplete_attempts": len(rows) - len(complete),
        "unconditional": unconditional,
        "earliest_failure_counts": dict(sorted(failure_counts.items())),
        "finish_reason_counts": dict(sorted(finish_reasons.items())),
        "cap_hits": cap_hits,
        "usage": usage,
        "runaway_diagnostics": {
            "attempts_with_dsml": sum(item.get("dsml_marker_count", 0) > 0 for item in diagnostics),
            "attempts_with_end_of_thinking": sum(
                item.get("end_of_thinking_marker_count", 0) > 0 for item in diagnostics
            ),
            "attempts_with_repeated_invoke_markers": sum(
                item.get("invoke_marker_count", 0) > 1 for item in diagnostics
            ),
            "dsml_marker_count": sum(cast(int, item["dsml_marker_count"]) for item in diagnostics),
            "end_of_thinking_marker_count": sum(
                cast(int, item["end_of_thinking_marker_count"]) for item in diagnostics
            ),
            "invoke_marker_count": sum(cast(int, item["invoke_marker_count"]) for item in diagnostics),
            "arguments_char_count": _numeric_summary(
                [cast(int, item["arguments_char_count"]) for item in diagnostics],
                len(diagnostics),
            ),
        },
    }


def _numeric_summary(values: list[int], denominator: int) -> dict[str, object]:
    return {
        "known": len(values),
        "denominator": denominator,
        "sum_known": sum(values),
        "minimum": min(values) if values else None,
        "maximum": max(values) if values else None,
        "mean_known": sum(values) / len(values) if values else None,
    }


def _provider_identity(rows: list[dict[str, object]]) -> dict[str, object]:
    models = Counter(
        cast(str, model)
        for row in rows
        if isinstance(model := row.get("returned_model"), str)
    )
    fingerprints = Counter(
        cast(str, fingerprint)
        for row in rows
        if isinstance(fingerprint := row.get("system_fingerprint"), str) and fingerprint
    )
    starts = [cast(str, row["requested_at_utc"]) for row in rows if isinstance(row.get("requested_at_utc"), str)]
    finishes = [cast(str, row["finished_at_utc"]) for row in rows if isinstance(row.get("finished_at_utc"), str)]
    return {
        "returned_model_counts": dict(sorted(models.items())),
        "system_fingerprint_counts": dict(sorted(fingerprints.items())),
        "measurement_started_at_utc": min(starts) if starts else None,
        "measurement_finished_at_utc": max(finishes) if finishes else None,
    }


def _artifact_manifest_sha256(run_root: Path) -> str | None:
    if not run_root.is_dir():
        return None
    entries = [
        {
            "path": path.relative_to(run_root).as_posix(),
            "sha256": _sha256(path),
        }
        for path in sorted(item for item in run_root.rglob("*") if item.is_file())
    ]
    encoded = json.dumps(entries, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def _artifact_path(root: Path, value: object, name: str) -> Path:
    if not isinstance(value, str) or Path(value).is_absolute() or ".." in Path(value).parts:
        raise ValueError(f"invalid {name} artifact path")
    path = root / value
    if not path.is_file():
        raise ValueError(f"missing {name} artifact")
    return path


def _sha256(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _locator(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--run-root", type=Path)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
