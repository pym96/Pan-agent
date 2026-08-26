from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from threading import Event
from types import MappingProxyType
from typing import Callable, Mapping, Protocol, Sequence, TypeAlias

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.translation import (
    ActionTool,
    AssistantFinalMessage,
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    ToolResultMessage,
    UserMessage,
)


RUN_EVENT_SCHEMA_VERSION = "run-event/v1"


class EventedRunStatus(StrEnum):
    COMPLETED = "completed"
    ABSTAINED = "abstained"
    CANCELLED = "cancelled"
    MODEL_ERROR = "model_error"
    PROTOCOL_ERROR = "protocol_error"
    TOOL_ERROR = "tool_error"
    STEP_LIMIT = "step_limit"
    MODEL_CALL_LIMIT = "model_call_limit"
    TIME_LIMIT = "time_limit"


class FinalDisposition(StrEnum):
    COMPLETED = "completed"
    ABSTAINED = "abstained"


@dataclass(frozen=True)
class EventedRunResult:
    run_id: str
    task_id: str
    status: EventedRunStatus
    output: str | None
    steps: int
    model_calls: int
    error: str | None = None


@dataclass(frozen=True)
class CandidateToolCall:
    call_id: str
    tool_name: str
    arguments: Mapping[str, object]

    def __post_init__(self) -> None:
        object.__setattr__(self, "arguments", MappingProxyType(dict(self.arguments)))


@dataclass(frozen=True)
class CandidateFinal:
    content: str
    disposition: FinalDisposition = FinalDisposition.COMPLETED
    reason_code: str | None = None


CandidateAction: TypeAlias = CandidateToolCall | CandidateFinal


@dataclass(frozen=True)
class PreparedModelTurn:
    run_id: str
    turn_id: str
    conversation: CanonicalConversation
    tools: tuple[ActionTool, ...]

    @property
    def identity(self) -> str:
        return _sha256_json(
            {
                "run_id": self.run_id,
                "turn_id": self.turn_id,
                "conversation_identity": self.conversation.identity,
                "tools": [tool.identity_material() for tool in self.tools],
            }
        )


@dataclass(frozen=True)
class ExchangeSettled:
    exchange_id: str
    candidate: CandidateAction
    stop_reason: str = "completed"


class ModelGateway(Protocol):
    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeSettled: ...


class EventTool(Protocol):
    definition: ActionTool

    def execute(self, arguments: Mapping[str, object], cancel_signal: Event) -> str: ...


@dataclass(frozen=True)
class RunEvent:
    schema_version: str
    run_id: str
    sequence: int
    event_id: str
    previous_event_hash: str | None
    event_type: str
    phase: str
    caused_by_event_id: str | None
    turn_id: str | None
    exchange_id: str | None
    candidate_id: str | None
    tool_call_id: str | None
    compaction_id: str | None
    monotonic_offset_ns: int
    visibility: str
    payload: Mapping[str, object]

    def __post_init__(self) -> None:
        object.__setattr__(self, "payload", MappingProxyType(dict(self.payload)))

    def as_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "run_id": self.run_id,
            "sequence": self.sequence,
            "event_id": self.event_id,
            "previous_event_hash": self.previous_event_hash,
            "event_type": self.event_type,
            "phase": self.phase,
            "caused_by_event_id": self.caused_by_event_id,
            "turn_id": self.turn_id,
            "exchange_id": self.exchange_id,
            "candidate_id": self.candidate_id,
            "tool_call_id": self.tool_call_id,
            "compaction_id": self.compaction_id,
            "monotonic_offset_ns": self.monotonic_offset_ns,
            "visibility": self.visibility,
            "payload": dict(self.payload),
        }


class RunEventLog(Protocol):
    def append(
        self,
        *,
        run_id: str,
        event_type: str,
        phase: str,
        caused_by_event_id: str | None,
        payload: Mapping[str, object],
        turn_id: str | None = None,
        exchange_id: str | None = None,
        candidate_id: str | None = None,
        tool_call_id: str | None = None,
        compaction_id: str | None = None,
        visibility: str = "public",
    ) -> RunEvent: ...

    def snapshot(self) -> tuple[RunEvent, ...]: ...


