from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from threading import Event

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.context_projection import (
    CanonicalJsonTokenEstimator,
    ContextPolicy,
    InMemoryArtifactStore,
    SemanticContextProjector,
    action_tool_set_identity,
)
from workspace_agent_harness.evented import (
    CandidateFinal,
    CandidateToolCall,
    DemoEchoTool,
    EventedAgentLoop,
    EventedRunStatus,
    ExchangeEvidence,
    ExchangeFailed,
    ExchangeSettled,
    ExchangeUsage,
    JsonlRunEventLog,
    PreparedModelTurn,
    ProviderFailure,
    ProviderFailureKind,
    load_run_event_log,
)
from workspace_agent_harness.translation import ToolResultMessage


class OverflowThenSuccessGateway:
    def __init__(self) -> None:
        self.prepared_turns: list[PreparedModelTurn] = []

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeSettled | ExchangeFailed:
        self.prepared_turns.append(prepared_turn)
        call_number = len(self.prepared_turns)
        if call_number == 1:
            return ExchangeSettled(
                exchange_id="provider-exchange-1",
                candidate=CandidateToolCall(
                    call_id="echo-1",
                    tool_name="echo",
                    arguments={"text": "retain this observation"},
                ),
                evidence=ExchangeEvidence(
                    response_identity="provider-response-1",
                    usage=ExchangeUsage(input_tokens=120, output_tokens=20),
                    duration_ms=11,
                    cost_microusd=13,
                ),
            )
        if call_number == 2:
            return ExchangeFailed(
                exchange_id="provider-exchange-overflow",
                failure=ProviderFailure(
                    kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                    code="context_length_exceeded",
                    message="request exceeded the provider context window",
                ),
                evidence=ExchangeEvidence(
                    response_identity="provider-response-overflow",
                    usage=ExchangeUsage(input_tokens=1_900, output_tokens=0),
                    duration_ms=17,
                    cost_microusd=19,
                ),
            )
        return ExchangeSettled(
            exchange_id="provider-exchange-retry",
            candidate=CandidateFinal("Recovered after semantic compaction."),
            evidence=ExchangeEvidence(
                response_identity="provider-response-retry",
                usage=ExchangeUsage(input_tokens=600, output_tokens=12),
                duration_ms=7,
                cost_microusd=8,
            ),
        )


class TwoOverflowGateway:
    def __init__(self) -> None:
        self.prepared_turns: list[PreparedModelTurn] = []

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeFailed:
        self.prepared_turns.append(prepared_turn)
        attempt = len(self.prepared_turns)
        return ExchangeFailed(
            exchange_id=f"overflow-exchange-{attempt}",
            failure=ProviderFailure(
                kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                code="context_length_exceeded",
                message=f"overflow attempt {attempt}",
            ),
            evidence=ExchangeEvidence(
                response_identity=f"overflow-response-{attempt}",
                usage=ExchangeUsage(input_tokens=2_000 - (attempt * 100)),
                duration_ms=attempt * 5,
                cost_microusd=attempt * 7,
            ),
        )


class RateLimitGateway:
    def __init__(self) -> None:
        self.prepared_turns: list[PreparedModelTurn] = []

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeFailed:
        self.prepared_turns.append(prepared_turn)
        return ExchangeFailed(
            exchange_id="rate-limit-exchange",
            failure=ProviderFailure(
                kind=ProviderFailureKind.RATE_LIMIT,
                code="rate_limit",
                message="try later",
            ),
            evidence=ExchangeEvidence(response_identity="rate-limit-response"),
        )


class OverflowThenMalformedGateway:
    def __init__(self) -> None:
        self.prepared_turns: list[PreparedModelTurn] = []

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeSettled | ExchangeFailed:
        self.prepared_turns.append(prepared_turn)
        if len(self.prepared_turns) == 1:
            return ExchangeFailed(
                exchange_id="malformed-original-overflow",
                failure=ProviderFailure(
                    kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                    code="context_length_exceeded",
                    message="compact before retry",
                ),
                evidence=ExchangeEvidence(
                    response_identity="malformed-overflow-response"
                ),
            )
        return ExchangeSettled(
            exchange_id="malformed-retry",
            candidate=(
                CandidateToolCall("call-1", "echo", {"text": "first"}),
                CandidateToolCall("call-2", "echo", {"text": "second"}),
            ),  # type: ignore[arg-type]
            evidence=ExchangeEvidence(response_identity="malformed-response"),
        )


