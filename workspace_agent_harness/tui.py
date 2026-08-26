from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path
from typing import Sequence

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.evented import (
    AgentLoop,
    DemoEchoTool,
    DeterministicDemoGateway,
    EventedRunStatus,
    JsonlRunEventLog,
    WaitingDemoGateway,
    load_run_event_log,
    render_run_events,
    replay_run_event_log,
)


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run or replay the credential-free evented Agent tracer."
    )
    parser.add_argument(
        "--log",
        type=Path,
        help="exclusive path for the new run-event/v1 JSONL log",
    )
    parser.add_argument(
        "--replay",
        type=Path,
        help="render an existing event log without model or tool calls",
    )
    parser.add_argument(
        "--wait-for-cancel",
        action="store_true",
        help="use a deterministic exchange that waits for Ctrl-C",
    )
    options = parser.parse_args(arguments)

    if options.replay is not None:
        if options.log is not None or options.wait_for_cancel:
            parser.error("--replay cannot be combined with --log or --wait-for-cancel")
        try:
            sys.stdout.write(replay_run_event_log(options.replay))
        except (OSError, ValueError) as error:
            print(f"Replay failed: {error}", file=sys.stderr)
            return 2
        return 0

    try:
        prompt = input("Task> ")
    except EOFError:
        print("Task input ended before a Run was created.", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nNo Run was created.", file=sys.stderr)
        return 130
    if not prompt.strip():
        print("Task must not be blank; no Run was created.", file=sys.stderr)
        return 2

    run_id = uuid.uuid4().hex
    log_path = options.log or Path.cwd() / f"run-{run_id}.jsonl"
    try:
        event_log = JsonlRunEventLog(log_path)
    except OSError as error:
        print(f"Cannot create event log: {error}", file=sys.stderr)
        return 2
    gateway = WaitingDemoGateway() if options.wait_for_cancel else DeterministicDemoGateway()
    result = AgentLoop(
        gateway=gateway,
        tools=(DemoEchoTool(),),
        event_log=event_log,
        run_id=run_id,
    ).run(
        Task(task_id="manual-tui", prompt=prompt),
        RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=30),
    )
    retained_events = load_run_event_log(log_path)
    sys.stdout.write(render_run_events(retained_events))
    print(f"EVENT_LOG {log_path}")

    if result.status is EventedRunStatus.COMPLETED:
        return 0
    if result.status is EventedRunStatus.CANCELLED:
        return 130
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
