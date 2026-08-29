from __future__ import annotations

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from threading import Event
from types import MappingProxyType
from typing import Callable, Mapping, Protocol, Sequence, TypeAlias

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.context_projection import (
    ContextProjectionRequest,
    ContextProjectionAttempt,
    ExactContextProjector,
    ModelContext,
    ModelContextProjector,
    OverflowRecoveryUnavailableError,
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
    LOOP_POLICY_STOP = "loop_policy_stop"
    CANCELLED = "cancelled"
    MODEL_ERROR = "model_error"
    PROTOCOL_ERROR = "protocol_error"
    TOOL_ERROR = "tool_error"
    STEP_LIMIT = "step_limit"
    MODEL_CALL_LIMIT = "model_call_limit"
    TIME_LIMIT = "time_limit"
    CONTEXT_COMPACTION_ERROR = "context_compaction_error"
    CONTEXT_OVERFLOW = "context_overflow"


class RunEventView(StrEnum):
    COMPACT = "compact"
    EXPANDED = "expanded"
    TRACE = "trace"


class FieldVisibility(StrEnum):
    PUBLIC = "public"
    EXPANDED = "expanded"
    RESTRICTED = "restricted"
    SECRET_REF = "secret-ref"
    NEVER_DISPLAY = "never-display"


_NEVER_DISPLAY_FIELD_NAMES = {
    "access_token",
    "api_key",
    "auth_token",
    "authorization",
    "chain_of_thought",
    "credential",
    "credentials",
    "password",
    "private_key",
    "raw_reasoning",
    "refresh_token",
    "reasoning",
    "secret",
    "thought",
    "token",
}
_OMITTED = object()
_MAX_RENDERED_TEXT_BYTES = 1_024


def classified_event_field(
    value: object,
    visibility: FieldVisibility | str,
) -> dict[str, object]:
    """Attach field-level display policy without changing retained value identity."""

    try:
        selected = FieldVisibility(visibility)
    except ValueError as error:
        raise ValueError(f"unknown field visibility: {visibility!r}") from error
    return {"$visibility": selected.value, "value": value}


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
    reasoning: str | None = None
    provider_metadata: tuple[tuple[str, str], ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "arguments", MappingProxyType(dict(self.arguments)))
        if self.reasoning is not None and (
            not isinstance(self.reasoning, str) or not self.reasoning
        ):
            raise ValueError("candidate reasoning must be non-empty text when present")


@dataclass(frozen=True)
class CandidateFinal:
    content: str
    disposition: FinalDisposition = FinalDisposition.COMPLETED
    reason_code: str | None = None
    reasoning: str | None = None
    provider_metadata: tuple[tuple[str, str], ...] = ()


CandidateAction: TypeAlias = CandidateToolCall | CandidateFinal


@dataclass(frozen=True)
class PreparedModelTurn:
    run_id: str
    turn_id: str
    model_context: ModelContext
    tools: tuple[ActionTool, ...]
    exchange_attempt: int = 1
    retry_of_exchange_id: str | None = None

    def __post_init__(self) -> None:
        if self.exchange_attempt not in {1, 2}:
            raise ValueError("exchange attempt must be 1 or 2")
        if self.exchange_attempt == 1 and self.retry_of_exchange_id is not None:
            raise ValueError("an original exchange cannot cite a retry source")
        if self.exchange_attempt == 2 and not self.retry_of_exchange_id:
            raise ValueError("a retry exchange must cite its failed exchange")

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
                "exchange_attempt": self.exchange_attempt,
                "retry_of_exchange_id": self.retry_of_exchange_id,
            }
        )


@dataclass(frozen=True)
class ExchangeUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None

    def __post_init__(self) -> None:
        for label, value in (
            ("input Tokens", self.input_tokens),
            ("output Tokens", self.output_tokens),
            ("total Tokens", self.total_tokens),
        ):
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int) or value < 0
            ):
                raise ValueError(f"{label} must be a non-negative integer or unknown")

    def as_dict(self) -> dict[str, int | None]:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
        }


class ProviderDispatchState(StrEnum):
    NOT_DISPATCHED = "not_dispatched"
    UNCERTAIN = "uncertain"
    RESPONSE_RECEIVED = "response_received"


