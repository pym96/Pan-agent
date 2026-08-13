from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Callable, Protocol, Sequence


class RunStatus(StrEnum):
    SUCCEEDED = "succeeded"
    MODEL_ERROR = "model_error"
    PARSE_ERROR = "parse_error"
    TOOL_ERROR = "tool_error"
    STEP_LIMIT = "step_limit"
    TIMEOUT = "timeout"
    BUDGET_EXCEEDED = "budget_exceeded"


@dataclass(frozen=True)
class Task:
    task_id: str
    prompt: str


@dataclass(frozen=True)
class RunLimits:
    max_steps: int
    max_model_calls: int
    timeout_seconds: float


@dataclass(frozen=True)
class RunResult:
    run_id: str
    task_id: str
    status: RunStatus
    output: str | None
    steps: int
    model_calls: int
    error: str | None = None


@dataclass(frozen=True)
class FinalAction:
    output: str


@dataclass(frozen=True)
class ToolAction:
    tool: str
    arguments: dict[str, object]


@dataclass(frozen=True)
class TraceEvent:
    schema_version: int
    run_id: str
    task_id: str
    sequence: int
    event_type: str
    payload: dict[str, object]


class TraceValidationError(ValueError):
    pass


class _TraceWriter:
    def __init__(self, path: Path, *, run_id: str, task_id: str) -> None:
        self._path = path
        self._run_id = run_id
        self._task_id = task_id
        self._sequence = 0
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8"):
            pass

    def record(self, event_type: str, payload: dict[str, object]) -> None:
        event = {
            "schema_version": 1,
            "run_id": self._run_id,
            "task_id": self._task_id,
            "sequence": self._sequence,
            "event_type": event_type,
            "payload": payload,
        }
        with self._path.open("a", encoding="utf-8") as trace:
            trace.write(json.dumps(event, sort_keys=True) + "\n")
        self._sequence += 1


class ModelAdapter(Protocol):
    def respond(self, context: tuple[dict[str, object], ...]) -> str: ...


class Tool(Protocol):
    name: str

    def execute(self, arguments: dict[str, object]) -> str: ...