class JsonlRunEventLog:
    """Append-only local Adapter for the canonical Run Event Log."""

    def __init__(
        self,
        path: Path,
        *,
        monotonic_ns: Callable[[], int] = time.monotonic_ns,
    ) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=False)
        self._events: list[RunEvent] = []
        self._run_id: str | None = None
        self._monotonic_ns = monotonic_ns
        self._started_ns: int | None = None

    def append(
        self,
        *,
        run_id: str,
        event_type: str,
        phase: str,
        caused_by_event_id: str | None,
        payload: Mapping[str, object],
        turn_id: str | None = None,
        exchange_id: str | None = None,
        candidate_id: str | None = None,
        tool_call_id: str | None = None,
        compaction_id: str | None = None,
        visibility: str = "public",
    ) -> RunEvent:
        if self._events and self._events[-1].event_type == "run.terminal":
            raise ValueError("no event may follow the terminal event")
        if phase not in {"candidate", "accepted", "failed", "terminal"}:
            raise ValueError(f"invalid event phase: {phase!r}")
        if visibility not in {"public", "expanded", "restricted", "secret-ref"}:
            raise ValueError(f"invalid event visibility: {visibility!r}")
        if event_type == "run.terminal":
            if phase != "terminal":
                raise ValueError("run.terminal must use terminal phase")
            if payload.get("status") not in {status.value for status in EventedRunStatus}:
                raise ValueError("run.terminal must contain a known status")
        elif phase == "terminal":
            raise ValueError("only run.terminal may use terminal phase")
        if self._run_id is None:
            self._run_id = run_id
        elif self._run_id != run_id:
            raise ValueError("event log cannot contain multiple run IDs")
        sequence = len(self._events)
        if sequence == 0:
            if event_type != "run.started" or caused_by_event_id is not None:
                raise ValueError("the first event must be uncaused run.started")
        else:
            prior_ids = {event.event_id for event in self._events}
            if caused_by_event_id not in prior_ids:
                raise ValueError("derived event causal ID must reference a prior event")
            if event_type == "run.started":
                raise ValueError("run.started may occur only once")
        previous_hash = self._events[-1].event_id if self._events else None
        now_ns = self._monotonic_ns()
        if self._started_ns is None:
            self._started_ns = now_ns
        monotonic_offset_ns = max(0, now_ns - self._started_ns)
        if self._events:
            monotonic_offset_ns = max(
                monotonic_offset_ns,
                self._events[-1].monotonic_offset_ns,
            )
        material = {
            "schema_version": RUN_EVENT_SCHEMA_VERSION,
            "run_id": run_id,
            "sequence": sequence,
            "previous_event_hash": previous_hash,
            "event_type": event_type,
            "phase": phase,
            "caused_by_event_id": caused_by_event_id,
            "turn_id": turn_id,
            "exchange_id": exchange_id,
            "candidate_id": candidate_id,
            "tool_call_id": tool_call_id,
            "compaction_id": compaction_id,
            "monotonic_offset_ns": monotonic_offset_ns,
            "visibility": visibility,
            "payload": dict(payload),
        }
        event = RunEvent(event_id=_sha256_json(material), **material)
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(_canonical_json(event.as_dict()) + "\n")
        self._events.append(event)
        return event

    def snapshot(self) -> tuple[RunEvent, ...]:
        return tuple(self._events)


class DemoEchoTool:
    definition = ActionTool(
        name="echo",
        description="Return one text value as the deterministic observation.",
        argument_name="text",
        argument_description="The exact non-empty text to return.",
    )

    def __init__(self) -> None:
        self._calls: list[dict[str, object]] = []

    @property
    def calls(self) -> tuple[dict[str, object], ...]:
        return tuple(dict(call) for call in self._calls)

    def execute(self, arguments: Mapping[str, object], cancel_signal: Event) -> str:
        self._calls.append(dict(arguments))
        return str(arguments["text"])