@dataclass(frozen=True)
class ExchangeEvidence:
    response_identity: str = "unreported"
    usage: ExchangeUsage = field(default_factory=ExchangeUsage)
    duration_ms: int | None = None
    cost_microusd: int | None = None
    request_identity: str | None = None
    requested_model: str | None = None
    returned_model: str | None = None
    system_fingerprint: str | None = None
    finish_reason: str | None = None
    dispatch_state: ProviderDispatchState | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.response_identity, str) or not self.response_identity:
            raise ValueError("response identity must be non-empty text")
        for label, value in (
            ("exchange duration", self.duration_ms),
            ("exchange cost", self.cost_microusd),
        ):
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int) or value < 0
            ):
                raise ValueError(f"{label} must be a non-negative integer or unknown")
        if self.dispatch_state is not None and not isinstance(
            self.dispatch_state, ProviderDispatchState
        ):
            raise ValueError("Provider dispatch state must be typed when present")

    def as_event_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "response_identity": self.response_identity,
            "usage": self.usage.as_dict(),
            "timing": {"duration_ms": self.duration_ms},
            "cost": {"microusd": self.cost_microusd},
        }
        provider = {
            key: value
            for key, value in {
                "request_identity": self.request_identity,
                "requested_model": self.requested_model,
                "returned_model": self.returned_model,
                "system_fingerprint": self.system_fingerprint,
                "finish_reason": self.finish_reason,
                "dispatch_state": (
                    None
                    if self.dispatch_state is None
                    else self.dispatch_state.value
                ),
            }.items()
            if value is not None
        }
        if provider:
            payload["provider"] = provider
        return payload


class ModelExchangeException(RuntimeError):
    """A Gateway exception with an explicit Provider dispatch boundary."""

    def __init__(
        self,
        message: str,
        *,
        dispatch_state: ProviderDispatchState,
        evidence: ExchangeEvidence | None = None,
    ) -> None:
        if not isinstance(dispatch_state, ProviderDispatchState):
            raise ValueError("Provider dispatch exception state must be typed")
        self.dispatch_state = dispatch_state
        self.evidence = evidence or ExchangeEvidence(
            response_identity="unreported",
            dispatch_state=dispatch_state,
        )
        super().__init__(message)


class ProviderFailureKind(StrEnum):
    CONTEXT_OVERFLOW = "context_overflow"
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    BALANCE = "balance"
    BUDGET = "budget"
    RATE_LIMIT = "rate_limit"
    TRANSPORT = "transport"
    PROTOCOL = "protocol"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class ProviderFailure:
    kind: ProviderFailureKind
    code: str
    message: str

    def __post_init__(self) -> None:
        if not isinstance(self.kind, ProviderFailureKind):
            raise ValueError("Provider failure kind must be typed")
        for label, value in (("failure code", self.code), ("failure message", self.message)):
            if not isinstance(value, str) or not value:
                raise ValueError(f"{label} must be non-empty text")


@dataclass(frozen=True)
class ExchangeSettled:
    exchange_id: str
    candidate: CandidateAction
    stop_reason: str = "completed"
    evidence: ExchangeEvidence = field(default_factory=ExchangeEvidence)

    def __post_init__(self) -> None:
        for label, value in (
            ("exchange ID", self.exchange_id),
            ("stop reason", self.stop_reason),
        ):
            if not isinstance(value, str) or not value:
                raise ValueError(f"{label} must be non-empty text")
        if not isinstance(self.evidence, ExchangeEvidence):
            raise ValueError("settled exchange evidence must be typed")


@dataclass(frozen=True)
class ExchangeFailed:
    exchange_id: str
    failure: ProviderFailure
    evidence: ExchangeEvidence = field(default_factory=ExchangeEvidence)

    def __post_init__(self) -> None:
        if not isinstance(self.exchange_id, str) or not self.exchange_id:
            raise ValueError("exchange ID must be non-empty text")
        if not isinstance(self.failure, ProviderFailure):
            raise ValueError("Provider failure must be typed")
        if not isinstance(self.evidence, ExchangeEvidence):
            raise ValueError("failed exchange evidence must be typed")


ExchangeResult: TypeAlias = ExchangeSettled | ExchangeFailed