class ContextOverflowRecoveryTest(unittest.TestCase):
    def test_exact_history_projector_cannot_fake_semantic_overflow_recovery(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            tool = DemoEchoTool()
            gateway = TwoOverflowGateway()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(root / "no-semantic-projector.jsonl"),
                run_id="no-semantic-projector",
            ).run(
                Task(task_id="no-semantic-projector", prompt="Do not truncate."),
                RunLimits(max_steps=1, max_model_calls=3, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.CONTEXT_OVERFLOW, result.status)
            self.assertEqual(1, result.model_calls)
            self.assertEqual(1, len(gateway.prepared_turns))
            events = load_run_event_log(root / "no-semantic-projector.jsonl")
            self.assertEqual("context.overflow_retry_exhausted", events[-2].event_type)
            self.assertEqual(
                "semantic_projector_unavailable",
                events[-2].payload["reason"],
            )
            self.assertNotIn(
                "context.compaction_completed",
                [event.event_type for event in events],
            )

    def test_one_classified_overflow_is_retained_compacted_and_retried_once(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            tool = DemoEchoTool()
            gateway = OverflowThenSuccessGateway()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(root / "overflow-success.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=None,
                        fallback_context_window=2_048,
                        context_window_source="provider catalog fallback",
                        context_window_confidence="low",
                        requested_output_room=512,
                        protocol_tool_overhead_tokens=64,
                        overhead_estimator_id="deterministic-test-overhead/v1",
                        overhead_source="test fixture",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=InMemoryArtifactStore(),
                ),
                run_id="overflow-success",
            ).run(
                Task(task_id="overflow-success", prompt="Use the tool, then finish."),
                RunLimits(max_steps=1, max_model_calls=3, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.COMPLETED, result.status)
            self.assertEqual(3, result.model_calls)
            self.assertEqual(({"text": "retain this observation"},), tool.calls)
            self.assertEqual(3, len(gateway.prepared_turns))
            self.assertEqual(1, gateway.prepared_turns[1].exchange_attempt)
            self.assertEqual(2, gateway.prepared_turns[2].exchange_attempt)
            self.assertEqual(
                "provider-exchange-overflow",
                gateway.prepared_turns[2].retry_of_exchange_id,
            )
            self.assertIsNotNone(gateway.prepared_turns[2].model_context.summary)
            failed_history = gateway.prepared_turns[1].conversation
            self.assertIsInstance(failed_history.messages[-1], ToolResultMessage)
            self.assertEqual(
                "retain this observation",
                failed_history.messages[-1].content,
            )
            retry_context = gateway.prepared_turns[2].model_context
            self.assertEqual(
                failed_history.identity,
                retry_context.source_history_identity,
            )
            assert retry_context.summary is not None
            self.assertIn(
                "retain this observation",
                [entry.content for entry in retry_context.summary.facts],
            )

            events = load_run_event_log(root / "overflow-success.jsonl")
            event_types = [event.event_type for event in events]
            failed_index = event_types.index("model.exchange_failed")
            overflow_compaction_index = next(
                index
                for index, event in enumerate(events)
                if event.event_type == "context.compaction_started"
                and event.payload["attempt"] == "overflow-recovery"
            )
            self.assertLess(failed_index, overflow_compaction_index)
            failed = events[failed_index]
            self.assertEqual("context_overflow", failed.payload["failure_kind"])
            self.assertEqual(
                "provider-response-overflow",
                failed.payload["response_identity"],
            )
            self.assertEqual(1_900, failed.payload["usage"]["input_tokens"])
            self.assertEqual(17, failed.payload["timing"]["duration_ms"])
            self.assertEqual(19, failed.payload["cost"]["microusd"])

            retry_settled = next(
                event
                for event in events
                if event.event_type == "model.exchange_settled"
                and event.payload["exchange_attempt"] == 2
            )
            self.assertEqual(
                "provider-response-retry",
                retry_settled.payload["response_identity"],
            )
            self.assertEqual(600, retry_settled.payload["usage"]["input_tokens"])
            self.assertIn("context.overflow_retry_succeeded", event_types)
            self.assertEqual("completed", events[-1].payload["status"])

            initial_projected = next(
                event
                for event in events
                if event.event_type == "context.projected"
            )
            self.assertEqual(
                {
                    "tokens": 2_048,
                    "provenance": "fallback",
                    "source": "provider catalog fallback",
                    "confidence": "low",
                    "used_for_proactive_fit": False,
                },
                initial_projected.payload["context_window"],
            )

    def test_second_context_overflow_exhausts_one_retry_and_stops(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            tool = DemoEchoTool()
            gateway = TwoOverflowGateway()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(root / "overflow-exhausted.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=None,
                        requested_output_room=512,
                        protocol_tool_overhead_tokens=64,
                        overhead_estimator_id="deterministic-test-overhead/v1",
                        overhead_source="test fixture",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=InMemoryArtifactStore(),
                ),
                run_id="overflow-exhausted",
            ).run(
                Task(task_id="overflow-exhausted", prompt="Must stop after retry."),
                RunLimits(max_steps=1, max_model_calls=3, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.CONTEXT_OVERFLOW, result.status)
            self.assertEqual(2, result.model_calls)
            self.assertEqual((), tool.calls)
            self.assertEqual(2, len(gateway.prepared_turns))
            events = load_run_event_log(root / "overflow-exhausted.jsonl")
            self.assertEqual(
                2,
                sum(event.event_type == "model.exchange_failed" for event in events),
            )
            self.assertEqual(
                1,
                sum(
                    event.event_type == "context.compaction_completed"
                    and event.payload["attempt"] == "overflow-recovery"
                    for event in events
                ),
            )
            self.assertEqual("context.overflow_retry_exhausted", events[-2].event_type)
            self.assertEqual("context_overflow", events[-1].payload["status"])
            self.assertNotIn(
                "context.overflow_retry_succeeded",
                [event.event_type for event in events],
            )

    def test_unrelated_provider_failure_never_enters_overflow_recovery(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            tool = DemoEchoTool()
            gateway = RateLimitGateway()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(root / "rate-limit.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=None,
                        context_window_source="provider metadata unavailable",
                        context_window_confidence="unknown",
                        requested_output_room=512,
                        protocol_tool_overhead_tokens=64,
                        overhead_estimator_id="deterministic-test-overhead/v1",
                        overhead_source="test fixture",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=InMemoryArtifactStore(),
                ),
                run_id="rate-limit",
            ).run(
                Task(task_id="rate-limit", prompt="Do not retry a rate limit."),
                RunLimits(max_steps=1, max_model_calls=3, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.MODEL_ERROR, result.status)
            self.assertEqual(1, result.model_calls)
            self.assertEqual(1, len(gateway.prepared_turns))
            self.assertEqual((), tool.calls)
            events = load_run_event_log(root / "rate-limit.jsonl")
            self.assertEqual("rate_limit", events[-2].payload["failure_kind"])
            self.assertNotIn(
                "context.compaction_started",
                [event.event_type for event in events],
            )
            self.assertEqual(
                {
                    "tokens": None,
                    "provenance": "unknown",
                    "source": "provider metadata unavailable",
                    "confidence": "unknown",
                    "used_for_proactive_fit": False,
                },
                next(
                    event
                    for event in events
                    if event.event_type == "context.projected"
                ).payload["context_window"],
            )

    def test_malformed_retry_candidate_uses_normal_admission_and_no_tool(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            tool = DemoEchoTool()
            gateway = OverflowThenMalformedGateway()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(root / "malformed-retry.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=None,
                        requested_output_room=512,
                        protocol_tool_overhead_tokens=64,
                        overhead_estimator_id="deterministic-test-overhead/v1",
                        overhead_source="test fixture",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=InMemoryArtifactStore(),
                ),
                run_id="malformed-retry",
            ).run(
                Task(task_id="malformed-retry", prompt="Reject malformed retry."),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.PROTOCOL_ERROR, result.status)
            self.assertEqual(2, result.model_calls)
            self.assertEqual((), tool.calls)
            events = load_run_event_log(root / "malformed-retry.jsonl")
            event_types = [event.event_type for event in events]
            self.assertIn("context.overflow_retry_succeeded", event_types)
            self.assertIn("candidate.rejected", event_types)
            self.assertNotIn("tool.execution_started", event_types)
            self.assertEqual("protocol_error", events[-1].payload["status"])


if __name__ == "__main__":
    unittest.main()