class DeterministicDemoGateway:
    """Credential-free Adapter that follows canonical history, not wire syntax."""

    def __init__(self) -> None:
        self._prepared_turns: list[PreparedModelTurn] = []

    @property
    def prepared_turns(self) -> tuple[PreparedModelTurn, ...]:
        return tuple(self._prepared_turns)

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeSettled:
        self._prepared_turns.append(prepared_turn)
        messages = prepared_turn.conversation.messages
        if len(messages) == 1 and isinstance(messages[0], UserMessage):
            candidate: CandidateAction = CandidateToolCall(
                call_id="demo-call-1",
                tool_name="echo",
                arguments={"text": messages[0].content},
            )
        elif len(messages) == 3 and isinstance(messages[-1], ToolResultMessage):
            candidate = CandidateFinal(content=f"Observed: {messages[-1].content}")
        else:
            raise RuntimeError("demo gateway received an unexpected canonical history")
        return ExchangeSettled(
            exchange_id=f"{prepared_turn.turn_id}:exchange",
            candidate=candidate,
        )


class WaitingDemoGateway:
    """Deterministic manual Adapter used to exercise Ctrl-C cancellation."""

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeSettled:
        while not cancel_signal.wait(3_600):
            pass
        raise KeyboardInterrupt


class AgentLoop:
    """Own run state transitions; delegate only model I/O and tool effects."""

    def __init__(
        self,
        *,
        gateway: ModelGateway,
        tools: Sequence[EventTool],
        event_log: RunEventLog,
        run_id: str | None = None,
        agent_id: str = "evented-agent/v1",
        monotonic=time.monotonic,
    ) -> None:
        self._gateway = gateway
        self._tools = {tool.definition.name: tool for tool in tools}
        if len(self._tools) != len(tools):
            raise ValueError("tool names must be unique")
        self._event_log = event_log
        self._run_id = run_id
        if not agent_id:
            raise ValueError("agent identity must be non-empty")
        self._agent_id = agent_id
        self._monotonic = monotonic

    def run(
        self,
        task: Task,
        limits: RunLimits,
        cancel_signal: Event | None = None,
    ) -> EventedRunResult:
        if not isinstance(task.prompt, str) or not task.prompt.strip():
            raise ValueError("task prompt must contain non-whitespace text")
        signal = cancel_signal or Event()
        run_id = self._run_id or uuid.uuid4().hex
        started_at = self._monotonic()
        steps = 0
        model_calls = 0
        conversation = CanonicalConversation((UserMessage(task.prompt),))
        used_call_ids: set[str] = set()

        last_event = self._append(
            run_id=run_id,
            event_type="run.started",
            phase="accepted",
            cause=None,
            payload={
                "agent_id": self._agent_id,
                "task_id": task.task_id,
                "task_identity": _sha256_json(
                    {"task_id": task.task_id, "prompt": task.prompt}
                ),
                "prompt": task.prompt,
                "limits": {
                    "max_steps": limits.max_steps,
                    "max_model_calls": limits.max_model_calls,
                    "timeout_seconds": limits.timeout_seconds,
                },
            },
        )

        def terminal(
            status: EventedRunStatus,
            *,
            output: str | None = None,
            error: str | None = None,
            cause: RunEvent | None = None,
        ) -> EventedRunResult:
            nonlocal last_event
            last_event = self._append(
                run_id=run_id,
                event_type="run.terminal",
                phase="terminal",
                cause=cause or last_event,
                payload={
                    "status": status.value,
                    "output": output,
                    "error": error,
                    "steps": steps,
                    "model_calls": model_calls,
                },
            )
            return EventedRunResult(
                run_id=run_id,
                task_id=task.task_id,
                status=status,
                output=output,
                steps=steps,
                model_calls=model_calls,
                error=error,
            )

        def cancelled(cause: RunEvent) -> EventedRunResult:
            nonlocal last_event
            signal.set()
            last_event = self._append(
                run_id=run_id,
                event_type="control.cancel_requested",
                phase="accepted",
                cause=cause,
                payload={"source": "interrupt_or_signal"},
            )
            return terminal(
                EventedRunStatus.CANCELLED,
                error="run cancelled",
                cause=last_event,
            )

        while True:
            if signal.is_set():
                return cancelled(last_event)
            if self._monotonic() - started_at >= limits.timeout_seconds:
                return terminal(EventedRunStatus.TIME_LIMIT, error="run timeout reached")
            if model_calls >= limits.max_model_calls:
                return terminal(
                    EventedRunStatus.MODEL_CALL_LIMIT,
                    error="maximum model call budget reached",
                )

            turn_id = f"{run_id}:turn:{model_calls + 1}"
            projection_started = self._append(
                run_id=run_id,
                event_type="context.projection_started",
                phase="candidate",
                cause=last_event,
                turn_id=turn_id,
                payload={
                    "history_identity": conversation.identity,
                    "remaining_model_calls": limits.max_model_calls - model_calls,
                    "remaining_tool_steps": limits.max_steps - steps,
                },
            )
            prepared = PreparedModelTurn(
                run_id=run_id,
                turn_id=turn_id,
                conversation=conversation,
                tools=tuple(tool.definition for tool in self._tools.values()),
            )
            projected = self._append(
                run_id=run_id,
                event_type="context.projected",
                phase="accepted",
                cause=projection_started,
                turn_id=turn_id,
                payload={"prepared_turn_identity": prepared.identity},
            )
            exchange_started = self._append(
                run_id=run_id,
                event_type="model.exchange_started",
                phase="candidate",
                cause=projected,
                turn_id=turn_id,
                payload={"prepared_turn_identity": prepared.identity},
            )
            model_calls += 1
            try:
                settled = self._gateway.exchange(prepared, signal)
            except KeyboardInterrupt:
                return cancelled(exchange_started)
            except Exception as error:
                return terminal(
                    EventedRunStatus.MODEL_ERROR,
                    error=str(error),
                    cause=exchange_started,
                )
            if signal.is_set():
                return cancelled(exchange_started)
            if not isinstance(settled, ExchangeSettled):
                failed = self._append(
                    run_id=run_id,
                    event_type="model.exchange_failed",
                    phase="failed",
                    cause=exchange_started,
                    turn_id=turn_id,
                    payload={"error": "gateway did not return ExchangeSettled"},
                )
                return terminal(
                    EventedRunStatus.MODEL_ERROR,
                    error="gateway did not return ExchangeSettled",
                    cause=failed,
                )

            candidate_schema_error = _candidate_schema_error(settled.candidate)
            candidate_id = (
                None
                if candidate_schema_error is not None
                else _candidate_identity(settled.candidate)
            )
            settled_event = self._append(
                run_id=run_id,
                event_type="model.exchange_settled",
                phase="candidate",
                cause=exchange_started,
                turn_id=turn_id,
                exchange_id=settled.exchange_id,
                candidate_id=candidate_id,
                payload={
                    "candidate_kind": (
                        "invalid"
                        if candidate_schema_error is not None
                        else _candidate_kind(settled.candidate)
                    ),
                    "stop_reason": settled.stop_reason,
                },
            )
            admission_error = candidate_schema_error or self._admission_error(
                settled.candidate,
                used_call_ids,
            )
            if admission_error is not None:
                rejected = self._append(
                    run_id=run_id,
                    event_type="candidate.rejected",
                    phase="failed",
                    cause=settled_event,
                    turn_id=turn_id,
                    exchange_id=settled.exchange_id,
                    candidate_id=candidate_id,
                    payload={"error": admission_error},
                )
                return terminal(
                    EventedRunStatus.PROTOCOL_ERROR,
                    error=admission_error,
                    cause=rejected,
                )

            accepted = self._append(
                run_id=run_id,
                event_type="candidate.accepted",
                phase="accepted",
                cause=settled_event,
                turn_id=turn_id,
                exchange_id=settled.exchange_id,
                candidate_id=candidate_id,
                tool_call_id=(
                    settled.candidate.call_id
                    if isinstance(settled.candidate, CandidateToolCall)
                    else None
                ),
                payload=_candidate_material(settled.candidate),
            )

            if isinstance(settled.candidate, CandidateFinal):
                conversation = conversation.append(
                    AssistantFinalMessage(settled.candidate.content)
                )
                last_event = self._append(
                    run_id=run_id,
                    event_type="history.advanced",
                    phase="accepted",
                    cause=accepted,
                    turn_id=turn_id,
                    exchange_id=settled.exchange_id,
                    candidate_id=candidate_id,
                    payload={
                        "message_type": "assistant_final",
                        "content": settled.candidate.content,
                        "disposition": settled.candidate.disposition.value,
                        "reason_code": settled.candidate.reason_code,
                        "history_identity": conversation.identity,
                    },
                )
                return terminal(
                    EventedRunStatus(settled.candidate.disposition.value),
                    output=settled.candidate.content,
                )

            call = settled.candidate
            if steps >= limits.max_steps:
                return terminal(
                    EventedRunStatus.STEP_LIMIT,
                    error="maximum tool steps reached",
                    cause=accepted,
                )
            used_call_ids.add(call.call_id)
            conversation = conversation.append(
                AssistantToolCall(
                    CanonicalToolCall(
                        call_id=call.call_id,
                        tool_name=call.tool_name,
                        arguments=call.arguments,
                    )
                )
            )
            history_event = self._append(
                run_id=run_id,
                event_type="history.advanced",
                phase="accepted",
                cause=accepted,
                turn_id=turn_id,
                exchange_id=settled.exchange_id,
                candidate_id=candidate_id,
                tool_call_id=call.call_id,
                payload={
                    "message_type": "assistant_tool_call",
                    **_candidate_material(call),
                    "history_identity": conversation.identity,
                },
            )
            execution_started = self._append(
                run_id=run_id,
                event_type="tool.execution_started",
                phase="candidate",
                cause=history_event,
                turn_id=turn_id,
                exchange_id=settled.exchange_id,
                candidate_id=candidate_id,
                tool_call_id=call.call_id,
                payload={"tool_name": call.tool_name, "arguments": dict(call.arguments)},
            )
            tool = self._tools[call.tool_name]
            try:
                observation = tool.execute(call.arguments, signal)
            except KeyboardInterrupt:
                return cancelled(execution_started)
            except Exception as error:
                failed = self._append(
                    run_id=run_id,
                    event_type="tool.execution_failed",
                    phase="failed",
                    cause=execution_started,
                    turn_id=turn_id,
                    exchange_id=settled.exchange_id,
                    candidate_id=candidate_id,
                    tool_call_id=call.call_id,
                    payload={"tool_name": call.tool_name, "error": str(error)},
                )
                return terminal(
                    EventedRunStatus.TOOL_ERROR,
                    error=str(error),
                    cause=failed,
                )
            if signal.is_set():
                return cancelled(execution_started)
            if not isinstance(observation, str):
                failed = self._append(
                    run_id=run_id,
                    event_type="tool.execution_failed",
                    phase="failed",
                    cause=execution_started,
                    turn_id=turn_id,
                    exchange_id=settled.exchange_id,
                    candidate_id=candidate_id,
                    tool_call_id=call.call_id,
                    payload={
                        "tool_name": call.tool_name,
                        "error": "tool observation must be text",
                    },
                )
                return terminal(
                    EventedRunStatus.TOOL_ERROR,
                    error="tool observation must be text",
                    cause=failed,
                )
            steps += 1
            completed = self._append(
                run_id=run_id,
                event_type="tool.execution_completed",
                phase="accepted",
                cause=execution_started,
                turn_id=turn_id,
                exchange_id=settled.exchange_id,
                candidate_id=candidate_id,
                tool_call_id=call.call_id,
                payload={"tool_name": call.tool_name, "observation": observation},
            )
            conversation = conversation.append(
                ToolResultMessage(
                    call_id=call.call_id,
                    tool_name=call.tool_name,
                    content=observation,
                )
            )
            last_event = self._append(
                run_id=run_id,
                event_type="history.advanced",
                phase="accepted",
                cause=completed,
                turn_id=turn_id,
                exchange_id=settled.exchange_id,
                candidate_id=candidate_id,
                tool_call_id=call.call_id,
                payload={
                    "message_type": "tool_result",
                    "call_id": call.call_id,
                    "tool_name": call.tool_name,
                    "content": observation,
                    "history_identity": conversation.identity,
                },
            )

    def _admission_error(
        self,
        candidate: CandidateAction,
        used_call_ids: set[str],
    ) -> str | None:
        if isinstance(candidate, CandidateFinal):
            if not isinstance(candidate.content, str) or not candidate.content:
                return "final content must be non-empty text"
            if not isinstance(candidate.disposition, FinalDisposition):
                return "final disposition must be completed or abstained"
            if candidate.reason_code is not None and not isinstance(
                candidate.reason_code,
                str,
            ):
                return "final reason code must be text when present"
            return None
        if not isinstance(candidate.call_id, str) or not candidate.call_id:
            return "tool call ID must be non-empty text"
        if candidate.call_id in used_call_ids:
            return f"tool call ID was already used: {candidate.call_id}"
        tool = self._tools.get(candidate.tool_name)
        if tool is None:
            return f"unknown tool: {candidate.tool_name}"
        argument_name = tool.definition.argument_name
        if set(candidate.arguments) != {argument_name}:
            return f"tool {candidate.tool_name!r} requires only {argument_name!r}"
        argument = candidate.arguments[argument_name]
        if not isinstance(argument, str) or not argument:
            return f"tool argument {argument_name!r} must be non-empty text"
        return None

    def _append(
        self,
        *,
        run_id: str,
        event_type: str,
        phase: str,
        cause: RunEvent | None,
        payload: Mapping[str, object],
        turn_id: str | None = None,
        exchange_id: str | None = None,
        candidate_id: str | None = None,
        tool_call_id: str | None = None,
    ) -> RunEvent:
        return self._event_log.append(
            run_id=run_id,
            event_type=event_type,
            phase=phase,
            caused_by_event_id=cause.event_id if cause is not None else None,
            payload=payload,
            turn_id=turn_id,
            exchange_id=exchange_id,
            candidate_id=candidate_id,
            tool_call_id=tool_call_id,
        )