class AgentLoop:
    """Run a bounded task and record every observable transition as JSONL."""

    def __init__(
        self,
        *,
        model: ModelAdapter,
        tools: Sequence[Tool],
        trace_path: Path,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._model = model
        self._tools = {tool.name: tool for tool in tools}
        self._trace_path = trace_path
        self._monotonic = monotonic

    def run(self, task: Task, limits: RunLimits) -> RunResult:
        run_id = uuid.uuid4().hex
        steps = 0
        model_calls = 0
        context: list[dict[str, object]] = [{"role": "user", "content": task.prompt}]
        trace = _TraceWriter(self._trace_path, run_id=run_id, task_id=task.task_id)
        started_at = self._monotonic()

        def finish(
            status: RunStatus,
            *,
            output: str | None = None,
            error: str | None = None,
        ) -> RunResult:
            result = RunResult(
                run_id=run_id,
                task_id=task.task_id,
                status=status,
                output=output,
                steps=steps,
                model_calls=model_calls,
                error=error,
            )
            trace.record("run_completed", {"result": _result_payload(result)})
            return result

        trace.record("run_started", {"limits": vars(limits), "prompt": task.prompt})
        while True:
            if self._monotonic() - started_at >= limits.timeout_seconds:
                return finish(RunStatus.TIMEOUT, error="run timeout reached")
            if model_calls >= limits.max_model_calls:
                return finish(
                    RunStatus.BUDGET_EXCEEDED,
                    error="maximum model call budget reached",
                )
            model_calls += 1
            try:
                raw_response = self._model.respond(tuple(context))
            except Exception as error:
                return finish(RunStatus.MODEL_ERROR, error=str(error))
            trace.record("model_output", {"content": raw_response})
            try:
                action = _parse_action(raw_response)
            except ValueError as error:
                return finish(RunStatus.PARSE_ERROR, error=str(error))
            if isinstance(action, FinalAction):
                return finish(RunStatus.SUCCEEDED, output=action.output)

            tool = self._tools.get(action.tool)
            if tool is None:
                error = f"unknown tool: {action.tool}"
                trace.record("tool_failed", {"tool": action.tool, "error": error})
                return finish(RunStatus.TOOL_ERROR, error=error)
            try:
                observation = tool.execute(action.arguments)
            except Exception as error:
                trace.record("tool_failed", {"tool": tool.name, "error": str(error)})
                return finish(RunStatus.TOOL_ERROR, error=str(error))
            steps += 1
            trace.record(
                "tool_completed",
                {"tool": tool.name, "observation": observation, "step": steps},
            )
            context.extend(
                [
                    {"role": "assistant", "content": raw_response},
                    {"role": "tool", "name": tool.name, "content": observation},
                ]
            )
            if steps >= limits.max_steps:
                return finish(RunStatus.STEP_LIMIT, error="maximum tool steps reached")


def _result_payload(result: RunResult) -> dict[str, object]:
    return {
        "run_id": result.run_id,
        "task_id": result.task_id,
        "status": result.status.value,
        "output": result.output,
        "steps": result.steps,
        "model_calls": result.model_calls,
        "error": result.error,
    }


def _parse_action(raw_response: str) -> FinalAction | ToolAction:
    try:
        value = json.loads(raw_response)
    except json.JSONDecodeError:
        raise ValueError("model output is not valid JSON") from None
    if not isinstance(value, dict):
        raise ValueError("model output must be a JSON object")
    action_type = value.get("type")
    if action_type == "final" and isinstance(value.get("output"), str):
        return FinalAction(output=value["output"])
    if (
        action_type == "tool"
        and isinstance(value.get("tool"), str)
        and isinstance(value.get("arguments"), dict)
    ):
        return ToolAction(tool=value["tool"], arguments=value["arguments"])
    if action_type not in {"final", "tool"}:
        raise ValueError(f"unknown action type: {action_type!r}")
    raise ValueError(f"invalid {action_type} action payload")


def load_trace(path: Path) -> tuple[TraceEvent, ...]:
    allowed_event_types = {
        "run_started",
        "model_output",
        "tool_completed",
        "tool_failed",
        "run_completed",
    }
    events: list[TraceEvent] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise TraceValidationError(f"line {line_number}: invalid JSON") from error
        if not isinstance(value, dict):
            raise TraceValidationError(f"line {line_number}: event must be an object")
        try:
            event = TraceEvent(
                schema_version=value["schema_version"],
                run_id=value["run_id"],
                task_id=value["task_id"],
                sequence=value["sequence"],
                event_type=value["event_type"],
                payload=value["payload"],
            )
        except KeyError as error:
            raise TraceValidationError(
                f"line {line_number}: missing field {error.args[0]}"
            ) from error
        if event.schema_version != 1:
            raise TraceValidationError(
                f"line {line_number}: unsupported schema version {event.schema_version!r}"
            )
        if event.event_type not in allowed_event_types:
            raise TraceValidationError(
                f"line {line_number}: unknown event type {event.event_type!r}"
            )
        if not isinstance(event.payload, dict):
            raise TraceValidationError(f"line {line_number}: payload must be an object")
        events.append(event)

    if not events:
        raise TraceValidationError("trace is empty")
    if [event.sequence for event in events] != list(range(len(events))):
        raise TraceValidationError("trace sequence must be contiguous from zero")
    if events[0].event_type != "run_started" or events[-1].event_type != "run_completed":
        raise TraceValidationError("trace must start and end with run terminal events")
    terminal_result = events[-1].payload.get("result")
    if not isinstance(terminal_result, dict):
        raise TraceValidationError("terminal event must contain a result object")
    terminal_status = terminal_result.get("status")
    if terminal_status not in {status.value for status in RunStatus}:
        raise TraceValidationError(f"unknown terminal status {terminal_status!r}")
    if len({event.run_id for event in events}) != 1:
        raise TraceValidationError("trace contains multiple run IDs")
    if len({event.task_id for event in events}) != 1:
        raise TraceValidationError("trace contains multiple task IDs")
    return tuple(events)


__all__ = [
    "AgentLoop",
    "ModelAdapter",
    "RunLimits",
    "RunResult",
    "RunStatus",
    "Task",
    "Tool",
    "TraceEvent",
    "TraceValidationError",
    "load_trace",
]
