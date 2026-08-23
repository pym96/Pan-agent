#!/usr/bin/env python3
"""Deterministically summarize the frozen react-mvp-5 local run artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Mapping, cast


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = (
    PROJECT_ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "react-mvp-5-v1.json"
)
DEFAULT_RUN_ROOT = PROJECT_ROOT / ".runs" / "react-mvp-5"


def main() -> int:
    args = _parse_args()
    summary = summarize(CONFIG_PATH, args.run_root)
    print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def summarize(config_path: Path, run_root: Path) -> dict[str, object]:
    config = _read_object(config_path)
    selection = _mapping(config["selection"], "selection")
    experiment = _mapping(config["experiment"], "experiment")
    instance_ids = _string_list(
        selection["ordered_instance_ids"],
        "ordered_instance_ids",
    )
    variants = _string_list(experiment["variants"], "variants")
    repetitions = experiment["repetitions"]
    if not isinstance(repetitions, int) or repetitions <= 0:
        raise ValueError("repetitions must be a positive integer")

    slots: list[dict[str, object]] = []
    for instance_id in instance_ids:
        for variant in variants:
            for repetition in range(1, repetitions + 1):
                slots.append(
                    _read_slot(
                        run_root=run_root,
                        suite_id=cast(str, config["suite_id"]),
                        config_hash=cast(str, config["content_hash"]),
                        instance_id=instance_id,
                        variant=variant,
                        repetition=repetition,
                    )
                )

    return {
        "schema": "workspace-agent-harness/react-mvp-summary/v1",
        "suite_id": config["suite_id"],
        "config_hash": config["content_hash"],
        "run_root": _locator(run_root),
        "artifact_manifest_sha256": _artifact_manifest_sha256(run_root),
        "overall": _aggregate(slots),
        "by_variant": {
            variant: _aggregate(
                [slot for slot in slots if slot["variant"] == variant]
            )
            for variant in variants
        },
        "by_instance": {
            instance_id: {
                variant: _aggregate(
                    [
                        slot
                        for slot in slots
                        if slot["instance_id"] == instance_id
                        and slot["variant"] == variant
                    ]
                )
                for variant in variants
            }
            for instance_id in instance_ids
        },
        "slots": slots,
        "limitations": [
            "Provider usage is retained only for responses that passed protocol validation.",
            "Attempt duration was not persisted by the v1 attempt writer.",
            "A slot without attempt.json is an infrastructure/artifact failure, not an unresolved task outcome.",
        ],
    }


def _read_slot(
    *,
    run_root: Path,
    suite_id: str,
    config_hash: str,
    instance_id: str,
    variant: str,
    repetition: int,
) -> dict[str, object]:
    safe_instance = instance_id.split("__", 1)[-1]
    attempt_id = f"{safe_instance}-{variant}-r{repetition}"
    attempt_root = run_root / attempt_id
    attempt_path = attempt_root / "attempt.json"
    trace_path = attempt_root / "trace.jsonl"
    base: dict[str, object] = {
        "attempt_id": attempt_id,
        "instance_id": instance_id,
        "variant": variant,
        "repetition": repetition,
        "attempt_root": _locator(attempt_root),
        "duration_seconds": None,
    }
    if not attempt_path.is_file():
        terminal = _trace_terminal(trace_path)
        base.update(
            {
                "artifact_state": "incomplete",
                "failure_class": "infrastructure_failure",
                "task_outcome_available": False,
                "resolved": None,
                "empty_patch": None,
                "official_completed": False,
                "terminal_status": terminal.get("status"),
                "terminal_error": terminal.get("error"),
                "steps": terminal.get("steps"),
                "model_calls": terminal.get("model_calls"),
                "provider_call_records": 0,
                "recorded_tokens": 0,
                "attempt_sha256": None,
                "trace_sha256": _sha256(trace_path) if trace_path.is_file() else None,
            }
        )
        return base

    attempt = _read_object(attempt_path)
    expected = {
        "suite_id": suite_id,
        "config_hash": config_hash,
        "instance_id": instance_id,
        "variant": variant,
        "repetition": repetition,
    }
    for field, value in expected.items():
        if attempt.get(field) != value:
            raise ValueError(f"{attempt_id}: {field} does not match frozen slot")

    run_result = _mapping(attempt["run_result"], "run_result")
    provider_calls = attempt["provider_calls"]
    if not isinstance(provider_calls, list):
        raise ValueError(f"{attempt_id}: provider_calls must be an array")
    recorded_tokens = 0
    provider_calls_with_total_tokens = 0
    for call in provider_calls:
        usage = _mapping(_mapping(call, "provider_call")["usage"], "usage")
        total_tokens = usage["total_tokens"]
        if total_tokens is None:
            continue
        if not isinstance(total_tokens, int) or total_tokens < 0:
            raise ValueError(f"{attempt_id}: invalid total_tokens")
        recorded_tokens += total_tokens
        provider_calls_with_total_tokens += 1

    timing = attempt.get("timing")
    duration_seconds: object = None
    if isinstance(timing, Mapping):
        duration_seconds = timing.get("total_seconds")

    evaluation_value = attempt.get("evaluation")
    if not isinstance(evaluation_value, Mapping):
        base.update(
            {
                "artifact_state": "incomplete",
                "failure_class": "infrastructure_failure",
                "task_outcome_available": False,
                "resolved": None,
                "empty_patch": None,
                "official_completed": False,
                "terminal_status": run_result["status"],
                "terminal_error": run_result["error"],
                "steps": run_result["steps"],
                "model_calls": run_result["model_calls"],
                "provider_call_records": len(provider_calls),
                "provider_calls_with_total_tokens": provider_calls_with_total_tokens,
                "recorded_tokens": recorded_tokens,
                "duration_seconds": duration_seconds,
                "attempt_sha256": _sha256(attempt_path),
                "trace_sha256": _sha256(trace_path),
            }
        )
        return base

    evaluation = cast(Mapping[str, object], evaluation_value)
    report = _mapping(evaluation["result"], "evaluation.result")

    infra_count = _report_count(report, "infra_failure_instances")
    ambiguous_count = _report_count(report, "ambiguous_failure_instances")
    evaluator_error_count = _report_count(report, "error_instances")
    runner_exit = evaluation["runner_exit_code"]
    task_outcome_available = (
        runner_exit == 0
        and infra_count == 0
        and ambiguous_count == 0
        and evaluator_error_count == 0
    )
    resolved = _report_count(report, "resolved_instances") == 1
    empty_patch = _report_count(report, "empty_patch_instances") == 1
    failure_class = "task_outcome"
    if not task_outcome_available:
        failure_class = "evaluator_or_infrastructure_failure"

    base.update(
        {
            "artifact_state": "complete",
            "failure_class": failure_class,
            "task_outcome_available": task_outcome_available,
            "resolved": resolved if task_outcome_available else None,
            "empty_patch": empty_patch,
            "official_completed": _report_count(report, "completed_instances") == 1,
            "terminal_status": run_result["status"],
            "terminal_error": run_result["error"],
            "steps": run_result["steps"],
            "model_calls": run_result["model_calls"],
            "provider_call_records": len(provider_calls),
            "provider_calls_with_total_tokens": provider_calls_with_total_tokens,
            "recorded_tokens": recorded_tokens,
            "duration_seconds": duration_seconds,
            "attempt_sha256": _sha256(attempt_path),
            "trace_sha256": _sha256(trace_path),
        }
    )
    return base


def _trace_terminal(trace_path: Path) -> Mapping[str, object]:
    if not trace_path.is_file():
        return {}
    terminal: Mapping[str, object] = {}
    for line in trace_path.read_text(encoding="utf-8").splitlines():
        event = _mapping(json.loads(line), "trace event")
        if event.get("event_type") != "run_completed":
            continue
        payload = _mapping(event["payload"], "run_completed payload")
        terminal = _mapping(payload["result"], "run result")
    return terminal


def _aggregate(slots: list[dict[str, object]]) -> dict[str, object]:
    task_slots = [slot for slot in slots if slot["task_outcome_available"]]
    resolved = sum(slot["resolved"] is True for slot in task_slots)
    model_calls = sum(
        cast(int, slot["model_calls"])
        for slot in slots
        if isinstance(slot["model_calls"], int)
    )
    provider_calls = sum(cast(int, slot["provider_call_records"]) for slot in slots)
    terminal_statuses = Counter(
        cast(str, slot["terminal_status"])
        for slot in slots
        if isinstance(slot["terminal_status"], str)
    )
    terminal_errors = Counter(
        cast(str, slot["terminal_error"])
        for slot in slots
        if isinstance(slot["terminal_error"], str)
    )
    return {
        "planned_slots": len(slots),
        "complete_attempt_artifacts": sum(
            slot["artifact_state"] == "complete" for slot in slots
        ),
        "task_outcomes": len(task_slots),
        "resolved": resolved,
        "not_resolved": len(task_slots) - resolved,
        "infrastructure_or_artifact_failures": sum(
            slot["failure_class"] == "infrastructure_failure" for slot in slots
        ),
        "official_completed": sum(slot["official_completed"] is True for slot in slots),
        "empty_patch": sum(slot["empty_patch"] is True for slot in slots),
        "nonempty_patch": sum(slot["empty_patch"] is False for slot in slots),
        "model_calls": model_calls,
        "provider_call_records": provider_calls,
        "provider_usage_call_coverage": f"{provider_calls}/{model_calls}",
        "provider_calls_with_total_tokens": sum(
            cast(int, slot.get("provider_calls_with_total_tokens", 0))
            for slot in slots
        ),
        "recorded_tokens": sum(cast(int, slot["recorded_tokens"]) for slot in slots),
        "duration_records": sum(
            isinstance(slot["duration_seconds"], (int, float)) for slot in slots
        ),
        "terminal_statuses": dict(sorted(terminal_statuses.items())),
        "terminal_errors": dict(sorted(terminal_errors.items())),
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-root", type=Path, default=DEFAULT_RUN_ROOT)
    return parser.parse_args()


def _read_object(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return cast(dict[str, object], value)


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


def _string_list(value: object, name: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"{name} must be an array of strings")
    return cast(list[str], value)


def _report_count(report: Mapping[str, object], field: str) -> int:
    value = report[field]
    if not isinstance(value, int) or value < 0:
        raise ValueError(f"{field} must be a non-negative integer")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact_manifest_sha256(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(relative)
        digest.update(b"\0")
        digest.update(_sha256(path).encode("ascii"))
        digest.update(b"\n")
    return "sha256:" + digest.hexdigest()


def _locator(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(resolved)


if __name__ == "__main__":
    raise SystemExit(main())
