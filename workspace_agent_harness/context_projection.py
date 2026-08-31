from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, Protocol, Sequence

from workspace_agent_harness.translation import (
    ActionTool,
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    ToolResultMessage,
    UserMessage,
    canonical_json_bytes,
    identity_sha256,
)


MODEL_CONTEXT_SCHEMA_VERSION = "model-context/v1"
SEMANTIC_SUMMARY_SCHEMA_VERSION = "semantic-summary/v1"
CONTEXT_POLICY_SCHEMA_VERSION = "context-policy/v1"
ARTIFACT_REFERENCE_SCHEMA_VERSION = "artifact-reference/v1"
DEFAULT_LARGE_TOOL_OUTPUT_BYTES = 32_768
DEFAULT_PREVIEW_EDGE_BYTES = 2_048
PREVIEW_POLICY_IDENTITY = "utf8-head-tail-2048-bytes/v1"


def _require_positive_integer(value: object, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")


def _require_non_empty_text(value: object, label: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be non-empty text")


@dataclass(frozen=True)
class ContextPolicy:
    verified_context_window: int | None
    requested_output_room: int
    protocol_tool_overhead_tokens: int
    overhead_estimator_id: str
    overhead_source: str
    overhead_confidence: str
    overhead_tool_set_identity: str
    system_policy_identity: str
    large_tool_output_bytes: int = DEFAULT_LARGE_TOOL_OUTPUT_BYTES
    preview_edge_bytes: int = DEFAULT_PREVIEW_EDGE_BYTES
    fallback_context_window: int | None = None
    context_window_source: str | None = None
    context_window_confidence: str | None = None

    def __post_init__(self) -> None:
        if self.verified_context_window is not None:
            _require_positive_integer(
                self.verified_context_window,
                "verified Context window",
            )
        if self.fallback_context_window is not None:
            _require_positive_integer(
                self.fallback_context_window,
                "fallback Context window",
            )
        if (
            self.verified_context_window is not None
            and self.fallback_context_window is not None
        ):
            raise ValueError(
                "Context policy cannot contain both verified and fallback windows"
            )
        _require_positive_integer(self.requested_output_room, "requested output room")
        if (
            isinstance(self.protocol_tool_overhead_tokens, bool)
            or not isinstance(self.protocol_tool_overhead_tokens, int)
            or self.protocol_tool_overhead_tokens < 0
        ):
            raise ValueError("protocol/tool overhead must be a non-negative integer")
        for label, value in (
            ("overhead estimator identity", self.overhead_estimator_id),
            ("overhead source", self.overhead_source),
            ("overhead confidence", self.overhead_confidence),
            ("overhead tool-set identity", self.overhead_tool_set_identity),
            ("system policy identity", self.system_policy_identity),
        ):
            _require_non_empty_text(value, label)
        _require_positive_integer(
            self.large_tool_output_bytes,
            "large tool output threshold",
        )
        _require_positive_integer(self.preview_edge_bytes, "preview edge size")
        if self.large_tool_output_bytes != DEFAULT_LARGE_TOOL_OUTPUT_BYTES:
            raise ValueError("v1 large tool output threshold must be 32768 bytes")
        if self.preview_edge_bytes != DEFAULT_PREVIEW_EDGE_BYTES:
            raise ValueError("v1 UTF-8 preview edge must be 2048 bytes")
        if (self.context_window_source is None) != (
            self.context_window_confidence is None
        ):
            raise ValueError(
                "Context window source and confidence must be supplied together"
            )
        if self.context_window_source is not None:
            _require_non_empty_text(
                self.context_window_source,
                "Context window source",
            )
            assert self.context_window_confidence is not None
            _require_non_empty_text(
                self.context_window_confidence,
                "Context window confidence",
            )

    @property
    def safety_margin(self) -> int:
        if self.verified_context_window is None:
            return 0
        return max(1_024, math.ceil(0.05 * self.verified_context_window))

    def identity_material(self) -> object:
        return {
            "schema_version": CONTEXT_POLICY_SCHEMA_VERSION,
            "verified_context_window": self.verified_context_window,
            "fallback_context_window": self.fallback_context_window,
            "context_window": self.context_window_metadata,
            "requested_output_room": self.requested_output_room,
            "protocol_tool_overhead_tokens": self.protocol_tool_overhead_tokens,
            "overhead_estimator_id": self.overhead_estimator_id,
            "overhead_source": self.overhead_source,
            "overhead_confidence": self.overhead_confidence,
            "overhead_tool_set_identity": self.overhead_tool_set_identity,
            "system_policy_identity": self.system_policy_identity,
            "safety_margin_rule": "max(1024,ceil(0.05*window))/v1",
            "large_tool_output_bytes": self.large_tool_output_bytes,
            "preview_edge_bytes": self.preview_edge_bytes,
            "preview_policy_identity": PREVIEW_POLICY_IDENTITY,
        }

    @property
    def identity(self) -> str:
        return identity_sha256(self.identity_material())

    @property
    def context_window_metadata(self) -> dict[str, object]:
        if self.verified_context_window is not None:
            tokens = self.verified_context_window
            provenance = "verified"
            default_source = "context-policy verified_context_window"
            default_confidence = "high"
        elif self.fallback_context_window is not None:
            tokens = self.fallback_context_window
            provenance = "fallback"
            default_source = "context-policy fallback_context_window"
            default_confidence = "low"
        else:
            tokens = None
            provenance = "unknown"
            default_source = "not supplied"
            default_confidence = "unknown"
        return {
            "tokens": tokens,
            "provenance": provenance,
            "source": self.context_window_source or default_source,
            "confidence": self.context_window_confidence or default_confidence,
            "used_for_proactive_fit": self.verified_context_window is not None,
        }


class TokenEstimator(Protocol):
    identity: str
    source: str
    confidence: str

    def estimate(self, model_visible_material: object) -> int: ...


class CanonicalJsonTokenEstimator:
    """Deterministic, explicitly low-confidence local estimator for offline tests."""

    identity = "canonical-json-utf8-bytes-div4/v1"
    source = "local canonical JSON heuristic"
    confidence = "low"

    def estimate(self, model_visible_material: object) -> int:
        byte_count = len(canonical_json_bytes(model_visible_material))
        return max(1, math.ceil(byte_count / 4))


@dataclass(frozen=True)
class SemanticToolObservation:
    """Exact tool body plus typed, source-attributable compaction semantics."""

    content: str
    facts: tuple[str, ...]
    failures: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.content, str):
            raise ValueError("semantic tool observation content must be text")
        if not self.facts:
            raise ValueError("semantic tool observation must retain at least one fact")
        for value in (*self.facts, *self.failures):
            _require_non_empty_text(value, "semantic observation entry")


@dataclass(frozen=True)
class ArtifactReference:
    artifact_id: str
    locator: str
    sha256: str
    byte_count: int
    media_type: str
    preview: str
    preview_policy_identity: str = PREVIEW_POLICY_IDENTITY
    schema_version: str = ARTIFACT_REFERENCE_SCHEMA_VERSION

    def __post_init__(self) -> None:
        for label, value in (
            ("artifact ID", self.artifact_id),
            ("artifact locator", self.locator),
            ("artifact SHA-256", self.sha256),
            ("artifact media type", self.media_type),
            ("preview policy identity", self.preview_policy_identity),
            ("artifact schema version", self.schema_version),
        ):
            _require_non_empty_text(value, label)
        if not self.sha256.startswith("sha256:"):
            raise ValueError("artifact SHA-256 must use the sha256: prefix")
        if self.artifact_id != self.sha256:
            raise ValueError("artifact ID must equal its content SHA-256")
        if isinstance(self.byte_count, bool) or not isinstance(self.byte_count, int):
            raise ValueError("artifact byte count must be an integer")
        if self.byte_count < 0:
            raise ValueError("artifact byte count must be non-negative")
        if not isinstance(self.preview, str):
            raise ValueError("artifact preview must be text")
        if self.schema_version != ARTIFACT_REFERENCE_SCHEMA_VERSION:
            raise ValueError("unsupported artifact reference schema")

    def as_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "artifact_id": self.artifact_id,
            "locator": self.locator,
            "sha256": self.sha256,
            "byte_count": self.byte_count,
            "media_type": self.media_type,
            "preview": self.preview,
            "preview_policy_identity": self.preview_policy_identity,
        }

    @classmethod
    def from_mapping(cls, value: Mapping[str, object]) -> "ArtifactReference":
        expected = {
            "schema_version",
            "artifact_id",
            "locator",
            "sha256",
            "byte_count",
            "media_type",
            "preview",
            "preview_policy_identity",
        }
        if set(value) != expected:
            raise ValueError("artifact reference fields do not match the schema")
        return cls(**dict(value))  # type: ignore[arg-type]