EventedAgentLoop = AgentLoop


def load_run_event_log(path: Path) -> tuple[RunEvent, ...]:
    events: list[RunEvent] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"invalid event JSON at line {line_number}") from error
        if not isinstance(value, dict):
            raise ValueError(f"event at line {line_number} must be an object")
        event_id = value.pop("event_id", None)
        if not isinstance(event_id, str) or event_id != _sha256_json(value):
            raise ValueError(f"event identity mismatch at line {line_number}")
        try:
            event = RunEvent(event_id=event_id, **value)
        except TypeError as error:
            raise ValueError(f"invalid event shape at line {line_number}") from error
        if event.schema_version != RUN_EVENT_SCHEMA_VERSION:
            raise ValueError(f"unsupported event schema at line {line_number}")
        if event.phase not in {"candidate", "accepted", "failed", "terminal"}:
            raise ValueError(f"invalid event phase at line {line_number}")
        if event.visibility not in {
            "public",
            "expanded",
            "restricted",
            "secret-ref",
        }:
            raise ValueError(f"invalid event visibility at line {line_number}")
        if (
            isinstance(event.monotonic_offset_ns, bool)
            or not isinstance(event.monotonic_offset_ns, int)
            or event.monotonic_offset_ns < 0
        ):
            raise ValueError(f"invalid monotonic offset at line {line_number}")
        if event.sequence != len(events):
            raise ValueError(f"non-monotonic event sequence at line {line_number}")
        previous = events[-1] if events else None
        expected_previous = previous.event_id if previous is not None else None
        if event.previous_event_hash != expected_previous:
            raise ValueError(f"broken event hash chain at line {line_number}")
        if events and event.run_id != events[0].run_id:
            raise ValueError("event log contains multiple run IDs")
        if previous is None:
            if event.event_type != "run.started" or event.caused_by_event_id is not None:
                raise ValueError("event log must begin with uncaused run.started")
            if event.monotonic_offset_ns != 0:
                raise ValueError("run.started monotonic offset must be zero")
        else:
            if event.monotonic_offset_ns < previous.monotonic_offset_ns:
                raise ValueError(f"decreasing monotonic offset at line {line_number}")
            prior_ids = {prior.event_id for prior in events}
            if event.caused_by_event_id not in prior_ids:
                raise ValueError(f"invalid causal link at line {line_number}")
        if event.event_type == "run.terminal":
            if event.phase != "terminal":
                raise ValueError("run.terminal must use terminal phase")
            if event.payload.get("status") not in {
                status.value for status in EventedRunStatus
            }:
                raise ValueError("run.terminal contains an unknown status")
        elif event.phase == "terminal":
            raise ValueError("only run.terminal may use terminal phase")
        events.append(event)
    if not events:
        raise ValueError("event log is empty")
    terminal_indexes = [
        index for index, event in enumerate(events) if event.event_type == "run.terminal"
    ]
    if terminal_indexes != [len(events) - 1]:
        raise ValueError("event log must end in exactly one terminal event")
    return tuple(events)


