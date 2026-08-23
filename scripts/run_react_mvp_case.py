#!/usr/bin/env python3
"""Run and officially evaluate one pre-gated react-mvp-5 attempt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Mapping, cast

from datasets import load_dataset

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.react_mvp import (
    AgentVariant,
    SWEbenchDockerSession,
    load_react_mvp_config,
    run_react_mvp,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = (
    PROJECT_ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "react-mvp-5-v1.json"
)
DATASET_PATH = (
    PROJECT_ROOT
    / ".scratch"
    / "datasets"
    / "swe-bench-lite-b0dde1093fe417d83b7184254edf8199c1f0dff5"
    / "data"
    / "dev-00000-of-00001.parquet"
)
REPORT_ROOT = PROJECT_ROOT / ".scratch" / "react-mvp-gold-5"
SWE_BENCH = PROJECT_ROOT / ".scratch" / "venvs" / "swebench" / "bin" / "swebench"


def main() -> int:
    args = _parse_args()
    config = load_react_mvp_config(CONFIG_PATH)
    selection = _mapping(config["selection"], "selection")
    experiment = _mapping(config["experiment"], "experiment")
    images = _mapping(selection["images_by_instance_id"], "images_by_instance_id")
    image_digests = _mapping(
        selection["image_digests_by_instance_id"],
        "image_digests_by_instance_id",
    )
    image = images.get(args.instance_id)
    image_digest = image_digests.get(args.instance_id)
    if not isinstance(image, str) or not isinstance(image_digest, str):
        raise SystemExit(f"instance is not in react-mvp-5: {args.instance_id}")
    if not 1 <= args.repetition <= cast(int, experiment["repetitions"]):
        raise SystemExit("repetition is outside the frozen 1..3 range")

    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key.strip():
        raise SystemExit("DEEPSEEK_API_KEY is required")
    _verify_dataset(config)
    _verify_gold_gate(args.instance_id)
    _verify_image_present(image, image_digest)

    variant = AgentVariant(args.variant)
    safe_instance = args.instance_id.split("__", 1)[-1]
    attempt_id = f"{safe_instance}-{variant.value}-r{args.repetition}"
    attempt_root = PROJECT_ROOT / ".runs" / "react-mvp-5" / attempt_id
    if attempt_root.exists():
        raise SystemExit(f"refusing to overwrite attempt: {attempt_root}")
    attempt_root.mkdir(parents=True)

    row = _dataset_row(args.instance_id)
    prompt = (
        "Fix the repository issue below. Work only through the available bash tool. "
        "Inspect the repository, make the required code changes, and run relevant tests. "
        "Do not merely describe a patch; edit /testbed and finish when the patch is ready.\n\n"
        f"Issue:\n{row['problem_statement']}"
    )
    limits_value = _mapping(experiment["run_limits"], "run_limits")
    limits = RunLimits(
        max_steps=cast(int, limits_value["max_steps"]),
        max_model_calls=cast(int, limits_value["max_model_calls"]),
        timeout_seconds=cast(float, limits_value["timeout_seconds"]),
    )

    attempt_started = time.monotonic()
    patch_error: str | None = None
    with SWEbenchDockerSession(image=image, run_label=attempt_id) as session:
        run = run_react_mvp(
            task=Task(args.instance_id, prompt),
            variant=variant,
            api_key=api_key,
            container_name=session.container_name,
            trace_path=attempt_root / "trace.jsonl",
            artifact_root=attempt_root / "tool-artifacts",
            limits=limits,
        )
        try:
            patch = session.patch()
        except RuntimeError as error:
            patch = None
            patch_error = str(error)
    agent_duration_seconds = time.monotonic() - attempt_started

    model_name = f"deepseek-v4-flash-{variant.value}"
    summary_path = attempt_root / "attempt.json"
    summary = {
        "schema": "workspace-agent-harness/react-mvp-attempt/v1",
        "suite_id": config["suite_id"],
        "config_hash": config["content_hash"],
        "instance_id": args.instance_id,
        "image": image,
        "image_digest": image_digest,
        "variant": variant.value,
        "repetition": args.repetition,
        "run_result": {
            "run_id": run.result.run_id,
            "status": run.result.status.value,
            "output": run.result.output,
            "steps": run.result.steps,
            "model_calls": run.result.model_calls,
            "error": run.result.error,
        },
        "provider_calls": [
            {
                "request_index": call.request_index,
                "model": call.model,
                "system_fingerprint": call.system_fingerprint,
                "usage": {
                    "prompt_tokens": call.usage.prompt_tokens,
                    "completion_tokens": call.usage.completion_tokens,
                    "total_tokens": call.usage.total_tokens,
                },
            }
            for call in run.provider_calls
        ],
        "command_artifacts": [
            {
                "sequence": artifact.sequence,
                "command_sha256": artifact.command_sha256,
                "stdout": artifact.stdout_path.relative_to(attempt_root).as_posix(),
                "stdout_sha256": artifact.stdout_sha256,
                "stderr": artifact.stderr_path.relative_to(attempt_root).as_posix(),
                "stderr_sha256": artifact.stderr_sha256,
                "exit_code": artifact.exit_code,
                "timed_out": artifact.timed_out,
            }
            for artifact in run.command_artifacts
        ],
        "patch": None,
        "patch_sha256": None,
        "artifact_failure": None,
        "timing": {
            "agent_seconds": agent_duration_seconds,
            "evaluation_seconds": None,
            "total_seconds": None,
        },
        "evaluation": None,
    }
    if patch is None:
        summary["artifact_failure"] = {
            "stage": "patch_extraction",
            "error": patch_error,
        }
        cast(dict[str, object], summary["timing"])["total_seconds"] = (
            time.monotonic() - attempt_started
        )
        _write_json(summary_path, summary)
        return 3

    patch_path = attempt_root / "patch.diff"
    patch_path.write_text(patch, encoding="utf-8")
    prediction_path = attempt_root / "prediction.jsonl"
    prediction_path.write_text(
        json.dumps(
            {
                "instance_id": args.instance_id,
                "model_name_or_path": model_name,
                "model_patch": patch,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    summary["patch"] = "patch.diff"
    summary["patch_sha256"] = _sha256(patch_path)
    _write_json(summary_path, summary)

    eval_run_id = f"react-mvp-{attempt_id}"
    eval_root = attempt_root / "official-evaluation"
    eval_root.mkdir()
    evaluation_started = time.monotonic()
    completed = subprocess.run(
        (
            str(SWE_BENCH),
            "eval",
            str(DATASET_PATH),
            "--predictions",
            str(prediction_path),
            "-i",
            args.instance_id,
            "--run-id",
            eval_run_id,
            "-j",
            "1",
            "-t",
            "900",
            "--report-dir",
            str(eval_root),
        ),
        cwd=PROJECT_ROOT,
        check=False,
        capture_output=True,
        timeout=1_200,
    )
    evaluation_duration_seconds = time.monotonic() - evaluation_started
    (eval_root / "runner.stdout").write_bytes(completed.stdout)
    (eval_root / "runner.stderr").write_bytes(completed.stderr)
    report_path = eval_root / f"{model_name}.{eval_run_id}.json"
    report = (
        json.loads(report_path.read_text(encoding="utf-8"))
        if report_path.is_file()
        else None
    )
    summary["evaluation"] = {
        "runner_exit_code": completed.returncode,
        "report": report_path.relative_to(attempt_root).as_posix(),
        "report_sha256": _sha256(report_path) if report_path.is_file() else None,
        "result": report,
    }
    timing = cast(dict[str, object], summary["timing"])
    timing["evaluation_seconds"] = evaluation_duration_seconds
    timing["total_seconds"] = time.monotonic() - attempt_started
    _write_json(summary_path, summary)

    if completed.returncode != 0 or report is None:
        return 3
    if (
        report.get("completed_instances") != 1
        or report.get("error_instances") != 0
        or report.get("infra_failure_instances") != 0
        or report.get("ambiguous_failure_instances") != 0
    ):
        return 3
    print(
        json.dumps(
            {
                "attempt": attempt_id,
                "terminal_status": run.result.status.value,
                "resolved": report.get("resolved_instances") == 1,
                "artifact_root": str(attempt_root),
            },
            sort_keys=True,
        )
    )
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("instance_id")
    parser.add_argument("variant", choices=[item.value for item in AgentVariant])
    parser.add_argument("repetition", type=int)
    return parser.parse_args()


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise RuntimeError(f"{name} must be an object")
    return cast(Mapping[str, object], value)


def _verify_dataset(config: Mapping[str, object]) -> None:
    source = _mapping(config["source"], "source")
    artifact = _mapping(source["dataset_artifact"], "dataset_artifact")
    if not DATASET_PATH.is_file():
        raise SystemExit("pinned dataset artifact is missing; run the gold-gate script")
    if _sha256(DATASET_PATH) != artifact["sha256"]:
        raise SystemExit("pinned dataset artifact hash mismatch")
    if not SWE_BENCH.is_file():
        raise SystemExit("pinned SWE-bench runner is missing; run the gold-gate script")


def _verify_gold_gate(instance_id: str) -> None:
    safe_instance = instance_id.split("__", 1)[-1]
    report_path = REPORT_ROOT / f"gold.react-mvp-gold-{safe_instance}.json"
    if not report_path.is_file():
        raise SystemExit(f"gold gate is missing for {instance_id}")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if not (
        report.get("completed_instances") == 1
        and report.get("resolved_instances") == 1
        and report.get("unresolved_instances") == 0
        and report.get("infra_failure_instances") == 0
        and report.get("ambiguous_failure_instances") == 0
        and report.get("error_instances") == 0
        and report.get("resolved_ids") == [instance_id]
    ):
        raise SystemExit(f"gold gate did not pass cleanly for {instance_id}")


def _verify_image_present(image: str, image_digest: str) -> None:
    completed = subprocess.run(
        ("docker", "image", "inspect", image, "--format", "{{json .RepoDigests}}"),
        check=False,
        capture_output=True,
    )
    if completed.returncode != 0:
        raise SystemExit("case image is absent; rerun its gold gate before the attempt")
    repo_digests = json.loads(completed.stdout.decode("utf-8"))
    expected = image.removesuffix(":latest") + "@" + image_digest
    if expected not in repo_digests:
        raise SystemExit("case image registry digest does not match the frozen config")


def _dataset_row(instance_id: str) -> Mapping[str, object]:
    rows = load_dataset("parquet", data_files=str(DATASET_PATH), split="train")
    matches = [row for row in rows if row["instance_id"] == instance_id]
    if len(matches) != 1:
        raise RuntimeError(f"expected one dataset row for {instance_id}")
    return cast(Mapping[str, object], matches[0])


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    raise SystemExit(main())