@dataclass(frozen=True)
class ArtifactRetention:
    reference: ArtifactReference
    created: bool


class ArtifactStore(Protocol):
    def retain_text(self, content: str) -> ArtifactRetention: ...

    def recover(self, reference: ArtifactReference | Mapping[str, object]) -> bytes: ...


class FileArtifactStore:
    """Content-addressed local Evidence store; event refs never expose its root."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=False)

    def retain_text(self, content: str) -> ArtifactRetention:
        body = content.encode("utf-8")
        digest = hashlib.sha256(body).hexdigest()
        locator = f"{digest}.txt"
        path = self.root / locator
        created = False
        try:
            with path.open("xb") as stream:
                stream.write(body)
            created = True
        except FileExistsError:
            if path.read_bytes() != body:
                raise ValueError("existing artifact bytes do not match content identity")
        reference = ArtifactReference(
            artifact_id=f"sha256:{digest}",
            locator=locator,
            sha256=f"sha256:{digest}",
            byte_count=len(body),
            media_type="text/plain; charset=utf-8",
            preview=_utf8_head_tail_preview(body, DEFAULT_PREVIEW_EDGE_BYTES),
        )
        return ArtifactRetention(reference=reference, created=created)

    def recover(self, reference: ArtifactReference | Mapping[str, object]) -> bytes:
        parsed = (
            reference
            if isinstance(reference, ArtifactReference)
            else ArtifactReference.from_mapping(reference)
        )
        digest = parsed.sha256.removeprefix("sha256:")
        expected_locator = f"{digest}.txt"
        if parsed.locator != expected_locator:
            raise ValueError("artifact locator does not match its content identity")
        body = (self.root / expected_locator).read_bytes()
        if len(body) != parsed.byte_count:
            raise ValueError("recovered artifact byte count mismatch")
        if hashlib.sha256(body).hexdigest() != digest:
            raise ValueError("recovered artifact hash mismatch")
        return body


class InMemoryArtifactStore:
    """Second Adapter for deterministic external-behavior tests."""

    def __init__(self) -> None:
        self._bodies: dict[str, bytes] = {}

    def retain_text(self, content: str) -> ArtifactRetention:
        body = content.encode("utf-8")
        digest = hashlib.sha256(body).hexdigest()
        locator = f"{digest}.txt"
        created = digest not in self._bodies
        self._bodies.setdefault(digest, body)
        return ArtifactRetention(
            reference=ArtifactReference(
                artifact_id=f"sha256:{digest}",
                locator=locator,
                sha256=f"sha256:{digest}",
                byte_count=len(body),
                media_type="text/plain; charset=utf-8",
                preview=_utf8_head_tail_preview(body, DEFAULT_PREVIEW_EDGE_BYTES),
            ),
            created=created,
        )

    def recover(self, reference: ArtifactReference | Mapping[str, object]) -> bytes:
        parsed = (
            reference
            if isinstance(reference, ArtifactReference)
            else ArtifactReference.from_mapping(reference)
        )
        digest = parsed.sha256.removeprefix("sha256:")
        if parsed.locator != f"{digest}.txt":
            raise ValueError("artifact locator does not match its content identity")
        try:
            body = self._bodies[digest]
        except KeyError as error:
            raise FileNotFoundError(parsed.locator) from error
        if len(body) != parsed.byte_count or hashlib.sha256(body).hexdigest() != digest:
            raise ValueError("recovered artifact integrity mismatch")
        return body


@dataclass(frozen=True)
class SourcedSummaryEntry:
    key: str
    content: str
    source_event_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        _require_non_empty_text(self.key, "summary entry key")
        _require_non_empty_text(self.content, "summary entry content")
        if not self.source_event_ids:
            raise ValueError("summary entry must cite at least one source event")
        for source_event_id in self.source_event_ids:
            _require_non_empty_text(source_event_id, "summary source event ID")

    def identity_material(self) -> object:
        return {
            "key": self.key,
            "content": self.content,
            "source_event_ids": list(self.source_event_ids),
        }


@dataclass(frozen=True)
class SourcedArtifactReference:
    reference: ArtifactReference
    source_event_ids: tuple[str, ...]

    def __post_init__(self) -> None:
        if not self.source_event_ids:
            raise ValueError("summary artifact must cite at least one source event")

    def identity_material(self) -> object:
        return {
            "reference": self.reference.as_dict(),
            "source_event_ids": list(self.source_event_ids),
        }


@dataclass(frozen=True)
class SemanticSummary:
    active_request: SourcedSummaryEntry
    facts: tuple[SourcedSummaryEntry, ...]
    unresolved_commitments: tuple[SourcedSummaryEntry, ...]
    decisions: tuple[SourcedSummaryEntry, ...]
    failures: tuple[SourcedSummaryEntry, ...]
    artifact_refs: tuple[SourcedArtifactReference, ...]
    source_history_identity: str
    prior_summary_identity: str | None
    system_policy_identity: str
    tool_set_identity: str
    schema_version: str = SEMANTIC_SUMMARY_SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.schema_version != SEMANTIC_SUMMARY_SCHEMA_VERSION:
            raise ValueError("unsupported semantic summary schema")
        for label, value in (
            ("source history identity", self.source_history_identity),
            ("system policy identity", self.system_policy_identity),
            ("tool-set identity", self.tool_set_identity),
        ):
            _require_non_empty_text(value, label)
        if self.prior_summary_identity is not None:
            _require_non_empty_text(
                self.prior_summary_identity,
                "prior summary identity",
            )

    def identity_material(self) -> object:
        return {
            "schema_version": self.schema_version,
            "active_request": self.active_request.identity_material(),
            "facts": [entry.identity_material() for entry in self.facts],
            "unresolved_commitments": [
                entry.identity_material() for entry in self.unresolved_commitments
            ],
            "decisions": [entry.identity_material() for entry in self.decisions],
            "failures": [entry.identity_material() for entry in self.failures],
            "artifact_refs": [entry.identity_material() for entry in self.artifact_refs],
            "source_history_identity": self.source_history_identity,
            "prior_summary_identity": self.prior_summary_identity,
            "system_policy_identity": self.system_policy_identity,
            "tool_set_identity": self.tool_set_identity,
        }

    @property
    def identity(self) -> str:
        return identity_sha256(self.identity_material())


@dataclass(frozen=True)
class ProjectionHistoryGroup:
    call: AssistantToolCall
    results: tuple[ToolResultMessage, ...]
    call_event_id: str
    result_event_ids: tuple[str, ...]
    facts: tuple[tuple[str, ...], ...]
    failures: tuple[tuple[str, ...], ...] = ()

    def __post_init__(self) -> None:
        if not self.results or len(self.call.calls) != len(self.results):
            raise ValueError("history group must retain one result per assistant call")
        if len(self.result_event_ids) != len(self.results):
            raise ValueError("history group must retain one event per tool result")
        if len(self.facts) != len(self.results) or (
            self.failures and len(self.failures) != len(self.results)
        ):
            raise ValueError("history group semantic entries must align with results")
        if not self.failures:
            object.__setattr__(
                self,
                "failures",
                tuple(() for _ in self.results),
            )
        for call, result in zip(self.call.calls, self.results, strict=True):
            if call.call_id != result.call_id:
                raise ValueError("history group call/result IDs must match")
            if call.tool_name != result.tool_name:
                raise ValueError("history group call/result tool names must match")
        for event_id in (self.call_event_id, *self.result_event_ids):
            _require_non_empty_text(event_id, "history group event ID")
        for value in (
            entry
            for entries in (*self.facts, *self.failures)
            for entry in entries
        ):
            _require_non_empty_text(value, "history group semantic entry")

    @property
    def messages(self) -> tuple[AssistantToolCall | ToolResultMessage, ...]:
        return (self.call, *self.results)

    @property
    def source_event_ids(self) -> tuple[str, ...]:
        return (self.call_event_id, *self.result_event_ids)


class ContextProjectionAttempt(StrEnum):
    PROACTIVE = "proactive"
    OVERFLOW_RECOVERY = "overflow-recovery"


@dataclass(frozen=True)
class ContextProjectionRequest:
    run_id: str
    turn_id: str
    active_request_event_id: str
    canonical_history: CanonicalConversation
    history_groups: tuple[ProjectionHistoryGroup, ...]
    unresolved_commitments: tuple[SourcedSummaryEntry, ...]
    tools: tuple[ActionTool, ...]
    system_policy_identity: str
    prior_summary_identity: str | None = None
    attempt: ContextProjectionAttempt = ContextProjectionAttempt.PROACTIVE
    overflow_failure_event_id: str | None = None

    def __post_init__(self) -> None:
        for label, value in (
            ("Run ID", self.run_id),
            ("turn ID", self.turn_id),
            ("active request event ID", self.active_request_event_id),
            ("system policy identity", self.system_policy_identity),
        ):
            _require_non_empty_text(value, label)
        messages = self.canonical_history.messages
        if not messages or not isinstance(messages[0], UserMessage):
            raise ValueError("Canonical History must begin with one active user request")
        flattened = tuple(
            message
            for group in self.history_groups
            for message in group.messages
        )
        if messages[1:] != flattened:
            raise ValueError(
                "Canonical History must equal the active request plus complete history groups"
            )
        if not isinstance(self.attempt, ContextProjectionAttempt):
            raise ValueError("Context projection attempt must be typed")
        if self.attempt is ContextProjectionAttempt.OVERFLOW_RECOVERY:
            _require_non_empty_text(
                self.overflow_failure_event_id,
                "overflow failure event ID",
            )
        elif self.overflow_failure_event_id is not None:
            raise ValueError(
                "proactive projection cannot cite an overflow failure event"
            )


@dataclass(frozen=True)
class ModelContext:
    conversation: CanonicalConversation
    summary: SemanticSummary | None
    source_history_identity: str
    system_policy_identity: str
    tool_set_identity: str
    context_policy_identity: str
    input_estimate_tokens: int
    estimator_identity: str
    estimator_source: str
    estimator_confidence: str
    artifact_refs: tuple[ArtifactReference, ...] = ()
    context_window_tokens: int | None = None
    context_window_provenance: str = "unknown"
    context_window_source: str = "not supplied"
    context_window_confidence: str = "unknown"
    schema_version: str = MODEL_CONTEXT_SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.schema_version != MODEL_CONTEXT_SCHEMA_VERSION:
            raise ValueError("unsupported Model Context schema")
        _require_positive_integer(self.input_estimate_tokens, "input estimate")
        for label, value in (
            ("source history identity", self.source_history_identity),
            ("system policy identity", self.system_policy_identity),
            ("tool-set identity", self.tool_set_identity),
            ("Context policy identity", self.context_policy_identity),
            ("estimator identity", self.estimator_identity),
            ("estimator source", self.estimator_source),
            ("estimator confidence", self.estimator_confidence),
            ("Context window provenance", self.context_window_provenance),
            ("Context window source", self.context_window_source),
            ("Context window confidence", self.context_window_confidence),
        ):
            _require_non_empty_text(value, label)
        if self.context_window_tokens is not None:
            _require_positive_integer(
                self.context_window_tokens,
                "Context window",
            )
        if self.context_window_provenance not in {
            "verified",
            "fallback",
            "unknown",
        }:
            raise ValueError("unsupported Context window provenance")
        if (
            self.context_window_provenance == "unknown"
            and self.context_window_tokens is not None
        ):
            raise ValueError("unknown Context window cannot contain a Token value")
        if (
            self.context_window_provenance != "unknown"
            and self.context_window_tokens is None
        ):
            raise ValueError("known Context window provenance requires a Token value")

    def semantic_identity_material(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "conversation": self.conversation.identity_material(),
            "summary": (
                None if self.summary is None else self.summary.identity_material()
            ),
            "source_history_identity": self.source_history_identity,
            "system_policy_identity": self.system_policy_identity,
            "tool_set_identity": self.tool_set_identity,
            "artifact_refs": [reference.as_dict() for reference in self.artifact_refs],
        }

    @property
    def semantic_identity(self) -> str:
        return identity_sha256(self.semantic_identity_material())

    @property
    def identity(self) -> str:
        return identity_sha256(
            {
                **dict(self.semantic_identity_material()),
                "context_policy_identity": self.context_policy_identity,
                "input_estimate_tokens": self.input_estimate_tokens,
                "estimator_identity": self.estimator_identity,
                "estimator_source": self.estimator_source,
                "estimator_confidence": self.estimator_confidence,
                "context_window_tokens": self.context_window_tokens,
                "context_window_provenance": self.context_window_provenance,
                "context_window_source": self.context_window_source,
                "context_window_confidence": self.context_window_confidence,
            }
        )


@dataclass(frozen=True)
class ProjectionEvent:
    event_type: str
    phase: str
    payload: Mapping[str, object]
    compaction_id: str | None = None
    visibility: str = "public"

    def __post_init__(self) -> None:
        object.__setattr__(self, "payload", MappingProxyType(dict(self.payload)))


@dataclass(frozen=True)
class ContextProjection:
    model_context: ModelContext | None
    events: tuple[ProjectionEvent, ...] = ()
    error: str | None = None

    def __post_init__(self) -> None:
        if (self.model_context is None) == (self.error is None):
            raise ValueError("projection must contain exactly one Context or error")

    @property
    def compacted(self) -> bool:
        return any(
            event.event_type == "context.compaction_completed"
            for event in self.events
        )


class ModelContextProjector(Protocol):
    def project(self, request: ContextProjectionRequest) -> ContextProjection: ...


class OverflowRecoveryUnavailableError(RuntimeError):
    """The selected projector cannot produce a semantic overflow projection."""


class ExactContextProjector:
    """Unbounded compatibility Adapter for the accepted short-run #6 behavior."""

    def __init__(self, estimator: TokenEstimator | None = None) -> None:
        self._estimator = estimator or CanonicalJsonTokenEstimator()

    def project(self, request: ContextProjectionRequest) -> ContextProjection:
        if request.attempt is ContextProjectionAttempt.OVERFLOW_RECOVERY:
            raise OverflowRecoveryUnavailableError(
                "overflow recovery requires SemanticContextProjector"
            )
        tool_set_identity = _tool_set_identity(request.tools)
        material = _model_visible_material(request.canonical_history, None)
        estimate = self._estimator.estimate(material)
        return ContextProjection(
            model_context=ModelContext(
                conversation=request.canonical_history,
                summary=None,
                source_history_identity=request.canonical_history.identity,
                system_policy_identity=request.system_policy_identity,
                tool_set_identity=tool_set_identity,
                context_policy_identity="exact-history-context-policy/v1",
                input_estimate_tokens=estimate,
                estimator_identity=self._estimator.identity,
                estimator_source=self._estimator.source,
                estimator_confidence=self._estimator.confidence,
            )
        )