def render_run_events(events: Sequence[RunEvent]) -> str:
    """Render one basic terminal trace as a pure projection of retained events."""

    if not events:
        raise ValueError("cannot render an empty event sequence")
    lines = [f"RUN {events[0].run_id}"]
    for event in events:
        detail = ""
        if event.event_type == "run.started":
            detail = f" task={_display_value(event.payload.get('prompt'))}"
        elif event.event_type == "candidate.accepted":
            detail = f" candidate={_display_value(dict(event.payload))}"
        elif event.event_type == "tool.execution_completed":
            detail = f" observation={_display_value(event.payload.get('observation'))}"
        lines.append(
            f"{event.sequence:03d} [{event.phase}] {event.event_type}{detail}"
        )
    terminal = events[-1]
    if terminal.event_type != "run.terminal":
        raise ValueError("cannot render a run without a terminal event")
    status = terminal.payload.get("status")
    output = terminal.payload.get("output")
    error = terminal.payload.get("error")
    if isinstance(output, str):
        lines.append(f"TERMINAL {status}: {output}")
    elif isinstance(error, str):
        lines.append(f"TERMINAL {status}: {error}")
    else:
        lines.append(f"TERMINAL {status}")
    return "\n".join(lines) + "\n"


def replay_run_event_log(path: Path) -> str:
    """Replay a retained Run without constructing a ModelGateway or tool Adapter."""

    return render_run_events(load_run_event_log(path))