class ModelGateway(Protocol):
    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeResult: ...


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
        event = RunEvent(
            schema_version=RUN_EVENT_SCHEMA_VERSION,
            event_id=_sha256_json(material),
            run_id=run_id,
            sequence=sequence,
            previous_event_hash=previous_hash,
            event_type=event_type,
            phase=phase,
            caused_by_event_id=caused_by_event_id,
            turn_id=turn_id,
            exchange_id=exchange_id,
            candidate_id=candidate_id,
            tool_call_id=tool_call_id,
            compaction_id=compaction_id,
            monotonic_offset_ns=monotonic_offset_ns,
            visibility=visibility,
            payload=dict(payload),
        )
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


class DeterministicOverflowDemoGateway:
    """Offline Provider Adapter for one overflow recovery or exhaustion trace."""

    def __init__(self, *, exhaust_retry: bool = False) -> None:
        self._exhaust_retry = exhaust_retry
        self._prepared_turns: list[PreparedModelTurn] = []

    @property
    def prepared_turns(self) -> tuple[PreparedModelTurn, ...]:
        return tuple(self._prepared_turns)

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeResult:
        self._prepared_turns.append(prepared_turn)
        call_number = len(self._prepared_turns)
        evidence = ExchangeEvidence(
            response_identity=f"overflow-demo-response-{call_number}",
            usage=ExchangeUsage(
                input_tokens=400 - (call_number * 25),
                output_tokens=0 if call_number <= 2 else 12,
            ),
            duration_ms=call_number * 3,
            cost_microusd=call_number * 5,
        )
        if call_number == 1 or (call_number == 2 and self._exhaust_retry):
            return ExchangeFailed(
                exchange_id=f"{prepared_turn.turn_id}:overflow-demo:{call_number}",
                failure=ProviderFailure(
                    kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                    code="context_length_exceeded",
                    message="deterministic Provider Context overflow",
                ),
                evidence=evidence,
            )
        if call_number == 2:
            request = prepared_turn.conversation.messages[0]
            assert isinstance(request, UserMessage)
            return ExchangeSettled(
                exchange_id=f"{prepared_turn.turn_id}:overflow-demo:retry",
                candidate=CandidateToolCall(
                    call_id="overflow-demo-call-1",
                    tool_name="echo",
                    arguments={"text": request.content},
                ),
                evidence=evidence,
            )
        result = prepared_turn.conversation.messages[-1]
        assert isinstance(result, ToolResultMessage)
        return ExchangeSettled(
            exchange_id=f"{prepared_turn.turn_id}:overflow-demo:final",
            candidate=CandidateFinal(
                content=f"Recovered and observed: {result.content}"
            ),
            evidence=evidence,
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
        loop_policy_id: str | None = None,
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
        selected_loop_policy = loop_policy_id or "observation-feedback-v0"
        if selected_loop_policy not in {"observation-feedback-v0", "act-once-v0"}:
            raise ValueError("unsupported Loop Policy identity")
        self._loop_policy_id = selected_loop_policy
        self._record_loop_policy = loop_policy_id is not None
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

        run_started_payload: dict[str, object] = {
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
        }
        if self._record_loop_policy:
            run_started_payload["loop_policy_id"] = self._loop_policy_id
        last_event = self._append(
            run_id=run_id,
            event_type="run.started",
            phase="accepted",
            cause=None,
            payload=run_started_payload,
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

        def record_failed_exchange(
            failed_exchange: ExchangeFailed,
            *,
            exchange_started_event: RunEvent,
            prepared_turn: PreparedModelTurn,
        ) -> RunEvent:
            return self._append(
                run_id=run_id,
                event_type="model.exchange_failed",
                phase="failed",
                cause=exchange_started_event,
                turn_id=prepared_turn.turn_id,
                exchange_id=failed_exchange.exchange_id,
                payload={
                    "exchange_attempt": prepared_turn.exchange_attempt,
                    "retry_of_exchange_id": prepared_turn.retry_of_exchange_id,
                    "prepared_turn_identity": prepared_turn.identity,
                    "model_context_identity": prepared_turn.model_context.identity,
                    "failure_kind": failed_exchange.failure.kind.value,
                    "failure_code": failed_exchange.failure.code,
                    "failure_message": failed_exchange.failure.message,
                    **failed_exchange.evidence.as_event_payload(),
                },
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
                    "projection_attempt": ContextProjectionAttempt.PROACTIVE.value,
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
                    "projection_attempt": ContextProjectionAttempt.PROACTIVE.value,
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
                    "context_window": _model_context_window_payload(model_context),
                },
            )
            exchange_started = self._append(
                run_id=run_id,
                event_type="model.exchange_started",
                phase="candidate",
                cause=projected,
                turn_id=turn_id,
                payload={
                    "prepared_turn_identity": prepared.identity,
                    "exchange_attempt": prepared.exchange_attempt,
                    "retry_of_exchange_id": prepared.retry_of_exchange_id,
                },
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
            recovered_from_overflow = False
            if isinstance(settled, ExchangeFailed):
                original_failure = record_failed_exchange(
                    settled,
                    exchange_started_event=exchange_started,
                    prepared_turn=prepared,
                )
                if settled.failure.kind is not ProviderFailureKind.CONTEXT_OVERFLOW:
                    return terminal(
                        EventedRunStatus.MODEL_ERROR,
                        error=(
                            f"{settled.failure.kind.value}: "
                            f"{settled.failure.code}: {settled.failure.message}"
                        ),
                        cause=original_failure,
                    )
                if model_calls >= limits.max_model_calls:
                    exhausted = self._append(
                        run_id=run_id,
                        event_type="context.overflow_retry_exhausted",
                        phase="failed",
                        cause=original_failure,
                        turn_id=turn_id,
                        exchange_id=settled.exchange_id,
                        payload={
                            "reason": "model_call_budget_unavailable",
                            "allowed_retries": 1,
                            "completed_retries": 0,
                        },
                    )
                    return terminal(
                        EventedRunStatus.CONTEXT_OVERFLOW,
                        error="Context overflow recovery unavailable within model-call limit",
                        cause=exhausted,
                    )

                overflow_projection_started = self._append(
                    run_id=run_id,
                    event_type="context.projection_started",
                    phase="candidate",
                    cause=original_failure,
                    turn_id=turn_id,
                    payload={
                        "projection_attempt": (
                            ContextProjectionAttempt.OVERFLOW_RECOVERY.value
                        ),
                        "history_identity": conversation.identity,
                        "history_schema": "canonical-conversation/v1",
                        "remaining_model_calls": (
                            limits.max_model_calls - model_calls
                        ),
                        "remaining_tool_steps": limits.max_steps - steps,
                        "overflow_failure_event_id": original_failure.event_id,
                        "retry_of_exchange_id": settled.exchange_id,
                    },
                )
                overflow_projection_cause = overflow_projection_started
                try:
                    overflow_projection = self._context_projector.project(
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
                            attempt=(
                                ContextProjectionAttempt.OVERFLOW_RECOVERY
                            ),
                            overflow_failure_event_id=original_failure.event_id,
                        )
                    )
                except OverflowRecoveryUnavailableError as error:
                    exhausted = self._append(
                        run_id=run_id,
                        event_type="context.overflow_retry_exhausted",
                        phase="failed",
                        cause=overflow_projection_started,
                        turn_id=turn_id,
                        exchange_id=settled.exchange_id,
                        payload={
                            "reason": "semantic_projector_unavailable",
                            "allowed_retries": 1,
                            "completed_retries": 0,
                            "error": str(error),
                        },
                    )
                    return terminal(
                        EventedRunStatus.CONTEXT_OVERFLOW,
                        error=str(error),
                        cause=exhausted,
                    )
                except Exception as error:
                    failed_compaction_id = _sha256_json(
                        {
                            "attempt": "overflow-recovery",
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
                        cause=overflow_projection_started,
                        turn_id=turn_id,
                        compaction_id=failed_compaction_id,
                        payload={
                            "attempt": "overflow-recovery",
                            "trigger": "projector-unavailable-or-invalid",
                            "source_history_identity": conversation.identity,
                            "overflow_failure_event_id": original_failure.event_id,
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
                            "attempt": "overflow-recovery",
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
                for planned_event in overflow_projection.events:
                    overflow_projection_cause = self._append(
                        run_id=run_id,
                        event_type=planned_event.event_type,
                        phase=planned_event.phase,
                        cause=overflow_projection_cause,
                        turn_id=turn_id,
                        compaction_id=planned_event.compaction_id,
                        visibility=planned_event.visibility,
                        payload=planned_event.payload,
                    )
                if overflow_projection.error is not None:
                    return terminal(
                        EventedRunStatus.CONTEXT_COMPACTION_ERROR,
                        error=overflow_projection.error,
                        cause=overflow_projection_cause,
                    )
                assert overflow_projection.model_context is not None
                model_context = overflow_projection.model_context
                if model_context.summary is not None:
                    prior_summary_identity = model_context.summary.identity
                prepared = PreparedModelTurn(
                    run_id=run_id,
                    turn_id=turn_id,
                    model_context=model_context,
                    tools=tuple(tool.definition for tool in self._tools.values()),
                    exchange_attempt=2,
                    retry_of_exchange_id=settled.exchange_id,
                )
                projected = self._append(
                    run_id=run_id,
                    event_type="context.projected",
                    phase="accepted",
                    cause=overflow_projection_cause,
                    turn_id=turn_id,
                    payload={
                        "projection_attempt": (
                            ContextProjectionAttempt.OVERFLOW_RECOVERY.value
                        ),
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
                        "context_policy_identity": (
                            model_context.context_policy_identity
                        ),
                        "input_estimate_tokens": (
                            model_context.input_estimate_tokens
                        ),
                        "context_window": _model_context_window_payload(
                            model_context
                        ),
                        "retry_of_exchange_id": settled.exchange_id,
                    },
                )
                exchange_started = self._append(
                    run_id=run_id,
                    event_type="model.exchange_started",
                    phase="candidate",
                    cause=projected,
                    turn_id=turn_id,
                    payload={
                        "prepared_turn_identity": prepared.identity,
                        "exchange_attempt": prepared.exchange_attempt,
                        "retry_of_exchange_id": prepared.retry_of_exchange_id,
                    },
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
                if isinstance(settled, ExchangeFailed):
                    retry_failure = record_failed_exchange(
                        settled,
                        exchange_started_event=exchange_started,
                        prepared_turn=prepared,
                    )
                    if (
                        settled.failure.kind
                        is ProviderFailureKind.CONTEXT_OVERFLOW
                    ):
                        exhausted = self._append(
                            run_id=run_id,
                            event_type="context.overflow_retry_exhausted",
                            phase="failed",
                            cause=retry_failure,
                            turn_id=turn_id,
                            exchange_id=settled.exchange_id,
                            payload={
                                "reason": "retry_context_overflow",
                                "allowed_retries": 1,
                                "completed_retries": 1,
                                "retry_of_exchange_id": (
                                    prepared.retry_of_exchange_id
                                ),
                            },
                        )
                        return terminal(
                            EventedRunStatus.CONTEXT_OVERFLOW,
                            error="Context overflow recovery retry was exhausted",
                            cause=exhausted,
                        )
                    return terminal(
                        EventedRunStatus.MODEL_ERROR,
                        error=(
                            f"{settled.failure.kind.value}: "
                            f"{settled.failure.code}: {settled.failure.message}"
                        ),
                        cause=retry_failure,
                    )
                recovered_from_overflow = True

            if not isinstance(settled, ExchangeSettled):
                failed = self._append(
                    run_id=run_id,
                    event_type="model.exchange_failed",
                    phase="failed",
                    cause=exchange_started,
                    turn_id=turn_id,
                    payload={
                        "error": (
                            "gateway did not return ExchangeSettled or ExchangeFailed"
                        ),
                        "exchange_attempt": prepared.exchange_attempt,
                    },
                )
                return terminal(
                    EventedRunStatus.MODEL_ERROR,
                    error="gateway did not return ExchangeSettled or ExchangeFailed",
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
                    "exchange_attempt": prepared.exchange_attempt,
                    "retry_of_exchange_id": prepared.retry_of_exchange_id,
                    "candidate_kind": (
                        "invalid"
                        if candidate_schema_error is not None
                        else _candidate_kind(settled.candidate)
                    ),
                    "stop_reason": settled.stop_reason,
                    **settled.evidence.as_event_payload(),
                },
            )
            admission_cause = settled_event
            if recovered_from_overflow:
                admission_cause = self._append(
                    run_id=run_id,
                    event_type="context.overflow_retry_succeeded",
                    phase="accepted",
                    cause=settled_event,
                    turn_id=turn_id,
                    exchange_id=settled.exchange_id,
                    payload={
                        "exchange_attempt": prepared.exchange_attempt,
                        "retry_of_exchange_id": prepared.retry_of_exchange_id,
                        "response_identity": (
                            settled.evidence.response_identity
                        ),
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
                    cause=admission_cause,
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
                cause=admission_cause,
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
                    AssistantFinalMessage(
                        settled.candidate.content,
                        reasoning=settled.candidate.reasoning,
                        provider_metadata=settled.candidate.provider_metadata,
                    )
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
                ),
                reasoning=call.reasoning,
                provider_metadata=call.provider_metadata,
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
            if self._loop_policy_id == "act-once-v0":
                return terminal(
                    EventedRunStatus.LOOP_POLICY_STOP,
                    error="act-once Loop Policy stopped after the first retained tool result",
                    cause=last_event,
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
    view: RunEventView | str = RunEventView.COMPACT,
    explain_compaction: bool = False,
) -> str:
    """Render one terminal view as a pure projection of retained events."""

    if not events:
        raise ValueError("cannot render an empty event sequence")
    try:
        selected_view = RunEventView(view)
    except ValueError as error:
        raise ValueError(f"unknown Run Event view: {view!r}") from error
    terminal = events[-1]
    if terminal.event_type != "run.terminal":
        raise ValueError("cannot render a run without a terminal event")
    if selected_view is RunEventView.COMPACT:
        return _render_compact_run_events(events, explain_compaction)
    if selected_view is RunEventView.EXPANDED:
        return _render_expanded_run_events(events, explain_compaction)
    return _render_trace_run_events(events)


def _render_compact_run_events(
    events: Sequence[RunEvent],
    explain_compaction: bool,
) -> str:
    lines = ["VIEW compact", f"RUN {events[0].run_id}"]
    for event in events:
        projected_payload = _project_event_payload(event, RunEventView.COMPACT)
        if projected_payload is _OMITTED:
            continue
        if not isinstance(projected_payload, Mapping):
            continue
        if event.event_type == "run.started":
            lines.append(f"TASK {_display_value(projected_payload.get('prompt'))}")
        elif event.event_type == "candidate.accepted":
            lines.append(
                "ACTION candidate.accepted"
                f" kind={_display_value(projected_payload.get('kind'))}"
                f" tool={_display_value(projected_payload.get('tool_name'))}"
                f" call={_display_value(projected_payload.get('call_id'))}"
            )
        elif event.event_type == "tool.execution_completed":
            lines.append(
                "OBSERVATION tool.execution_completed"
                f" tool={_display_value(projected_payload.get('tool_name'))}"
                " observation="
                f"{_display_tool_observation(projected_payload.get('observation'))}"
            )
        elif event.event_type == "context.compaction_completed":
            artifact_refs = projected_payload.get("artifact_refs")
            artifact_count = len(artifact_refs) if isinstance(artifact_refs, list) else 0
            lines.append(
                "COMPACTION context.compaction_completed"
                f" attempt={_display_value(projected_payload.get('attempt'))}"
                f" context={_short_identity(projected_payload.get('result_context_identity'))}"
                f" summary={_short_identity(projected_payload.get('summary_identity'))}"
                f" artifacts={artifact_count}"
            )
        elif event.event_type == "model.exchange_failed":
            lines.append(
                "RECOVERY model.exchange_failed"
                f" attempt={_display_value(projected_payload.get('exchange_attempt'))}"
                f" kind={_display_value(projected_payload.get('failure_kind'))}"
                f" response={_short_identity(projected_payload.get('response_identity'))}"
            )
        elif event.event_type == "context.overflow_retry_succeeded":
            lines.append(
                "RETRY context.overflow_retry_succeeded retry=success"
                f" response={_short_identity(projected_payload.get('response_identity'))}"
            )
        elif event.event_type == "context.overflow_retry_exhausted":
            lines.append(
                "RETRY context.overflow_retry_exhausted retry=exhausted"
                f" reason={_display_value(projected_payload.get('reason'))}"
            )
        if explain_compaction and event.event_type == "context.compaction_completed":
            lines.extend(_render_compaction_explanation(event, projected_payload))
    terminal = events[-1]
    terminal_payload = _project_event_payload(terminal, RunEventView.COMPACT)
    assert isinstance(terminal_payload, Mapping)
    lines.append(_render_terminal_summary(terminal_payload))
    return "\n".join(lines) + "\n"


def _render_expanded_run_events(
    events: Sequence[RunEvent],
    explain_compaction: bool,
) -> str:
    lines = ["VIEW expanded", f"RUN {events[0].run_id}"]
    for event in events:
        projected_payload = _project_event_payload(event, RunEventView.EXPANDED)
        if projected_payload is _OMITTED:
            continue
        label = "SETTLED"
        if event.event_type == "model.exchange_settled":
            label = "CANDIDATE"
        elif event.phase == "candidate":
            label = "IN_FLIGHT"
        elif event.event_type == "candidate.accepted":
            label = "ADMITTED"
        elif event.phase == "failed":
            label = "FAILED"
        elif event.phase == "terminal":
            label = "TERMINAL_EVENT"
        lines.append(
            f"{label} {event.event_type} seq={event.sequence:03d}"
            f" cause={event.caused_by_event_id or '-'}"
            f" turn={event.turn_id or '-'}"
            f" exchange={event.exchange_id or '-'}"
            f" candidate={event.candidate_id or '-'}"
            f" tool_call={event.tool_call_id or '-'}"
            f" compaction={event.compaction_id or '-'}"
            f" visibility={event.visibility}"
            f" payload={_canonical_json(projected_payload)}"
        )
        if explain_compaction and event.event_type == "context.compaction_completed":
            assert isinstance(projected_payload, Mapping)
            lines.extend(_render_compaction_explanation(event, projected_payload))
    terminal_payload = _project_event_payload(events[-1], RunEventView.EXPANDED)
    assert isinstance(terminal_payload, Mapping)
    lines.append(_render_terminal_summary(terminal_payload))
    return "\n".join(lines) + "\n"


def _render_trace_run_events(events: Sequence[RunEvent]) -> str:
    lines = ["VIEW trace", f"RUN {events[0].run_id}"]
    for event in events:
        material = event.as_dict()
        material["payload"] = _project_event_payload(event, RunEventView.TRACE)
        lines.append(f"TRACE {_canonical_json(material)}")
    terminal_payload = _project_event_payload(events[-1], RunEventView.TRACE)
    assert isinstance(terminal_payload, Mapping)
    lines.append(_render_terminal_summary(terminal_payload))
    return "\n".join(lines) + "\n"


def _render_terminal_summary(payload: Mapping[str, object]) -> str:
    status = payload.get("status")
    output = payload.get("output")
    error = payload.get("error")
    if isinstance(output, str):
        return f"TERMINAL {status}: {output}"
    if isinstance(error, str):
        return f"TERMINAL {status}: {error}"
    return f"TERMINAL {status}"


def replay_run_event_log(
    path: Path,
    *,
    view: RunEventView | str = RunEventView.COMPACT,
    explain_compaction: bool = False,
) -> str:
    """Replay a retained Run without constructing a ModelGateway or tool Adapter."""

    return render_run_events(
        load_run_event_log(path),
        view=view,
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


def _project_event_payload(
    event: RunEvent,
    view: RunEventView,
) -> object:
    try:
        visibility = FieldVisibility(event.visibility)
    except ValueError:
        return "<never-display>"
    if visibility is FieldVisibility.EXPANDED and view is RunEventView.COMPACT:
        return _OMITTED
    if visibility is FieldVisibility.RESTRICTED:
        return "<restricted>"
    if visibility is FieldVisibility.SECRET_REF:
        return "<secret-ref>"
    if visibility is FieldVisibility.NEVER_DISPLAY:
        return "<never-display>"
    projected = _project_visible_value(dict(event.payload), view)
    if projected is _OMITTED:
        return {}
    return projected


def _project_visible_value(
    value: object,
    view: RunEventView,
    *,
    field_name: str | None = None,
) -> object:
    if isinstance(value, Mapping):
        declared_visibility = value.get("$visibility")
        if declared_visibility is not None:
            try:
                visibility = FieldVisibility(str(declared_visibility))
            except ValueError:
                return "<never-display>"
            if visibility is FieldVisibility.EXPANDED and view is RunEventView.COMPACT:
                return _OMITTED
            if visibility is FieldVisibility.RESTRICTED:
                return "<restricted>"
            if visibility is FieldVisibility.SECRET_REF:
                return "<secret-ref>"
            if visibility is FieldVisibility.NEVER_DISPLAY:
                return "<never-display>"
            if field_name is not None and _is_never_display_field(field_name):
                return "<never-display>"
            return _project_visible_value(value.get("value"), view)
    if field_name is not None and _is_never_display_field(field_name):
        return "<never-display>"
    if isinstance(value, Mapping):
        projected: dict[str, object] = {}
        for key, item in value.items():
            key_text = str(key)
            visible = _project_visible_value(item, view, field_name=key_text)
            if visible is not _OMITTED:
                projected[key_text] = visible
        return projected
    if isinstance(value, (list, tuple)):
        projected_items = [
            _project_visible_value(item, view)
            for item in value
        ]
        return [item for item in projected_items if item is not _OMITTED]
    if isinstance(value, str):
        body = value.encode("utf-8")
        if len(body) > _MAX_RENDERED_TEXT_BYTES:
            return (
                f"<exact text retained: {len(body)} bytes, "
                f"sha256:{hashlib.sha256(body).hexdigest()}>"
            )
    return value


def _is_never_display_field(field_name: str) -> bool:
    normalized = field_name.casefold().replace("-", "_").replace(" ", "_")
    return (
        normalized in _NEVER_DISPLAY_FIELD_NAMES
        or "reasoning" in normalized
        or "chain_of_thought" in normalized
        or "credential" in normalized
        or "secret" in normalized
        or normalized.endswith("_api_key")
    )


def _model_context_window_payload(model_context: ModelContext) -> dict[str, object]:
    return {
        "tokens": model_context.context_window_tokens,
        "provenance": model_context.context_window_provenance,
        "source": model_context.context_window_source,
        "confidence": model_context.context_window_confidence,
        "used_for_proactive_fit": (
            model_context.context_window_provenance == "verified"
        ),
    }


def _render_compaction_explanation(
    event: RunEvent,
    payload: Mapping[str, object] | None = None,
) -> list[str]:
    visible_payload = payload or event.payload
    trigger = visible_payload.get("trigger")
    if not isinstance(trigger, Mapping):
        trigger = {}
    preserved = visible_payload.get("preserved_event_ids")
    summarized = visible_payload.get("summarized_event_ids")
    atomic_pairs = visible_payload.get("atomic_tool_pairs")
    commitments = visible_payload.get("unresolved_commitment_keys")
    artifact_refs = visible_payload.get("artifact_refs")
    attempt = visible_payload.get("attempt")
    if attempt == ContextProjectionAttempt.OVERFLOW_RECOVERY.value:
        window = trigger.get("context_window")
        if not isinstance(window, Mapping):
            window = {}
        why = (
            "    WHY_COMPACT overflow-recovery "
            f"failure={_short_identity(trigger.get('provider_failure_event_id'))} "
            f"window={window.get('tokens', 'unknown')} "
            f"provenance={window.get('provenance', 'unknown')} "
            f"confidence={window.get('confidence', 'unknown')}"
        )
    else:
        why = (
            "    WHY_COMPACT "
            f"input={trigger.get('estimated_input_tokens', 'unknown')} + "
            f"output={trigger.get('requested_output_room', 'unknown')} + "
            f"overhead={trigger.get('provider_protocol_and_tool_overhead', 'unknown')} + "
            f"safety={trigger.get('safety_margin', 'unknown')} > "
            f"window={trigger.get('verified_context_window', 'unknown')}"
        )
    return [
        why,
        "    PRESERVED "
        f"events={len(preserved) if isinstance(preserved, list) else 0} "
        f"summarized={len(summarized) if isinstance(summarized, list) else 0} "
        f"atomic_pairs={len(atomic_pairs) if isinstance(atomic_pairs, list) else 0} "
        f"commitments={len(commitments) if isinstance(commitments, list) else 0} "
        f"artifacts={len(artifact_refs) if isinstance(artifact_refs, list) else 0}",
        "    IDENTITIES "
        f"history={visible_payload.get('source_history_identity')} "
        f"summary={visible_payload.get('summary_identity')} "
        f"context={visible_payload.get('result_context_identity')}",
    ]


def _sha256_json(value: object) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


__all__ = [
    "CandidateFinal",
    "CandidateToolCall",
    "classified_event_field",
    "DemoEchoTool",
    "DemoJournalTool",
    "DeterministicDemoGateway",
    "DeterministicLongDemoGateway",
    "AgentLoop",
    "EventTool",
    "EventedAgentLoop",
    "EventedRunResult",
    "EventedRunStatus",
    "FieldVisibility",
    "ExchangeSettled",
    "ModelExchangeException",
    "FinalDisposition",
    "JsonlRunEventLog",
    "ModelGateway",
    "ProviderDispatchState",
    "PreparedModelTurn",
    "RUN_EVENT_SCHEMA_VERSION",
    "RunEvent",
    "RunEventLog",
    "RunEventView",
    "WaitingDemoGateway",
    "load_run_event_log",
    "render_run_events",
    "replay_run_event_log",
]
