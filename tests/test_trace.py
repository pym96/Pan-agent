from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from workspace_agent_harness import (
    AgentLoop,
    RunLimits,
    Task,
    TraceValidationError,
    load_trace,
)


class FinalModel:
    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        return '{"type":"final","output":"done"}'


class TraceValidationBehaviorTest(unittest.TestCase):
    def test_existing_trace_is_not_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            trace_path.write_text("sentinel\n", encoding="utf-8")

            with self.assertRaises(FileExistsError):
                AgentLoop(model=FinalModel(), tools=[], trace_path=trace_path).run(
                    Task(task_id="trace-existing", prompt="finish"),
                    RunLimits(max_steps=1, max_model_calls=1, timeout_seconds=30),
                )

            self.assertEqual(trace_path.read_text(encoding="utf-8"), "sentinel\n")

    def test_unknown_event_type_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            AgentLoop(model=FinalModel(), tools=[], trace_path=trace_path).run(
                Task(task_id="trace-unknown", prompt="finish"),
                RunLimits(max_steps=1, max_model_calls=1, timeout_seconds=30),
            )
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            events[1]["event_type"] = "invented_event"
            trace_path.write_text(
                "\n".join(json.dumps(event) for event in events) + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(TraceValidationError, "unknown event type"):
                load_trace(trace_path)

    def test_unknown_terminal_status_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            AgentLoop(model=FinalModel(), tools=[], trace_path=trace_path).run(
                Task(task_id="trace-status", prompt="finish"),
                RunLimits(max_steps=1, max_model_calls=1, timeout_seconds=30),
            )
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            events[-1]["payload"]["result"]["status"] = "invented_status"
            trace_path.write_text(
                "\n".join(json.dumps(event) for event in events) + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(TraceValidationError, "terminal status"):
                load_trace(trace_path)

    def test_missing_event_is_rejected_as_sequence_gap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            AgentLoop(model=FinalModel(), tools=[], trace_path=trace_path).run(
                Task(task_id="trace-gap", prompt="finish"),
                RunLimits(max_steps=1, max_model_calls=1, timeout_seconds=30),
            )
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            del events[1]
            trace_path.write_text(
                "\n".join(json.dumps(event) for event in events) + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(TraceValidationError, "sequence"):
                load_trace(trace_path)


if __name__ == "__main__":
    unittest.main()
