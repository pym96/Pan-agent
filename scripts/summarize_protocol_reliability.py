#!/usr/bin/env python3
"""Deterministically summarize protocol-reliability-v1 artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Mapping, cast

from workspace_agent_harness.protocol_reliability import (
    ProtocolTransport,
    load_protocol_config,
    wilson_interval,
)


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
    summary = summarize(CONFIG_PATH, CORPUS_PATH, args.run_root)
    rendered = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output is None:
        print(rendered, end="")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as handle:
            handle.write(rendered)
        print(args.output)
    return 0


def summarize(
    config_path: Path,
    corpus_path: Path,
    run_root: Path,
) -> dict[str, object]:
    config, corpus = load_protocol_config(config_path, corpus_path)
    experiment = _mapping(config["experiment"], "experiment")
    repetitions = cast(int, experiment["repetitions"])
    contexts = cast(list[object], corpus["contexts"])
    slots: list[dict[str, object]] = []
    for item in contexts:
        context = _mapping(item, "context")
        for transport in (
            ProtocolTransport.JSON_OBJECT,
            ProtocolTransport.STRICT_FUNCTION,
        ):
            for repetition in range(1, repetitions + 1):
                slots.append(
                    _read_slot(
                        run_root=run_root,
                        config=config,
                        corpus=corpus,
                        context=context,
                        transport=transport,
                        repetition=repetition,
                    )
                )
    scheme_rows = [
        row
        for slot in slots
        for row in cast(list[dict[str, object]], slot["scheme_rows"])
    ]
    raw_calls = [
        row
        for slot in slots
        for row in cast(list[dict[str, object]], slot["raw_calls"])
    ]
    completed_slots = [slot for slot in slots if slot["artifact_state"] == "complete"]
    return {
        "schema": "workspace-agent-harness/protocol-reliability-summary/v1",
        "experiment_id": config["experiment_id"],
        "config_hash": config["content_hash"],
        "context_corpus_hash": corpus["content_hash"],
        "run_root": _locator(run_root),
        "artifact_manifest_sha256": _artifact_manifest_sha256(run_root),
        "matrix": {
            "planned_original_slots": len(slots),
            "complete_attempts": len(completed_slots),
            "missing_or_incomplete_attempts": len(slots) - len(completed_slots),
            "original_provider_calls": sum(
                row["call_kind"] == "original" for row in raw_calls
            ),
            "repair_provider_calls": sum(
                row["call_kind"] == "repair" for row in raw_calls
            ),
        },
        "by_scheme": {
            scheme: _aggregate_scheme(
                [row for row in scheme_rows if row["scheme"] == scheme]
            )
            for scheme in ("J0", "J1", "S0", "S1")
        },
        "by_scheme_and_cohort": {
            scheme: {
                cohort: _aggregate_scheme(
                    [
                        row
                        for row in scheme_rows
                        if row["scheme"] == scheme and row["cohort"] == cohort
                    ]
                )
                for cohort in ("challenge", "control")
            }
            for scheme in ("J0", "J1", "S0", "S1")
        },
        "by_scheme_and_variant": {
            scheme: {
                variant: _aggregate_scheme(
                    [
                        row
                        for row in scheme_rows
                        if row["scheme"] == scheme and row["variant"] == variant
                    ]
                )
                for variant in ("act-only", "react")
            }
            for scheme in ("J0", "J1", "S0", "S1")
        },
        "raw_call_identity": _raw_call_identity(raw_calls),
        "slots": slots,
        "limitations": [
            "This measures one provider/model/protocol combination during the recorded time window, not persistent provider behavior.",
            "The 24 fixed contexts are correlated replay units from one five-case development smoke; Wilson intervals describe call proportions and do not remove context clustering.",
            "Protocol validity does not measure task correctness or SWE-bench resolution.",
            "Missing usage remains unknown and is excluded from token sums rather than filled with zero.",
        ],
    }


def _read_slot(
    *,
    run_root: Path,
    config: Mapping[str, object],
    corpus: Mapping[str, object],
    context: Mapping[str, object],
    transport: ProtocolTransport,
    repetition: int,
) -> dict[str, object]:
    attempt_id = _attempt_id(cast(str, context["context_id"]), transport, repetition)
    attempt_root = run_root / attempt_id
    attempt_path = attempt_root / "attempt.json"
    base: dict[str, object] = {
        "attempt_id": attempt_id,
        "context_id": context["context_id"],
        "cohort": context["cohort"],
        "variant": context["variant"],
        "call_depth": context["call_depth"],
        "depth_band": context["depth_band"],
        "transport": transport.value,
        "repetition": repetition,
        "attempt_root": _locator(attempt_root),
        "scheme_rows": [],
        "raw_calls": [],
    }
    if not attempt_path.is_file():
        base.update(
            {
                "artifact_state": "missing" if not attempt_root.exists() else "incomplete",
                "attempt_sha256": None,
                "repair_attempted": None,
            }
        )
        return base
    attempt = _read_object(attempt_path)
    expected = {
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
        "transport": transport.value,
        "repetition": repetition,
    }
    for field, value in expected.items():
        if attempt.get(field) != value:
            raise ValueError(f"{attempt_id}: {field} does not match frozen slot")
    calls = _mapping(attempt["calls"], "calls")
    raw_calls: list[dict[str, object]] = []
    call_values: dict[str, Mapping[str, object]] = {}
    for call_kind in ("original", "repair"):
        call = calls.get(call_kind)
        if call is None:
            continue
        call_value = _mapping(call, f"{call_kind} call")
        call_values[call_kind] = call_value
        _verify_call_artifacts(attempt_root, call_value, attempt_id)
        raw_calls.append(
            {
                "attempt_id": attempt_id,
                "call_kind": call_kind,
                "transport": transport.value,
                "cohort": context["cohort"],
                "variant": context["variant"],
                "requested_at_utc": call_value["requested_at_utc"],
                "finished_at_utc": call_value["finished_at_utc"],
                "endpoint": call_value["endpoint"],
                "http_status": call_value["http_status"],
                "provider": call_value["provider"],
                "assessment": call_value["assessment"],
            }
        )
    schemes = _mapping(attempt["scheme_results"], "scheme_results")
    expected_schemes = (
        {"J0", "J1"}
        if transport is ProtocolTransport.JSON_OBJECT
        else {"S0", "S1"}
    )
    if set(schemes) != expected_schemes:
        raise ValueError(f"{attempt_id}: scheme set does not match transport")
    scheme_rows: list[dict[str, object]] = []
    for scheme, value in schemes.items():
        result = _mapping(value, f"scheme {scheme}")
        assessment = _mapping(result["assessment"], "scheme assessment")
        repair_enabled = scheme in {"J1", "S1"}
        charged_calls = [call_values["original"]]
        if repair_enabled and "repair" in call_values:
            charged_calls.append(call_values["repair"])
        if result["provider_call_count"] != len(charged_calls):
            raise ValueError(f"{attempt_id}: scheme provider-call count mismatch")
        scheme_rows.append(
            {
                "attempt_id": attempt_id,
                "scheme": scheme,
                "cohort": context["cohort"],
                "variant": context["variant"],
                "depth_band": context["depth_band"],
                "repair_enabled": repair_enabled,
                "repair_attempted": attempt["repair_attempted"],
                "provider_call_count": result["provider_call_count"],
                "assessment": dict(assessment),
                "usage": _charged_usage(charged_calls),
            }
        )
    base.update(
        {
            "artifact_state": "complete",
            "attempt_sha256": "sha256:" + _sha256(attempt_path),
            "repair_attempted": attempt["repair_attempted"],
            "scheme_rows": scheme_rows,
            "raw_calls": raw_calls,
        }
    )
    return base


def _aggregate_scheme(rows: list[dict[str, object]]) -> dict[str, object]:
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
            for row in rows
        )
        unconditional[level] = _rate_record(successes, len(rows))
    conditional: dict[str, object] = {}
    for prior, current in zip(levels, levels[1:]):
        eligible = [
            row
            for row in rows
            if _mapping(row["assessment"], "assessment").get(prior) is True
        ]
        successes = sum(
            _mapping(row["assessment"], "assessment").get(current) is True
            for row in eligible
        )
        conditional[f"{current}|{prior}"] = _rate_record(successes, len(eligible))
    failures = Counter(
        cast(str, _mapping(row["assessment"], "assessment")["earliest_failure_code"])
        for row in rows
        if _mapping(row["assessment"], "assessment").get("earliest_failure_code")
        is not None
    )
    usage: dict[str, object] = {}
    for field in ("prompt_tokens", "completion_tokens", "total_tokens"):
        values = [
            _mapping(_mapping(row["usage"], "usage")[field], field)
            for row in rows
        ]
        usage[field] = {
            "complete_attempt_records": sum(value["complete"] is True for value in values),
            "attempt_denominator": len(values),
            "known_provider_calls": sum(cast(int, value["known_calls"]) for value in values),
            "provider_call_denominator": sum(cast(int, value["call_denominator"]) for value in values),
            "sum_known": sum(cast(int, value["known_sum"]) for value in values),
        }
    repair_rows = [
        row
        for row in rows
        if row["repair_enabled"] is True and row["repair_attempted"] is True
    ]
    repaired = sum(
        _mapping(row["assessment"], "assessment").get("l3_canonical_action_valid")
        is True
        for row in repair_rows
    )
    return {
        "attempts": len(rows),
        "provider_calls": sum(cast(int, row["provider_call_count"]) for row in rows),
        "unconditional": unconditional,
        "conditional": conditional,
        "earliest_failures": dict(sorted(failures.items())),
        "repair": {
            "attempted": len(repair_rows),
            "l3_valid_after_repair": repaired,
            "success_rate": _rate_record(repaired, len(repair_rows)),
        },
        "usage": usage,
    }


def _rate_record(successes: int, total: int) -> dict[str, object]:
    interval = wilson_interval(successes, total)
    return {
        "successes": successes,
        "denominator": total,
        "rate": successes / total if total else None,
        "wilson_95": (
            {"lower": interval[0], "upper": interval[1]}
            if interval is not None
            else None
        ),
    }


def _charged_usage(calls: list[Mapping[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for field in ("prompt_tokens", "completion_tokens", "total_tokens"):
        values: list[int] = []
        for call in calls:
            provider = _mapping(call["provider"], "provider")
            usage = _mapping(provider["usage"], "usage")
            value = usage.get(field)
            if isinstance(value, int):
                values.append(value)
        result[field] = {
            "known_sum": sum(values),
            "known_calls": len(values),
            "call_denominator": len(calls),
            "complete": len(values) == len(calls),
        }
    return result


def _raw_call_identity(rows: list[dict[str, object]]) -> dict[str, object]:
    timestamps = [
        cast(str, row[field])
        for row in rows
        for field in ("requested_at_utc", "finished_at_utc")
        if isinstance(row.get(field), str)
    ]
    fingerprints = Counter()
    returned_models = Counter()
    endpoints = Counter()
    http_statuses = Counter()
    for row in rows:
        provider = _mapping(row["provider"], "provider")
        fingerprint = provider.get("system_fingerprint")
        returned_model = provider.get("returned_model")
        if isinstance(fingerprint, str):
            fingerprints[fingerprint] += 1
        else:
            fingerprints["<missing>"] += 1
        if isinstance(returned_model, str):
            returned_models[returned_model] += 1
        else:
            returned_models["<missing>"] += 1
        endpoints[cast(str, row["endpoint"])] += 1
        http_statuses[str(row["http_status"])] += 1
    return {
        "measurement_window_utc": {
            "start": min(timestamps) if timestamps else None,
            "end": max(timestamps) if timestamps else None,
        },
        "system_fingerprints": dict(sorted(fingerprints.items())),
        "returned_models": dict(sorted(returned_models.items())),
        "endpoints": dict(sorted(endpoints.items())),
        "http_statuses": dict(sorted(http_statuses.items())),
    }


def _verify_call_artifacts(
    attempt_root: Path,
    call: Mapping[str, object],
    attempt_id: str,
) -> None:
    for prefix in ("request", "response"):
        locator = call.get(f"{prefix}_path")
        declared = call.get(f"{prefix}_sha256")
        if locator is None and declared is None and prefix == "response":
            continue
        if not isinstance(locator, str) or not isinstance(declared, str):
            raise ValueError(f"{attempt_id}: incomplete {prefix} artifact identity")
        path = attempt_root / locator
        if not path.is_file() or declared != "sha256:" + _sha256(path):
            raise ValueError(f"{attempt_id}: {prefix} artifact hash mismatch")


def _attempt_id(
    context_id: str,
    transport: ProtocolTransport,
    repetition: int,
) -> str:
    label = "json" if transport is ProtocolTransport.JSON_OBJECT else "strict"
    return f"{context_id}-{label}-r{repetition}"


def _artifact_manifest_sha256(root: Path) -> str | None:
    if not root.is_dir():
        return None
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(relative)
        digest.update(b"\0")
        digest.update(_sha256(path).encode("ascii"))
        digest.update(b"\n")
    return "sha256:" + digest.hexdigest()


def _read_object(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return cast(dict[str, object], value)


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _locator(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(resolved)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-root", type=Path, default=DEFAULT_RUN_ROOT)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
