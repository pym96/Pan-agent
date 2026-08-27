#!/usr/bin/env python3
"""Run the credential-free 12-case Behavioral Eval v0 campaign."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from workspace_agent_harness.behavioral_eval import (
    BehavioralEvalCampaign,
    load_behavioral_eval_manifest,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run all 12 frozen local Behavioral Eval v0 cases.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="New artifact directory; its runs/ child must not already exist.",
    )
    arguments = parser.parse_args()

    report = BehavioralEvalCampaign(
        manifest=load_behavioral_eval_manifest(),
        artifacts_root=arguments.output,
    ).run()
    report_path = arguments.output / "report.json"
    stable_path = arguments.output / "stable-summary.json"
    stable_path.write_text(report.stable_summary_json(), encoding="utf-8")
    print(f"suite={report.suite_id}")
    print(f"planned={report.summary.planned}")
    print(f"passed={report.summary.passed}")
    print(f"failed={report.summary.failed}")
    print(f"report={report_path}")
    print(f"report_sha256={_sha256(report_path)}")
    print(f"stable_summary={stable_path}")
    print(f"stable_summary_sha256={_sha256(stable_path)}")
    return 0 if report.summary.failed == 0 else 1


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    raise SystemExit(main())
