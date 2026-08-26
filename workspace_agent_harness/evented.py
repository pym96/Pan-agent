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
from workspace_agent_harness.context_projection import (
    ContextProjectionRequest,
    ExactContextProjector,
    ModelContext,
    ModelContextProjector,
    ProjectionHistoryGroup,
    SemanticToolObservation,
    SourcedSummaryEntry,
)
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
_COMPACTION_EVENT_TYPES = {
    "artifact.externalized",
    "context.compaction_started",
    "context.compaction_completed",
    "context.compaction_failed",
}
_COMPACTION_EVENT_PHASES = {
    "artifact.externalized": "accepted",
    "context.compaction_started": "candidate",
    "context.compaction_completed": "accepted",
    "context.compaction_failed": "failed",
}


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
    CONTEXT_COMPACTION_ERROR = "context_compaction_error"


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
    model_context: ModelContext
    tools: tuple[ActionTool, ...]

    @property
    def conversation(self) -> CanonicalConversation:
        """Compatibility view: exactly the bounded conversation sent this turn."""

        return self.model_context.conversation

    @property
    def identity(self) -> str:
        return _sha256_json(
            {
                "run_id": self.run_id,
                "turn_id": self.turn_id,
                "model_context_identity": self.model_context.identity,
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

    def execute(
        self,
        arguments: Mapping[str, object],
        cancel_signal: Event,
    ) -> str | SemanticToolObservation: ...


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
        if event_type in _COMPACTION_EVENT_TYPES and not compaction_id:
            raise ValueError(f"{event_type} requires a compaction ID")
        expected_compaction_phase = _COMPACTION_EVENT_PHASES.get(event_type)
        if expected_compaction_phase is not None and phase != expected_compaction_phase:
            raise ValueError(
                f"{event_type} must use {expected_compaction_phase} phase"
            )
        if event_type in {"context.compaction_completed", "context.compaction_failed"}:
            matching_start = self._events[-1] if self._events else None
            if (
                matching_start is None
                or matching_start.event_type != "context.compaction_started"
                or matching_start.compaction_id != compaction_id
                or caused_by_event_id != matching_start.event_id
            ):
                raise ValueError(
                    f"{event_type} must be caused by its matching start event"
                )
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


class DemoJournalTool:
    """Deterministic long-run tool with one losslessly externalizable result."""

    definition = ActionTool(
        name="journal",
        description="Record one named stage and return its deterministic receipt.",
        argument_name="stage",
        argument_description="The exact stage name to record.",
    )

    def __init__(self, *, large_stage: int = 1) -> None:
        _require_demo_stage(large_stage)
        self._large_stage = large_stage
        self._calls: list[dict[str, object]] = []

    @property
    def calls(self) -> tuple[dict[str, object], ...]:
        return tuple(dict(call) for call in self._calls)

    def execute(
        self,
        arguments: Mapping[str, object],
        cancel_signal: Event,
    ) -> SemanticToolObservation:
        self._calls.append(dict(arguments))
        stage = str(arguments["stage"])
        try:
            stage_number = int(stage.removeprefix("stage-"))
        except ValueError as error:
            raise ValueError("journal stage must use stage-N") from error
        receipt = f"{stage} recorded"
        content = receipt + "\n" + ("y" * 512)
        if stage_number == self._large_stage:
            content = receipt + "\n" + ("x" * 33_000)
        return SemanticToolObservation(content=content, facts=(receipt,))


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


class DeterministicLongDemoGateway:
    """Offline gateway that can continue from summary plus a complete recent tail."""

    def __init__(self, *, stage_count: int = 3) -> None:
        _require_demo_stage(stage_count)
        self._stage_count = stage_count
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
        completed_call_ids = {
            message.call_id
            for message in prepared_turn.conversation.messages
            if isinstance(message, ToolResultMessage)
        }
        summary = prepared_turn.model_context.summary
        if summary is not None:
            completed_call_ids.update(
                entry.key.split(":fact:", 1)[0]
                for entry in summary.facts
                if ":fact:" in entry.key
            )
        completed = len(completed_call_ids)
        if completed < self._stage_count:
            stage_number = completed + 1
            candidate: CandidateAction = CandidateToolCall(
                call_id=f"long-call-{stage_number}",
                tool_name="journal",
                arguments={"stage": f"stage-{stage_number}"},
            )
        else:
            candidate = CandidateFinal(
                content=(
                    f"Completed {self._stage_count} journal stages with preserved "
                    "semantic context."
                )
            )
        return ExchangeSettled(
            exchange_id=f"{prepared_turn.turn_id}:long-demo",
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
        context_projector: ModelContextProjector | None = None,
        run_id: str | None = None,
        agent_id: str = "evented-agent/v1",
        system_policy_identity: str = "evented-demo-policy/v1",
        monotonic=time.monotonic,
    ) -> None:
        self._gateway = gateway
        self._tools = {tool.definition.name: tool for tool in tools}
        if len(self._tools) != len(tools):
            raise ValueError("tool names must be unique")
        self._event_log = event_log
        self._context_projector = context_projector or ExactContextProjector()
        self._run_id = run_id
        if not agent_id:
            raise ValueError("agent identity must be non-empty")
        self._agent_id = agent_id
        if not system_policy_identity:
            raise ValueError("system policy identity must be non-empty")
        self._system_policy_identity = system_policy_identity
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
        history_groups: list[ProjectionHistoryGroup] = []
        prior_summary_identity: str | None = None

        last_event = self._append(
            run_id=run_id,
            event_type="run.started",
            phase="accepted",
            cause=None,
            payload={
                "agent_id": self._agent_id,
                "system_policy_identity": self._system_policy_identity,
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
        run_started_event = last_event
        unresolved_commitments = (
            SourcedSummaryEntry(
                key="complete-active-request",
                content="Complete the active request before settling the Run.",
                source_event_ids=(run_started_event.event_id,),
            ),
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
                    "history_schema": "canonical-conversation/v1",
                    "remaining_model_calls": limits.max_model_calls - model_calls,
                    "remaining_tool_steps": limits.max_steps - steps,
                },
            )
            projection_cause = projection_started
            try:
                projection = self._context_projector.project(
                    ContextProjectionRequest(
                        run_id=run_id,
                        turn_id=turn_id,
                        active_request_event_id=run_started_event.event_id,
                        canonical_history=conversation,
                        history_groups=tuple(history_groups),
                        unresolved_commitments=unresolved_commitments,
                        tools=tuple(
                            tool.definition for tool in self._tools.values()
                        ),
                        system_policy_identity=self._system_policy_identity,
                        prior_summary_identity=prior_summary_identity,
                    )
                )
            except Exception as error:
                failed_compaction_id = _sha256_json(
                    {
                        "attempt": "proactive",
                        "run_id": run_id,
                        "turn_id": turn_id,
                        "source_history_identity": conversation.identity,
                        "failure": "context_projector_failed",
                    }
                )
                started = self._append(
                    run_id=run_id,
                    event_type="context.compaction_started",
                    phase="candidate",
                    cause=projection_started,
                    turn_id=turn_id,
                    compaction_id=failed_compaction_id,
                    payload={
                        "attempt": "proactive",
                        "trigger": "projector-unavailable-or-invalid",
                        "source_history_identity": conversation.identity,
                    },
                )
                failed = self._append(
                    run_id=run_id,
                    event_type="context.compaction_failed",
                    phase="failed",
                    cause=started,
                    turn_id=turn_id,
                    compaction_id=failed_compaction_id,
                    payload={
                        "attempt": "proactive",
                        "error_code": "context_projector_failed",
                        "error": str(error),
                        "source_history_identity": conversation.identity,
                    },
                )
                return terminal(
                    EventedRunStatus.CONTEXT_COMPACTION_ERROR,
                    error=f"context_projector_failed: {error}",
                    cause=failed,
                )
            for planned_event in projection.events:
                projection_cause = self._append(
                    run_id=run_id,
                    event_type=planned_event.event_type,
                    phase=planned_event.phase,
                    cause=projection_cause,
                    turn_id=turn_id,
                    compaction_id=planned_event.compaction_id,
                    visibility=planned_event.visibility,
                    payload=planned_event.payload,
                )
            if projection.error is not None:
                return terminal(
                    EventedRunStatus.CONTEXT_COMPACTION_ERROR,
                    error=projection.error,
                    cause=projection_cause,
                )
            assert projection.model_context is not None
            model_context = projection.model_context
            if model_context.summary is not None:
                prior_summary_identity = model_context.summary.identity
            prepared = PreparedModelTurn(
                run_id=run_id,
                turn_id=turn_id,
                model_context=model_context,
                tools=tuple(tool.definition for tool in self._tools.values()),
            )
            projected = self._append(
                run_id=run_id,
                event_type="context.projected",
                phase="accepted",
                cause=projection_cause,
                turn_id=turn_id,
                payload={
                    "prepared_turn_identity": prepared.identity,
                    "source_history_identity": conversation.identity,
                    "model_context_identity": model_context.identity,
                    "semantic_context_identity": model_context.semantic_identity,
                    "model_context_schema": model_context.schema_version,
                    "summary_schema": (
                        None
                        if model_context.summary is None
                        else model_context.summary.schema_version
                    ),
                    "context_policy_identity": model_context.context_policy_identity,
                    "input_estimate_tokens": model_context.input_estimate_tokens,
                },
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
            call_message = AssistantToolCall(
                CanonicalToolCall(
                    call_id=call.call_id,
                    tool_name=call.tool_name,
                    arguments=call.arguments,
                )
            )
            conversation = conversation.append(call_message)
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
                tool_observation = tool.execute(call.arguments, signal)
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
            if isinstance(tool_observation, SemanticToolObservation):
                observation = tool_observation.content
                semantic_facts = tool_observation.facts
                semantic_failures = tool_observation.failures
            elif isinstance(tool_observation, str):
                observation = tool_observation
                semantic_facts = ()
                semantic_failures = ()
            else:
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
                payload={
                    "tool_name": call.tool_name,
                    "observation": observation,
                    "semantic_facts": list(semantic_facts),
                    "semantic_failures": list(semantic_failures),
                },
            )
            result_message = ToolResultMessage(
                call_id=call.call_id,
                tool_name=call.tool_name,
                content=observation,
            )
            conversation = conversation.append(result_message)
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
                    "semantic_facts": list(semantic_facts),
                    "semantic_failures": list(semantic_failures),
                    "history_identity": conversation.identity,
                },
            )
            history_groups.append(
                ProjectionHistoryGroup(
                    call=call_message,
                    result=result_message,
                    call_event_id=history_event.event_id,
                    result_event_id=last_event.event_id,
                    facts=semantic_facts,
                    failures=semantic_failures,
                )
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
        compaction_id: str | None = None,
        visibility: str = "public",
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
            compaction_id=compaction_id,
            visibility=visibility,
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
        if event.event_type in _COMPACTION_EVENT_TYPES and not event.compaction_id:
            raise ValueError(f"missing compaction ID at line {line_number}")
        expected_compaction_phase = _COMPACTION_EVENT_PHASES.get(event.event_type)
        if (
            expected_compaction_phase is not None
            and event.phase != expected_compaction_phase
        ):
            raise ValueError(f"invalid compaction phase at line {line_number}")
        if event.event_type in {
            "context.compaction_completed",
            "context.compaction_failed",
        }:
            matching_start = events[-1] if events else None
            if (
                matching_start is None
                or matching_start.event_type != "context.compaction_started"
                or matching_start.compaction_id != event.compaction_id
                or event.caused_by_event_id != matching_start.event_id
            ):
                raise ValueError(
                    f"invalid compaction start linkage at line {line_number}"
                )
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


def render_run_events(
    events: Sequence[RunEvent],
    *,
    explain_compaction: bool = False,
) -> str:
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
            detail = f" observation={_display_tool_observation(event.payload.get('observation'))}"
        elif event.event_type == "context.compaction_completed":
            artifact_refs = event.payload.get("artifact_refs")
            artifact_count = len(artifact_refs) if isinstance(artifact_refs, list) else 0
            detail = (
                f" context={_short_identity(event.payload.get('result_context_identity'))}"
                f" summary={_short_identity(event.payload.get('summary_identity'))}"
                f" artifacts={artifact_count}"
            )
        lines.append(
            f"{event.sequence:03d} [{event.phase}] {event.event_type}{detail}"
        )
        if explain_compaction and event.event_type == "context.compaction_completed":
            lines.extend(_render_compaction_explanation(event))
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


def replay_run_event_log(path: Path, *, explain_compaction: bool = False) -> str:
    """Replay a retained Run without constructing a ModelGateway or tool Adapter."""

    return render_run_events(
        load_run_event_log(path),
        explain_compaction=explain_compaction,
    )


def _candidate_kind(candidate: CandidateAction) -> str:
    return "tool_call" if isinstance(candidate, CandidateToolCall) else "final"


def _require_demo_stage(value: object) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("demo stage count must be a positive integer")


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


def _display_tool_observation(value: object) -> str:
    if not isinstance(value, str):
        return _display_value(value)
    body = value.encode("utf-8")
    if len(body) <= 512:
        return value
    digest = hashlib.sha256(body).hexdigest()
    return f"<exact body retained: {len(body)} bytes, sha256:{digest}>"


def _short_identity(value: object) -> str:
    if not isinstance(value, str):
        return "unknown"
    return value[:19]


def _render_compaction_explanation(event: RunEvent) -> list[str]:
    trigger = event.payload.get("trigger")
    if not isinstance(trigger, Mapping):
        trigger = {}
    preserved = event.payload.get("preserved_event_ids")
    summarized = event.payload.get("summarized_event_ids")
    atomic_pairs = event.payload.get("atomic_tool_pairs")
    commitments = event.payload.get("unresolved_commitment_keys")
    artifact_refs = event.payload.get("artifact_refs")
    return [
        "    WHY_COMPACT "
        f"input={trigger.get('estimated_input_tokens', 'unknown')} + "
        f"output={trigger.get('requested_output_room', 'unknown')} + "
        f"overhead={trigger.get('provider_protocol_and_tool_overhead', 'unknown')} + "
        f"safety={trigger.get('safety_margin', 'unknown')} > "
        f"window={trigger.get('verified_context_window', 'unknown')}",
        "    PRESERVED "
        f"events={len(preserved) if isinstance(preserved, list) else 0} "
        f"summarized={len(summarized) if isinstance(summarized, list) else 0} "
        f"atomic_pairs={len(atomic_pairs) if isinstance(atomic_pairs, list) else 0} "
        f"commitments={len(commitments) if isinstance(commitments, list) else 0} "
        f"artifacts={len(artifact_refs) if isinstance(artifact_refs, list) else 0}",
        "    IDENTITIES "
        f"history={event.payload.get('source_history_identity')} "
        f"summary={event.payload.get('summary_identity')} "
        f"context={event.payload.get('result_context_identity')}",
    ]


def _sha256_json(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


__all__ = [
    "CandidateFinal",
    "CandidateToolCall",
    "DemoEchoTool",
    "DemoJournalTool",
    "DeterministicDemoGateway",
    "DeterministicLongDemoGateway",
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
