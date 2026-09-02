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
    EventTool,
    JsonlRunEventLog,
    ModelGateway,
    RunEvent,
    RunEventView,
    WaitingDemoGateway,
    load_run_event_log,
    render_run_events,
)
from workspace_agent_harness.live_tui import run_live_tui


def main(arguments: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run or replay the evented Agent tracer, or explicitly start the "
            "DeepSeek Live workspace TUI."
        )
    )
    parser.add_argument(
        "--live-deepseek",
        action="store_true",
        help=(
            "start the reusable DeepSeek v3 workspace TUI; no external call "
            "occurs until a confirmed non-empty task is submitted"
        ),
    )
    parser.add_argument(
        "--workspace",
        type=Path,
        help="explicit model-writable workspace root for --live-deepseek",
    )
    parser.add_argument(
        "--trusted-local",
        action="store_true",
        help=(
            "opt in to host-user non-interactive shell and Human-confirmed PTY "
            "capabilities in --live-deepseek; cwd is not containment"
        ),
    )
    parser.add_argument(
        "--session-root",
        type=Path,
        help=(
            "new artifact root outside the selected workspace for --live-deepseek"
        ),
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
    parser.add_argument(
        "--view",
        action="append",
        choices=tuple(view.value for view in RunEventView),
        help=(
            "render compact, expanded, or trace; repeat to switch views over "
            "the same retained Run (default: compact)"
        ),
    )
    options = parser.parse_args(arguments)
    selected_views = tuple(
        RunEventView(view)
        for view in (options.view or (RunEventView.COMPACT.value,))
    )

    if options.replay is not None:
        if (
            options.log is not None
            or options.live_deepseek
            or options.trusted_local
            or options.wait_for_cancel
            or options.semantic_compaction_demo
            or options.overflow_recovery_demo
            or options.overflow_exhaustion_demo
        ):
            parser.error(
                "--replay cannot be combined with --log, --wait-for-cancel, "
                "--live-deepseek, --trusted-local, --semantic-compaction-demo, "
                "--overflow-recovery-demo, or --overflow-exhaustion-demo"
            )
        try:
            retained_events = load_run_event_log(options.replay)
            sys.stdout.write(
                _render_selected_views(
                    retained_events,
                    selected_views,
                    explain_compaction=options.explain_compaction,
                )
            )
        except (OSError, ValueError) as error:
            print(f"Replay failed: {error}", file=sys.stderr)
            return 2
        return 0

    if options.live_deepseek:
        if options.log is not None or any(
            (
                options.wait_for_cancel,
                options.semantic_compaction_demo,
                options.overflow_recovery_demo,
                options.overflow_exhaustion_demo,
            )
        ):
            parser.error(
                "--live-deepseek cannot be combined with --log or a deterministic "
                "demo mode"
            )
        if options.workspace is None or options.session_root is None:
            parser.error("--live-deepseek requires --workspace and --session-root")
        if len(selected_views) != 1:
            parser.error("--live-deepseek accepts exactly one initial --view")
        return run_live_tui(
            workspace_root=options.workspace,
            session_root=options.session_root,
            initial_view=selected_views[0],
            explain_compaction=options.explain_compaction,
            trusted_local=options.trusted_local,
        )

    if options.trusted_local:
        parser.error("--trusted-local requires --live-deepseek")
    if options.workspace is not None or options.session_root is not None:
        parser.error("--workspace and --session-root require --live-deepseek")

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
    context_projector: SemanticContextProjector | None = None
    gateway: ModelGateway
    tools: tuple[EventTool, ...]
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
        if options.wait_for_cancel:
            gateway = WaitingDemoGateway()
        else:
            gateway = DeterministicDemoGateway()
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
        _render_selected_views(
            retained_events,
            selected_views,
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


def _render_selected_views(
    events: Sequence[RunEvent],
    views: Sequence[RunEventView],
    *,
    explain_compaction: bool,
) -> str:
    return "".join(
        render_run_events(
            events,
            view=view,
            explain_compaction=explain_compaction,
        )
        for view in views
    )


if __name__ == "__main__":
    raise SystemExit(main())
