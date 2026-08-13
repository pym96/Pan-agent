from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from workspace_agent_harness import AgentLoop, RunLimits, RunStatus, Task


class ScriptedModel:
    def __init__(self, replies: list[str]) -> None:
        self._replies = iter(replies)

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        return next(self._replies)


class EchoTool:
    name = "echo"

    def execute(self, arguments: dict[str, object]) -> str:
        return str(arguments["text"])


class UpperTool:
    name = "upper"

    def execute(self, arguments: dict[str, object]) -> str:
        return str(arguments["text"]).upper()


class ContextFinishingModel:
    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        if context[-1]["role"] == "tool":
            return json.dumps({"type": "final", "output": context[-1]["content"]})
        return '{"type":"tool","tool":"upper","arguments":{"text":"second"}}'


class FailingModel:
    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        raise RuntimeError("provider unavailable")


class FailingTool:
    name = "explode"

    def execute(self, arguments: dict[str, object]) -> str:
        raise RuntimeError("tool process failed")


class SequenceClock:
    def __init__(self, values: list[float]) -> None:
        self._values = iter(values)

    def __call__(self) -> float:
        return next(self._values)


class AgentLoopBehaviorTest(unittest.TestCase):
    def test_successful_tool_run_returns_result_and_replayable_trace(self) -> None:
        model = ScriptedModel(
            [
                '{"type":"tool","tool":"echo","arguments":{"text":"observed"}}',
                '{"type":"final","output":"done"}',
            ]
        )
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            loop = AgentLoop(model=model, tools=[EchoTool()], trace_path=trace_path)

            result = loop.run(
                Task(task_id="task-success", prompt="use the echo tool"),
                RunLimits(max_steps=3, max_model_calls=3, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.SUCCEEDED, result.status)
            self.assertEqual("done", result.output)
            self.assertEqual(1, result.steps)
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            self.assertEqual(
                [
                    "run_started",
                    "model_output",
                    "tool_completed",
                    "model_output",
                    "run_completed",
                ],
                [event["event_type"] for event in events],
            )
            self.assertEqual(list(range(len(events))), [event["sequence"] for event in events])
            self.assertTrue(all(event["task_id"] == "task-success" for event in events))

    def test_same_task_accepts_two_model_adapters_and_two_tools(self) -> None:
        task = Task(task_id="task-swappable", prompt="run through selected adapter")
        limits = RunLimits(max_steps=3, max_model_calls=3, timeout_seconds=30)
        with tempfile.TemporaryDirectory() as directory:
            first = AgentLoop(
                model=ScriptedModel(
                    [
                        '{"type":"tool","tool":"echo","arguments":{"text":"first"}}',
                        '{"type":"final","output":"first"}',
                    ]
                ),
                tools=[EchoTool()],
                trace_path=Path(directory) / "first.jsonl",
            ).run(task, limits)
            second = AgentLoop(
                model=ContextFinishingModel(),
                tools=[UpperTool()],
                trace_path=Path(directory) / "second.jsonl",
            ).run(task, limits)

            self.assertEqual((RunStatus.SUCCEEDED, "first"), (first.status, first.output))
            self.assertEqual((RunStatus.SUCCEEDED, "SECOND"), (second.status, second.output))

    def test_model_failure_becomes_auditable_terminal_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            result = AgentLoop(
                model=FailingModel(), tools=[EchoTool()], trace_path=trace_path
            ).run(
                Task(task_id="task-model-error", prompt="fail at provider"),
                RunLimits(max_steps=3, max_model_calls=3, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.MODEL_ERROR, result.status)
            self.assertIn("provider unavailable", result.error or "")
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            self.assertEqual("run_completed", events[-1]["event_type"])
            self.assertEqual("model_error", events[-1]["payload"]["result"]["status"])

    def test_invalid_model_output_becomes_parse_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            result = AgentLoop(
                model=ScriptedModel(["not-json"]),
                tools=[EchoTool()],
                trace_path=trace_path,
            ).run(
                Task(task_id="task-parse-error", prompt="return malformed output"),
                RunLimits(max_steps=3, max_model_calls=3, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.PARSE_ERROR, result.status)
            self.assertIn("valid JSON", result.error or "")
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            self.assertEqual("not-json", events[-2]["payload"]["content"])
            self.assertEqual("parse_error", events[-1]["payload"]["result"]["status"])

    def test_valid_json_with_unknown_action_becomes_parse_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = AgentLoop(
                model=ScriptedModel(['{"type":"unexpected"}']),
                tools=[EchoTool()],
                trace_path=Path(directory) / "trace.jsonl",
            ).run(
                Task(task_id="task-action-error", prompt="return unknown action"),
                RunLimits(max_steps=3, max_model_calls=3, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.PARSE_ERROR, result.status)
            self.assertIn("unknown action type", result.error or "")

    def test_tool_failure_becomes_auditable_terminal_result(self) -> None:
        model = ScriptedModel(
            ['{"type":"tool","tool":"explode","arguments":{}}']
        )
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            result = AgentLoop(
                model=model, tools=[FailingTool()], trace_path=trace_path
            ).run(
                Task(task_id="task-tool-error", prompt="invoke failing tool"),
                RunLimits(max_steps=3, max_model_calls=3, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.TOOL_ERROR, result.status)
            self.assertIn("tool process failed", result.error or "")
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            self.assertEqual("tool_failed", events[-2]["event_type"])
            self.assertEqual("tool_error", events[-1]["payload"]["result"]["status"])

    def test_unknown_tool_becomes_tool_error_instead_of_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = AgentLoop(
                model=ScriptedModel(
                    ['{"type":"tool","tool":"missing","arguments":{}}']
                ),
                tools=[EchoTool()],
                trace_path=Path(directory) / "trace.jsonl",
            ).run(
                Task(task_id="task-unknown-tool", prompt="request missing tool"),
                RunLimits(max_steps=3, max_model_calls=3, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.TOOL_ERROR, result.status)
            self.assertIn("unknown tool", result.error or "")

    def test_step_limit_stops_repeated_tool_actions(self) -> None:
        repeated_call = '{"type":"tool","tool":"echo","arguments":{"text":"again"}}'
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            result = AgentLoop(
                model=ScriptedModel([repeated_call, repeated_call]),
                tools=[EchoTool()],
                trace_path=trace_path,
            ).run(
                Task(task_id="task-step-limit", prompt="never finish"),
                RunLimits(max_steps=2, max_model_calls=5, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.STEP_LIMIT, result.status)
            self.assertEqual(2, result.steps)
            self.assertEqual(2, result.model_calls)
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            self.assertEqual("step_limit", events[-1]["payload"]["result"]["status"])

    def test_timeout_stops_before_another_model_call(self) -> None:
        tool_call = '{"type":"tool","tool":"echo","arguments":{"text":"one"}}'
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            result = AgentLoop(
                model=ScriptedModel([tool_call]),
                tools=[EchoTool()],
                trace_path=trace_path,
                monotonic=SequenceClock([0.0, 0.0, 31.0]),
            ).run(
                Task(task_id="task-timeout", prompt="respect elapsed time"),
                RunLimits(max_steps=3, max_model_calls=5, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.TIMEOUT, result.status)
            self.assertEqual(1, result.steps)
            self.assertEqual(1, result.model_calls)
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            self.assertEqual("timeout", events[-1]["payload"]["result"]["status"])

    def test_model_call_budget_stops_before_overspend(self) -> None:
        tool_call = '{"type":"tool","tool":"echo","arguments":{"text":"one"}}'
        with tempfile.TemporaryDirectory() as directory:
            trace_path = Path(directory) / "trace.jsonl"
            result = AgentLoop(
                model=ScriptedModel([tool_call]),
                tools=[EchoTool()],
                trace_path=trace_path,
            ).run(
                Task(task_id="task-budget", prompt="respect model call budget"),
                RunLimits(max_steps=3, max_model_calls=1, timeout_seconds=30),
            )

            self.assertEqual(RunStatus.BUDGET_EXCEEDED, result.status)
            self.assertEqual(1, result.steps)
            self.assertEqual(1, result.model_calls)
            events = [json.loads(line) for line in trace_path.read_text().splitlines()]
            self.assertEqual(
                "budget_exceeded", events[-1]["payload"]["result"]["status"]
            )


if __name__ == "__main__":
    unittest.main()
