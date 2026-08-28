#!/usr/bin/env python3
"""Write the frozen #11 Stage A plan without constructing any live Adapter."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from workspace_agent_harness.deepseek_live_campaign import (
    build_zero_call_dry_run,
    load_deepseek_live_eval_lock,
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enumerate the 120-slot DeepSeek Behavioral Eval with zero calls.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="New JSON path. Existing files are never overwritten.",
    )
    arguments = parser.parse_args()
    lock = load_deepseek_live_eval_lock()
    dry_run = build_zero_call_dry_run(lock=lock)
    body = (
        json.dumps(
            dry_run,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    with arguments.output.open("x", encoding="utf-8") as stream:
        stream.write(body)
    print(f"output={arguments.output}")
    print(f"sha256={hashlib.sha256(body.encode('utf-8')).hexdigest()}")
    print("planned_slots=120")
    print("maximum_paid_model_calls=600")
    print("live_model_calls=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