def _candidate_kind(candidate: CandidateAction) -> str:
    return "tool_call" if isinstance(candidate, CandidateToolCall) else "final"


def _candidate_schema_error(candidate: object) -> str | None:
    if not isinstance(candidate, (CandidateToolCall, CandidateFinal)):
        return "candidate must contain exactly one tool call or final result"
    if isinstance(candidate, CandidateFinal):
        if not isinstance(candidate.content, str):
            return "final content must be text"
        if not isinstance(candidate.disposition, FinalDisposition):
            return "final disposition must be completed or abstained"
        if candidate.reason_code is not None and not isinstance(
            candidate.reason_code,
            str,
        ):
            return "final reason code must be text when present"
        return None
    if not all(isinstance(key, str) for key in candidate.arguments):
        return "tool argument names must be text"
    try:
        _canonical_json(dict(candidate.arguments))
    except (TypeError, ValueError):
        return "tool arguments must be canonical JSON"
    return None


def _candidate_material(candidate: CandidateAction) -> dict[str, object]:
    if isinstance(candidate, CandidateToolCall):
        return {
            "kind": "tool_call",
            "call_id": candidate.call_id,
            "tool_name": candidate.tool_name,
            "arguments": dict(candidate.arguments),
        }
    return {
        "kind": "final",
        "content": candidate.content,
        "disposition": candidate.disposition.value,
        "reason_code": candidate.reason_code,
    }


def _candidate_identity(candidate: CandidateAction) -> str:
    return _sha256_json(_candidate_material(candidate))


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _display_value(value: object) -> str:
    if isinstance(value, str):
        return value
    return _canonical_json(value)


def _sha256_json(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


__all__ = [
    "CandidateFinal",
    "CandidateToolCall",
    "DemoEchoTool",
    "DeterministicDemoGateway",
    "AgentLoop",
    "EventTool",
    "EventedAgentLoop",
    "EventedRunResult",
    "EventedRunStatus",
    "ExchangeSettled",
    "FinalDisposition",
    "JsonlRunEventLog",
    "ModelGateway",
    "PreparedModelTurn",
    "RUN_EVENT_SCHEMA_VERSION",
    "RunEvent",
    "RunEventLog",
    "WaitingDemoGateway",
    "load_run_event_log",
    "render_run_events",
    "replay_run_event_log",
]