@dataclass(frozen=True)
class _ProjectedGroup:
    source: ProjectionHistoryGroup
    results: tuple[ToolResultMessage, ...]
    artifacts: tuple[ArtifactReference | None, ...]

    @property
    def messages(self) -> tuple[AssistantToolCall | ToolResultMessage, ...]:
        return (self.source.call, *self.results)


class SemanticContextProjector:
    """Fit-aware semantic projector; never mutates or truncates Canonical History."""

    def __init__(
        self,
        *,
        policy: ContextPolicy,
        estimator: TokenEstimator,
        artifact_store: ArtifactStore,
    ) -> None:
        self._policy = policy
        self._estimator = estimator
        self._artifact_store = artifact_store
        self._policy_identity = identity_sha256(
            {
                "policy": policy.identity_material(),
                "input_estimator_identity": estimator.identity,
                "input_estimator_source": estimator.source,
                "input_estimator_confidence": estimator.confidence,
            }
        )

    def project(self, request: ContextProjectionRequest) -> ContextProjection:
        if request.system_policy_identity != self._policy.system_policy_identity:
            raise ValueError(
                "projection request system policy identity does not match Context policy"
            )
        tool_set_identity = _tool_set_identity(request.tools)
        if tool_set_identity != self._policy.overhead_tool_set_identity:
            raise ValueError(
                "protocol/tool overhead estimator does not cover the selected tool set"
            )
        raw_material = _model_visible_material(request.canonical_history, None)
        raw_estimate = self._estimator.estimate(raw_material)
        if (
            request.attempt is ContextProjectionAttempt.PROACTIVE
            and (
                self._policy.verified_context_window is None
                or self._fits(raw_estimate)
            )
        ):
            return ContextProjection(
                model_context=self._model_context(
                    request=request,
                    conversation=request.canonical_history,
                    summary=None,
                    estimate=raw_estimate,
                    tool_set_identity=tool_set_identity,
                    artifact_refs=(),
                )
            )

        compaction_id = identity_sha256(
            {
                "attempt": request.attempt.value,
                "run_id": request.run_id,
                "turn_id": request.turn_id,
                "source_history_identity": request.canonical_history.identity,
                "context_policy_identity": self._policy_identity,
            }
        )
        planned_events: list[ProjectionEvent] = []
        projected_groups: list[_ProjectedGroup] = []
        try:
            for group in request.history_groups:
                projected, retentions = self._project_group(group)
                projected_groups.append(projected)
                for index, (call, retention) in enumerate(
                    zip(group.call.calls, retentions, strict=True)
                ):
                    if retention is not None and retention.created:
                        planned_events.append(
                            ProjectionEvent(
                                event_type="artifact.externalized",
                                phase="accepted",
                                compaction_id=compaction_id,
                                payload={
                                    "attempt": request.attempt.value,
                                    "source_event_ids": [
                                        group.call_event_id,
                                        group.result_event_ids[index],
                                    ],
                                    "tool_call_id": call.call_id,
                                    "artifact": retention.reference.as_dict(),
                                },
                            )
                        )
        except (OSError, ValueError) as error:
            started = self._compaction_started_event(
                request,
                compaction_id,
                raw_estimate,
            )
            planned_events.extend(
                (
                    started,
                    ProjectionEvent(
                        event_type="context.compaction_failed",
                        phase="failed",
                        compaction_id=compaction_id,
                        payload={
                            "attempt": request.attempt.value,
                            "error_code": "artifact_retention_failed",
                            "error": str(error),
                            "source_history_identity": request.canonical_history.identity,
                        },
                    ),
                )
            )
            return ContextProjection(
                model_context=None,
                events=tuple(planned_events),
                error=f"artifact_retention_failed: {error}",
            )

        planned_events.append(
            self._compaction_started_event(
                request,
                compaction_id,
                raw_estimate,
            )
        )
        recent_groups: list[_ProjectedGroup] = []
        omitted_groups = list(projected_groups)
        summary = self._build_summary(
            request,
            omitted_groups,
            tool_set_identity,
        )
        conversation = CanonicalConversation((request.canonical_history.messages[0],))
        estimate = self._estimator.estimate(
            _model_visible_material(conversation, summary)
        )
        if (
            self._policy.verified_context_window is not None
            and not self._fits(estimate)
        ):
            return self._failed_projection(
                planned_events,
                request,
                compaction_id,
                estimate,
                "minimal_semantic_projection_does_not_fit",
            )

        for index in (
            range(len(projected_groups) - 1, -1, -1)
            if self._policy.verified_context_window is not None
            else ()
        ):
            candidate_recent = [projected_groups[index], *recent_groups]
            candidate_omitted = projected_groups[:index]
            candidate_summary = self._build_summary(
                request,
                candidate_omitted,
                tool_set_identity,
            )
            candidate_conversation = CanonicalConversation(
                (
                    request.canonical_history.messages[0],
                    *(
                        message
                        for group in candidate_recent
                        for message in group.messages
                    ),
                )
            )
            candidate_estimate = self._estimator.estimate(
                _model_visible_material(candidate_conversation, candidate_summary)
            )
            if not self._fits(candidate_estimate):
                break
            recent_groups = candidate_recent
            omitted_groups = list(candidate_omitted)
            summary = candidate_summary
            conversation = candidate_conversation
            estimate = candidate_estimate

        artifacts = _unique_artifacts(projected_groups)
        model_context = self._model_context(
            request=request,
            conversation=conversation,
            summary=summary,
            estimate=estimate,
            tool_set_identity=tool_set_identity,
            artifact_refs=artifacts,
        )
        known_event_ids = {
            request.active_request_event_id,
            *(
                event_id
                for group in request.history_groups
                for event_id in group.source_event_ids
            ),
        }
        try:
            _validate_summary(summary, known_event_ids, request)
            _validate_atomic_conversation(conversation)
        except ValueError as error:
            return self._failed_projection(
                planned_events,
                request,
                compaction_id,
                estimate,
                "semantic_preservation_validation_failed",
                detail=str(error),
            )

        preserved_event_ids = [request.active_request_event_id]
        for recent_group in recent_groups:
            preserved_event_ids.extend(recent_group.source.source_event_ids)
        summarized_event_ids = [
            event_id
            for omitted_group in omitted_groups
            for event_id in omitted_group.source.source_event_ids
        ]
        planned_events.append(
            ProjectionEvent(
                event_type="context.compaction_completed",
                phase="accepted",
                compaction_id=compaction_id,
                payload={
                    "attempt": request.attempt.value,
                    "trigger": self._trigger_material(request, raw_estimate),
                    "source_history_identity": request.canonical_history.identity,
                    "preserved_source_history_identity": request.canonical_history.identity,
                    "result_context_identity": model_context.identity,
                    "result_semantic_context_identity": model_context.semantic_identity,
                    "summary_identity": summary.identity,
                    "prior_summary_identity": request.prior_summary_identity,
                    "context_policy_identity": self._policy_identity,
                    "system_policy_identity": self._policy.system_policy_identity,
                    "tool_set_identity": tool_set_identity,
                    "input_estimate_after_compaction": estimate,
                    "preserved_event_ids": preserved_event_ids,
                    "summarized_event_ids": summarized_event_ids,
                    "atomic_tool_pairs": [
                        list(group.source.source_event_ids) for group in recent_groups
                    ],
                    "unresolved_commitment_keys": [
                        entry.key for entry in summary.unresolved_commitments
                    ],
                    "artifact_refs": [reference.as_dict() for reference in artifacts],
                },
            )
        )
        return ContextProjection(
            model_context=model_context,
            events=tuple(planned_events),
        )

    def _project_group(
        self,
        group: ProjectionHistoryGroup,
    ) -> tuple[_ProjectedGroup, tuple[ArtifactRetention | None, ...]]:
        projected_results: list[ToolResultMessage] = []
        artifacts: list[ArtifactReference | None] = []
        retentions: list[ArtifactRetention | None] = []
        for result in group.results:
            body = result.content.encode("utf-8")
            if len(body) <= self._policy.large_tool_output_bytes:
                projected_results.append(result)
                artifacts.append(None)
                retentions.append(None)
                continue
            retention = self._artifact_store.retain_text(result.content)
            reference = retention.reference
            model_visible = json.dumps(
                {
                    "externalized_tool_result": {
                        "artifact_id": reference.artifact_id,
                        "byte_count": reference.byte_count,
                        "locator": reference.locator,
                        "media_type": reference.media_type,
                        "preview": reference.preview,
                        "preview_policy_identity": reference.preview_policy_identity,
                        "sha256": reference.sha256,
                    }
                },
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            projected_results.append(
                ToolResultMessage(
                    call_id=result.call_id,
                    tool_name=result.tool_name,
                    content=model_visible,
                    is_error=result.is_error,
                    provider_metadata=result.provider_metadata,
                )
            )
            artifacts.append(reference)
            retentions.append(retention)
        return (
            _ProjectedGroup(
                source=group,
                results=tuple(projected_results),
                artifacts=tuple(artifacts),
            ),
            tuple(retentions),
        )

    def _build_summary(
        self,
        request: ContextProjectionRequest,
        omitted_groups: Sequence[_ProjectedGroup],
        tool_set_identity: str,
    ) -> SemanticSummary:
        facts: list[SourcedSummaryEntry] = []
        decisions: list[SourcedSummaryEntry] = []
        failures: list[SourcedSummaryEntry] = []
        artifacts: list[SourcedArtifactReference] = []
        for group in omitted_groups:
            for index, (call, result, artifact) in enumerate(
                zip(
                    group.source.call.calls,
                    group.results,
                    group.artifacts,
                    strict=True,
                )
            ):
                source_event_ids = (
                    group.source.call_event_id,
                    group.source.result_event_ids[index],
                )
                fact_values = group.source.facts[index]
                if not fact_values:
                    if artifact is not None:
                        fact_values = (
                            f"Exact result for {call.call_id} is retained as "
                            f"{artifact.artifact_id}.",
                        )
                    else:
                        fact_values = (result.content,)
                for fact_index, content in enumerate(fact_values):
                    facts.append(
                        SourcedSummaryEntry(
                            key=f"{call.call_id}:fact:{fact_index}",
                            content=content,
                            source_event_ids=source_event_ids,
                        )
                    )
                decisions.append(
                    SourcedSummaryEntry(
                        key=f"{call.call_id}:decision",
                        content=(
                            f"Called {call.tool_name} with "
                            f"{json.dumps(dict(call.arguments), ensure_ascii=False, sort_keys=True)}"
                        ),
                        source_event_ids=(group.source.call_event_id,),
                    )
                )
                for failure_index, content in enumerate(
                    group.source.failures[index]
                ):
                    failures.append(
                        SourcedSummaryEntry(
                            key=f"{call.call_id}:failure:{failure_index}",
                            content=content,
                            source_event_ids=source_event_ids,
                        )
                    )
                if artifact is not None:
                    artifacts.append(
                        SourcedArtifactReference(
                            reference=artifact,
                            source_event_ids=source_event_ids,
                        )
                    )
        active_request = request.canonical_history.messages[0]
        assert isinstance(active_request, UserMessage)
        return SemanticSummary(
            active_request=SourcedSummaryEntry(
                key="active-request",
                content=active_request.content,
                source_event_ids=(request.active_request_event_id,),
            ),
            facts=tuple(facts),
            unresolved_commitments=request.unresolved_commitments,
            decisions=tuple(decisions),
            failures=tuple(failures),
            artifact_refs=tuple(artifacts),
            source_history_identity=request.canonical_history.identity,
            prior_summary_identity=request.prior_summary_identity,
            system_policy_identity=request.system_policy_identity,
            tool_set_identity=tool_set_identity,
        )

    def _model_context(
        self,
        *,
        request: ContextProjectionRequest,
        conversation: CanonicalConversation,
        summary: SemanticSummary | None,
        estimate: int,
        tool_set_identity: str,
        artifact_refs: tuple[ArtifactReference, ...],
    ) -> ModelContext:
        window = self._policy.context_window_metadata
        window_tokens = window["tokens"]
        assert window_tokens is None or isinstance(window_tokens, int)
        return ModelContext(
            conversation=conversation,
            summary=summary,
            source_history_identity=request.canonical_history.identity,
            system_policy_identity=request.system_policy_identity,
            tool_set_identity=tool_set_identity,
            context_policy_identity=self._policy_identity,
            input_estimate_tokens=estimate,
            estimator_identity=self._estimator.identity,
            estimator_source=self._estimator.source,
            estimator_confidence=self._estimator.confidence,
            artifact_refs=artifact_refs,
            context_window_tokens=window_tokens,
            context_window_provenance=str(window["provenance"]),
            context_window_source=str(window["source"]),
            context_window_confidence=str(window["confidence"]),
        )

    def _fits(self, input_estimate: int) -> bool:
        assert self._policy.verified_context_window is not None
        return (
            input_estimate
            + self._policy.requested_output_room
            + self._policy.protocol_tool_overhead_tokens
            + self._policy.safety_margin
            <= self._policy.verified_context_window
        )

    def _fit_material(self, input_estimate: int) -> dict[str, object]:
        return {
            "estimated_input_tokens": input_estimate,
            "input_estimator_id": self._estimator.identity,
            "input_estimator_source": self._estimator.source,
            "input_estimator_confidence": self._estimator.confidence,
            "requested_output_room": self._policy.requested_output_room,
            "provider_protocol_and_tool_overhead": (
                self._policy.protocol_tool_overhead_tokens
            ),
            "overhead_estimator_id": self._policy.overhead_estimator_id,
            "overhead_source": self._policy.overhead_source,
            "overhead_confidence": self._policy.overhead_confidence,
            "safety_margin": self._policy.safety_margin,
            "verified_context_window": self._policy.verified_context_window,
            "context_window": self._policy.context_window_metadata,
            "comparison": "sum>verified_context_window",
        }

    def _trigger_material(
        self,
        request: ContextProjectionRequest,
        input_estimate: int,
    ) -> dict[str, object]:
        if request.attempt is ContextProjectionAttempt.PROACTIVE:
            return self._fit_material(input_estimate)
        return {
            "reason": "provider_context_overflow",
            "provider_failure_event_id": request.overflow_failure_event_id,
            "estimated_input_tokens": input_estimate,
            "input_estimator_id": self._estimator.identity,
            "input_estimator_source": self._estimator.source,
            "input_estimator_confidence": self._estimator.confidence,
            "context_window": self._policy.context_window_metadata,
        }

    def _compaction_started_event(
        self,
        request: ContextProjectionRequest,
        compaction_id: str,
        raw_estimate: int,
    ) -> ProjectionEvent:
        return ProjectionEvent(
            event_type="context.compaction_started",
            phase="candidate",
            compaction_id=compaction_id,
            payload={
                "attempt": request.attempt.value,
                "trigger": self._trigger_material(request, raw_estimate),
                "source_history_identity": request.canonical_history.identity,
                "context_policy_identity": self._policy_identity,
            },
        )

    def _failed_projection(
        self,
        planned_events: list[ProjectionEvent],
        request: ContextProjectionRequest,
        compaction_id: str,
        estimate: int,
        error_code: str,
        *,
        detail: str | None = None,
    ) -> ContextProjection:
        error = error_code if detail is None else f"{error_code}: {detail}"
        planned_events.append(
            ProjectionEvent(
                event_type="context.compaction_failed",
                phase="failed",
                compaction_id=compaction_id,
                payload={
                    "attempt": request.attempt.value,
                    "error_code": error_code,
                    "error": error,
                    "source_history_identity": request.canonical_history.identity,
                    "candidate_input_estimate_tokens": estimate,
                    "fit": self._fit_material(estimate),
                },
            )
        )
        return ContextProjection(
            model_context=None,
            events=tuple(planned_events),
            error=error,
        )


def _model_visible_material(
    conversation: CanonicalConversation,
    summary: SemanticSummary | None,
) -> object:
    return {
        "conversation": conversation.identity_material(),
        "semantic_summary": None if summary is None else summary.identity_material(),
    }


def action_tool_set_identity(tools: Sequence[ActionTool]) -> str:
    return identity_sha256(
        {
            "schema_version": "action-tool-set/v1",
            "tools": [tool.identity_material() for tool in tools],
        }
    )


_tool_set_identity = action_tool_set_identity


def _utf8_head_tail_preview(body: bytes, edge_bytes: int) -> str:
    if len(body) <= edge_bytes * 2:
        return body.decode("utf-8")
    head = body[:edge_bytes].decode("utf-8", errors="ignore")
    tail = body[-edge_bytes:].decode("utf-8", errors="ignore")
    return f"{head}\n… <externalized middle> …\n{tail}"


def _unique_artifacts(
    groups: Sequence[_ProjectedGroup],
) -> tuple[ArtifactReference, ...]:
    references: dict[str, ArtifactReference] = {}
    for group in groups:
        for artifact in group.artifacts:
            if artifact is not None:
                references.setdefault(artifact.artifact_id, artifact)
    return tuple(references.values())


def _validate_atomic_conversation(conversation: CanonicalConversation) -> None:
    messages = conversation.messages
    if not messages or not isinstance(messages[0], UserMessage):
        raise ValueError("Model Context must retain the active request")
    tail = messages[1:]
    index = 0
    while index < len(tail):
        assistant = tail[index]
        if not isinstance(assistant, AssistantToolCall):
            raise ValueError("Model Context recent tail must begin with a tool-call turn")
        expected_results = len(assistant.calls)
        selected_results = tail[index + 1 : index + 1 + expected_results]
        if len(selected_results) != expected_results or not all(
            isinstance(result, ToolResultMessage) for result in selected_results
        ):
            raise ValueError("Model Context contains an orphaned tool-call turn")
        for call, result in zip(assistant.calls, selected_results, strict=True):
            assert isinstance(result, ToolResultMessage)
            if call.call_id != result.call_id or call.tool_name != result.tool_name:
                raise ValueError("Model Context call/result correlation mismatch")
        index += 1 + expected_results


def _validate_summary(
    summary: SemanticSummary,
    known_event_ids: set[str],
    request: ContextProjectionRequest,
) -> None:
    active = request.canonical_history.messages[0]
    assert isinstance(active, UserMessage)
    if summary.active_request.content != active.content:
        raise ValueError("summary changed the active request")
    entries = (
        summary.active_request,
        *summary.facts,
        *summary.unresolved_commitments,
        *summary.decisions,
        *summary.failures,
    )
    for entry in entries:
        unknown = set(entry.source_event_ids) - known_event_ids
        if unknown:
            raise ValueError("summary cites an unknown source event")
    for artifact in summary.artifact_refs:
        if set(artifact.source_event_ids) - known_event_ids:
            raise ValueError("summary artifact cites an unknown source event")
    if summary.source_history_identity != request.canonical_history.identity:
        raise ValueError("summary source History identity mismatch")
    if summary.prior_summary_identity != request.prior_summary_identity:
        raise ValueError("summary prior identity mismatch")


__all__ = [
    "ARTIFACT_REFERENCE_SCHEMA_VERSION",
    "ArtifactReference",
    "ArtifactRetention",
    "ArtifactStore",
    "action_tool_set_identity",
    "CanonicalJsonTokenEstimator",
    "ContextPolicy",
    "ContextProjection",
    "ContextProjectionAttempt",
    "ContextProjectionRequest",
    "ExactContextProjector",
    "FileArtifactStore",
    "InMemoryArtifactStore",
    "MODEL_CONTEXT_SCHEMA_VERSION",
    "ModelContext",
    "ModelContextProjector",
    "OverflowRecoveryUnavailableError",
    "ProjectionEvent",
    "ProjectionHistoryGroup",
    "SEMANTIC_SUMMARY_SCHEMA_VERSION",
    "SemanticContextProjector",
    "SemanticSummary",
    "SemanticToolObservation",
    "SourcedSummaryEntry",
    "TokenEstimator",
]
