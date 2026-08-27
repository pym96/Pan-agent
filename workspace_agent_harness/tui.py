from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path
from typing import Sequence

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.context_projection import (
    action_tool_set_identity,
    CanonicalJsonTokenEstimator,
    ContextPolicy,
    FileArtifactStore,
    SemanticContextProjector,
)
from workspace_agent_harness.evented import (
    AgentLoop,
    DemoEchoTool,
    DemoJournalTool,
    DeterministicDemoGateway,
    DeterministicLongDemoGateway,
    DeterministicOverflowDemoGateway,
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
    parser.add_argument(
        "--semantic-compaction-demo",
        action="store_true",
        help="run the deterministic three-stage proactive-compaction path",
    )
    parser.add_argument(
        "--overflow-recovery-demo",
        action="store_true",
        help="run one deterministic Provider overflow followed by a successful retry",
    )
    parser.add_argument(
        "--overflow-exhaustion-demo",
        action="store_true",
        help="run two deterministic Provider overflows and exhaust the one retry",
    )
    parser.add_argument(
        "--explain-compaction",
        action="store_true",
        help="expand retained compaction decisions in live or replay output",
    )
    options = parser.parse_args(arguments)

    if options.replay is not None:
        if (
            options.log is not None
            or options.wait_for_cancel
            or options.semantic_compaction_demo
            or options.overflow_recovery_demo
            or options.overflow_exhaustion_demo
        ):
            parser.error(
                "--replay cannot be combined with --log, --wait-for-cancel, "
                "--semantic-compaction-demo, --overflow-recovery-demo, or "
                "--overflow-exhaustion-demo"
            )
        try:
            sys.stdout.write(
                replay_run_event_log(
                    options.replay,
                    explain_compaction=options.explain_compaction,
                )
            )
        except (OSError, ValueError) as error:
            print(f"Replay failed: {error}", file=sys.stderr)
            return 2
        return 0

    demo_modes = (
        options.wait_for_cancel,
        options.semantic_compaction_demo,
        options.overflow_recovery_demo,
        options.overflow_exhaustion_demo,
    )
    if sum(bool(selected) for selected in demo_modes) > 1:
        parser.error("select at most one deterministic demo mode")

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
    context_projector = None
    artifact_path: Path | None = None
    if (
        options.semantic_compaction_demo
        or options.overflow_recovery_demo
        or options.overflow_exhaustion_demo
    ):
        artifact_path = Path(f"{log_path}.artifacts")
        try:
            artifact_store = FileArtifactStore(artifact_path)
        except OSError as error:
            print(f"Cannot create artifact store: {error}", file=sys.stderr)
            return 2
        if options.semantic_compaction_demo:
            gateway = DeterministicLongDemoGateway(stage_count=3)
            tools = (DemoJournalTool(large_stage=1),)
            verified_context_window = 10_000
            fallback_context_window = None
            context_window_source = "deterministic-demo-lock"
            context_window_confidence = "high"
            requested_output_room = 6_900
            protocol_tool_overhead_tokens = 256
            limits = RunLimits(max_steps=3, max_model_calls=4, timeout_seconds=30)
        else:
            gateway = DeterministicOverflowDemoGateway(
                exhaust_retry=options.overflow_exhaustion_demo
            )
            tools = (DemoEchoTool(),)
            verified_context_window = None
            fallback_context_window = 4_096
            context_window_source = "deterministic Provider catalog fallback"
            context_window_confidence = "low"
            requested_output_room = 512
            protocol_tool_overhead_tokens = 64
            limits = RunLimits(max_steps=1, max_model_calls=3, timeout_seconds=30)
        context_projector = SemanticContextProjector(
            policy=ContextPolicy(
                verified_context_window=verified_context_window,
                fallback_context_window=fallback_context_window,
                context_window_source=context_window_source,
                context_window_confidence=context_window_confidence,
                requested_output_room=requested_output_room,
                protocol_tool_overhead_tokens=protocol_tool_overhead_tokens,
                overhead_estimator_id="demo-translation-overhead/v1",
                overhead_source="deterministic-demo-lock",
                overhead_confidence="high",
                overhead_tool_set_identity=action_tool_set_identity(
                    tuple(tool.definition for tool in tools)
                ),
                system_policy_identity="evented-demo-policy/v1",
            ),
            estimator=CanonicalJsonTokenEstimator(),
            artifact_store=artifact_store,
        )
    else:
        gateway = (
            WaitingDemoGateway()
            if options.wait_for_cancel
            else DeterministicDemoGateway()
        )
        tools = (DemoEchoTool(),)
        limits = RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=30)
    result = AgentLoop(
        gateway=gateway,
        tools=tools,
        event_log=event_log,
        context_projector=context_projector,
        run_id=run_id,
    ).run(
        Task(task_id="manual-tui", prompt=prompt),
        limits,
    )
    retained_events = load_run_event_log(log_path)
    sys.stdout.write(
        render_run_events(
            retained_events,
            explain_compaction=options.explain_compaction,
        )
    )
    print(f"EVENT_LOG {log_path}")
    if artifact_path is not None:
        print(f"ARTIFACTS {artifact_path}")

    if result.status is EventedRunStatus.COMPLETED:
        return 0
    if result.status is EventedRunStatus.CANCELLED:
        return 130
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
