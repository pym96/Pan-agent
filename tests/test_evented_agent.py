from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from threading import Event

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.evented import (
    CandidateToolCall,
    DemoEchoTool,
    DeterministicDemoGateway,
    EventedAgentLoop,
    EventedRunStatus,
    ExchangeSettled,
    JsonlRunEventLog,
    PreparedModelTurn,
    load_run_event_log,
    render_run_events,
    replay_run_event_log,
)


class FixedGateway:
    def __init__(self, candidate: object) -> None:
        self.candidate = candidate

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: object) -> ExchangeSettled:
        return ExchangeSettled(
            exchange_id=f"{prepared_turn.turn_id}:fixed",
            candidate=self.candidate,  # type: ignore[arg-type]
        )


class InterruptingGateway:
    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: object) -> ExchangeSettled:
        raise KeyboardInterrupt


class CancellingGateway:
    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeSettled:
        cancel_signal.set()
        return ExchangeSettled(
            exchange_id=f"{prepared_turn.turn_id}:cancel-race",
            candidate=CandidateToolCall("too-late", "echo", {"text": "no"}),
        )


class IncrementingClock:
    def __init__(self) -> None:
        self.value = -1

    def __call__(self) -> int:
        self.value += 1
        return self.value


class EventedAgentLoopTest(unittest.TestCase):
    def test_deterministic_demo_uses_the_real_loop_for_one_tool_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "run.jsonl"
            gateway = DeterministicDemoGateway()
            tool = DemoEchoTool()
            loop = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(log_path),
                run_id="run-unicode-demo",
            )

            result = loop.run(
                Task(task_id="manual-demo", prompt="检查 café 🚀"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.COMPLETED, result.status)
            self.assertEqual("Observed: 检查 café 🚀", result.output)
            self.assertEqual(1, result.steps)
            self.assertEqual(2, result.model_calls)
            self.assertEqual(({"text": "检查 café 🚀"},), tool.calls)
            self.assertEqual(2, len(gateway.prepared_turns))
            self.assertEqual(1, len(gateway.prepared_turns[0].conversation.messages))
            self.assertEqual(3, len(gateway.prepared_turns[1].conversation.messages))

            events = load_run_event_log(log_path)
            self.assertEqual(
                [
                    "run.started",
                    "context.projection_started",
                    "context.projected",
                    "model.exchange_started",
                    "model.exchange_settled",
                    "candidate.accepted",
                    "history.advanced",
                    "tool.execution_started",
                    "tool.execution_completed",
                    "history.advanced",
                    "context.projection_started",
                    "context.projected",
                    "model.exchange_started",
                    "model.exchange_settled",
                    "candidate.accepted",
                    "history.advanced",
                    "run.terminal",
                ],
                [event.event_type for event in events],
            )
            self.assertEqual(list(range(len(events))), [event.sequence for event in events])
            self.assertIsNone(events[0].previous_event_hash)
            self.assertIsNone(events[0].caused_by_event_id)
            self.assertEqual("accepted", events[0].phase)
            self.assertEqual("public", events[0].visibility)
            self.assertEqual(
                sorted(event.monotonic_offset_ns for event in events),
                [event.monotonic_offset_ns for event in events],
            )
            for previous, event in zip(events, events[1:]):
                self.assertEqual(previous.event_id, event.previous_event_hash)
                self.assertIsNotNone(event.caused_by_event_id)
            self.assertEqual(
                ["completed"],
                [
                    event.payload["status"]
                    for event in events
                    if event.event_type == "run.terminal"
                ],
            )

    def test_multi_action_candidate_is_rejected_before_history_or_tool_effects(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "rejected.jsonl"
            tool = DemoEchoTool()
            gateway = FixedGateway(
                (
                    CandidateToolCall("call-1", "echo", {"text": "first"}),
                    CandidateToolCall("call-2", "echo", {"text": "second"}),
                )
            )
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(log_path),
                run_id="run-rejected",
            ).run(
                Task(task_id="rejected", prompt="must not execute"),
                RunLimits(max_steps=1, max_model_calls=1, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.PROTOCOL_ERROR, result.status)
            self.assertEqual((), tool.calls)
            events = load_run_event_log(log_path)
            self.assertNotIn("history.advanced", [event.event_type for event in events])
            self.assertNotIn("tool.execution_started", [event.event_type for event in events])
            self.assertEqual("candidate.rejected", events[-2].event_type)
            self.assertIn("exactly one", str(events[-2].payload["error"]))

    def test_replay_and_terminal_projection_read_only_the_retained_events(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "replay.jsonl"
            gateway = DeterministicDemoGateway()
            tool = DemoEchoTool()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(log_path),
                run_id="run-replay",
            ).run(
                Task(task_id="replay", prompt="回放 🎛️"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )
            before = log_path.read_bytes()
            calls_before = (gateway.prepared_turns, tool.calls)

            live_projection = render_run_events(load_run_event_log(log_path))
            replay_projection = replay_run_event_log(log_path)

            self.assertEqual(live_projection, replay_projection)
            self.assertIn("tool.execution_completed", replay_projection)
            self.assertIn("回放 🎛️", replay_projection)
            self.assertIn("TERMINAL completed: Observed: 回放 🎛️", replay_projection)
            self.assertEqual(before, log_path.read_bytes())
            self.assertEqual(calls_before, (gateway.prepared_turns, tool.calls))
            self.assertEqual(EventedRunStatus.COMPLETED, result.status)

    def test_keyboard_interrupt_becomes_one_cancelled_terminal_event(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "cancelled.jsonl"
            tool = DemoEchoTool()
            result = EventedAgentLoop(
                gateway=InterruptingGateway(),
                tools=(tool,),
                event_log=JsonlRunEventLog(log_path),
                run_id="run-cancelled",
            ).run(
                Task(task_id="cancelled", prompt="wait"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            events = load_run_event_log(log_path)
            self.assertEqual(EventedRunStatus.CANCELLED, result.status)
            self.assertEqual((), tool.calls)
            self.assertEqual(1, result.model_calls)
            self.assertEqual("control.cancel_requested", events[-2].event_type)
            self.assertEqual("run.terminal", events[-1].event_type)
            self.assertEqual("cancelled", events[-1].payload["status"])
            self.assertEqual(
                1,
                sum(event.event_type == "run.terminal" for event in events),
            )

    def test_cancel_signal_wins_before_a_returned_candidate_is_admitted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "cancel-race.jsonl"
            tool = DemoEchoTool()
            result = EventedAgentLoop(
                gateway=CancellingGateway(),
                tools=(tool,),
                event_log=JsonlRunEventLog(log_path),
                run_id="run-cancel-race",
            ).run(
                Task(task_id="cancel-race", prompt="cancel before admission"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            events = load_run_event_log(log_path)
            self.assertEqual(EventedRunStatus.CANCELLED, result.status)
            self.assertEqual((), tool.calls)
            self.assertNotIn(
                "candidate.accepted",
                [event.event_type for event in events],
            )
            self.assertEqual("control.cancel_requested", events[-2].event_type)

    def test_terminal_consumer_cannot_change_turns_effects_log_or_result(self) -> None:
        retained: list[
            tuple[
                object,
                tuple[PreparedModelTurn, ...],
                tuple[dict[str, object], ...],
                bytes,
            ]
        ] = []
        with tempfile.TemporaryDirectory() as temporary_directory:
            for index, render in enumerate((False, True)):
                log_path = Path(temporary_directory) / f"consumer-{index}.jsonl"
                gateway = DeterministicDemoGateway()
                tool = DemoEchoTool()
                result = EventedAgentLoop(
                    gateway=gateway,
                    tools=(tool,),
                    event_log=JsonlRunEventLog(
                        log_path,
                        monotonic_ns=IncrementingClock(),
                    ),
                    run_id="run-consumer-invariant",
                ).run(
                    Task(task_id="consumer-invariant", prompt="same input"),
                    RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
                )
                if render:
                    render_run_events(load_run_event_log(log_path))
                retained.append(
                    (
                        result,
                        gateway.prepared_turns,
                        tool.calls,
                        log_path.read_bytes(),
                    )
                )

        self.assertEqual(retained[0], retained[1])

    def test_event_log_rejects_unknown_cause_and_events_after_terminal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log = JsonlRunEventLog(Path(temporary_directory) / "invariants.jsonl")
            started = log.append(
                run_id="run-invariants",
                event_type="run.started",
                phase="accepted",
                caused_by_event_id=None,
                payload={"task_id": "invariants"},
            )
            with self.assertRaisesRegex(ValueError, "causal"):
                log.append(
                    run_id="run-invariants",
                    event_type="context.projection_started",
                    phase="candidate",
                    caused_by_event_id="not-a-prior-event",
                    payload={},
                )
            log.append(
                run_id="run-invariants",
                event_type="run.terminal",
                phase="terminal",
                caused_by_event_id=started.event_id,
                payload={"status": "completed"},
            )
            with self.assertRaisesRegex(ValueError, "terminal"):
                log.append(
                    run_id="run-invariants",
                    event_type="context.projection_started",
                    phase="candidate",
                    caused_by_event_id=started.event_id,
                    payload={},
                )


if __name__ == "__main__":
    unittest.main()
