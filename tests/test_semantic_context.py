from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.context_projection import (
    action_tool_set_identity,
    CanonicalJsonTokenEstimator,
    ContextProjectionRequest,
    ContextPolicy,
    ExactContextProjector,
    FileArtifactStore,
    InMemoryArtifactStore,
    ProjectionHistoryGroup,
    SemanticContextProjector,
)
from workspace_agent_harness.evented import (
    DemoEchoTool,
    DemoJournalTool,
    DeterministicDemoGateway,
    DeterministicLongDemoGateway,
    EventedAgentLoop,
    EventedRunStatus,
    JsonlRunEventLog,
    load_run_event_log,
    render_run_events,
    replay_run_event_log,
)
from workspace_agent_harness.translation import (
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    ToolResultMessage,
    UserMessage,
)


class SemanticContextProjectionTest(unittest.TestCase):
    def test_compaction_completion_requires_matching_causal_start(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log = JsonlRunEventLog(Path(temporary_directory) / "causal.jsonl")
            run_started = log.append(
                run_id="causal-compaction",
                event_type="run.started",
                phase="accepted",
                caused_by_event_id=None,
                payload={"task_id": "causal"},
            )
            compaction_started = log.append(
                run_id="causal-compaction",
                event_type="context.compaction_started",
                phase="candidate",
                caused_by_event_id=run_started.event_id,
                compaction_id="compaction-1",
                payload={"attempt": "proactive"},
            )
            with self.assertRaisesRegex(ValueError, "matching start"):
                log.append(
                    run_id="causal-compaction",
                    event_type="context.compaction_completed",
                    phase="accepted",
                    caused_by_event_id=run_started.event_id,
                    compaction_id="compaction-1",
                    payload={"attempt": "proactive"},
                )
            completed = log.append(
                run_id="causal-compaction",
                event_type="context.compaction_completed",
                phase="accepted",
                caused_by_event_id=compaction_started.event_id,
                compaction_id="compaction-1",
                payload={"attempt": "proactive"},
            )
            log.append(
                run_id="causal-compaction",
                event_type="run.terminal",
                phase="terminal",
                caused_by_event_id=completed.event_id,
                payload={"status": "completed"},
            )

    def test_artifact_adapters_share_exact_content_addressed_recovery(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            stores = (
                FileArtifactStore(Path(temporary_directory) / "file-artifacts"),
                InMemoryArtifactStore(),
            )
            body = "first café 🚀\n" + ("证据" * 20_000) + "\nlast"
            for store in stores:
                with self.subTest(store=type(store).__name__):
                    retention = store.retain_text(body)
                    self.assertEqual(body.encode("utf-8"), store.recover(retention.reference))
                    repeated = store.retain_text(body)
                    self.assertFalse(repeated.created)
                    self.assertEqual(retention.reference, repeated.reference)

    def test_fitting_control_does_not_compact_and_matches_exact_semantics(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            semantic_gateway = DeterministicDemoGateway()
            semantic_tool = DemoEchoTool()
            semantic_result = EventedAgentLoop(
                gateway=semantic_gateway,
                tools=(semantic_tool,),
                event_log=JsonlRunEventLog(root / "semantic.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=100_000,
                        requested_output_room=1_000,
                        protocol_tool_overhead_tokens=256,
                        overhead_estimator_id="demo-translation-overhead/v1",
                        overhead_source="deterministic-demo-lock",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (semantic_tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=FileArtifactStore(root / "semantic-artifacts"),
                ),
                run_id="fit-control",
            ).run(
                Task(task_id="fit-control", prompt="short input"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )
            exact_gateway = DeterministicDemoGateway()
            exact_result = EventedAgentLoop(
                gateway=exact_gateway,
                tools=(DemoEchoTool(),),
                event_log=JsonlRunEventLog(root / "exact.jsonl"),
                context_projector=ExactContextProjector(),
                run_id="fit-control",
            ).run(
                Task(task_id="fit-control", prompt="short input"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.COMPLETED, semantic_result.status)
            self.assertEqual(EventedRunStatus.COMPLETED, exact_result.status)
            semantic_events = load_run_event_log(root / "semantic.jsonl")
            self.assertNotIn(
                "context.compaction_started",
                [event.event_type for event in semantic_events],
            )
            self.assertEqual(
                [turn.model_context.semantic_identity for turn in exact_gateway.prepared_turns],
                [
                    turn.model_context.semantic_identity
                    for turn in semantic_gateway.prepared_turns
                ],
            )

    def test_long_run_compacts_before_exchange_and_reaches_expected_terminal(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            log_path = root / "long-run.jsonl"
            artifact_store = FileArtifactStore(root / "artifacts")
            gateway = DeterministicLongDemoGateway(stage_count=3)
            tool = DemoJournalTool(large_stage=1)
            projector = SemanticContextProjector(
                policy=ContextPolicy(
                    verified_context_window=10_000,
                    requested_output_room=6_900,
                    protocol_tool_overhead_tokens=256,
                    overhead_estimator_id="demo-translation-overhead/v1",
                    overhead_source="deterministic-demo-lock",
                    overhead_confidence="high",
                    overhead_tool_set_identity=action_tool_set_identity(
                        (tool.definition,)
                    ),
                    system_policy_identity="evented-demo-policy/v1",
                ),
                estimator=CanonicalJsonTokenEstimator(),
                artifact_store=artifact_store,
            )
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(log_path),
                context_projector=projector,
                run_id="run-proactive-compaction",
            ).run(
                Task(task_id="long-demo", prompt="Record all three stages, then finish."),
                RunLimits(max_steps=3, max_model_calls=4, timeout_seconds=5),
            )

            self.assertEqual(EventedRunStatus.COMPLETED, result.status)
            self.assertEqual(
                "Completed 3 journal stages with preserved semantic context.",
                result.output,
            )
            events = load_run_event_log(log_path)
            event_types = [event.event_type for event in events]
            self.assertIn("artifact.externalized", event_types)
            self.assertIn("context.compaction_started", event_types)
            self.assertIn("context.compaction_completed", event_types)
            self.assertLess(
                event_types.index("context.compaction_completed"),
                event_types.index("model.exchange_started", 10),
            )
            completed = next(
                event
                for event in events
                if event.event_type == "context.compaction_completed"
            )
            self.assertEqual("proactive", completed.payload["attempt"])
            compaction_events = [
                event
                for event in events
                if event.event_type.startswith("context.compaction_")
                or event.event_type == "artifact.externalized"
            ]
            self.assertTrue(all(event.compaction_id for event in compaction_events))
            for finish_event in (
                event
                for event in compaction_events
                if event.event_type == "context.compaction_completed"
            ):
                self.assertTrue(
                    any(
                        start_event.event_type == "context.compaction_started"
                        and start_event.compaction_id == finish_event.compaction_id
                        for start_event in compaction_events
                    )
                )
            self.assertTrue(
                any(
                    event.payload["summarized_event_ids"]
                    and event.payload["atomic_tool_pairs"]
                    for event in compaction_events
                    if event.event_type == "context.compaction_completed"
                )
            )
            self.assertEqual(
                completed.payload["source_history_identity"],
                completed.payload["preserved_source_history_identity"],
            )
            self.assertTrue(completed.payload["summary_identity"])
            self.assertTrue(completed.payload["result_context_identity"])
            artifact_ref = completed.payload["artifact_refs"][0]
            self.assertEqual(
                artifact_ref["sha256"],
                "sha256:"
                + hashlib.sha256(artifact_store.recover(artifact_ref)).hexdigest(),
            )
            self.assertEqual(4, len(gateway.prepared_turns))
            self.assertTrue(
                any(turn.model_context.summary is not None for turn in gateway.prepared_turns)
            )

            compacted_turns = [
                turn
                for turn in gateway.prepared_turns
                if turn.model_context.summary is not None
            ]
            for turn in compacted_turns:
                messages = turn.conversation.messages
                self.assertIsInstance(messages[0], UserMessage)
                self.assertEqual(
                    "Record all three stages, then finish.",
                    messages[0].content,
                )
                self.assertEqual(0, len(messages[1:]) % 2)
                for index in range(1, len(messages), 2):
                    self.assertIsInstance(messages[index], AssistantToolCall)
                    self.assertIsInstance(messages[index + 1], ToolResultMessage)
                    self.assertEqual(
                        messages[index].call.call_id,
                        messages[index + 1].call_id,
                    )
                summary = turn.model_context.summary
                assert summary is not None
                self.assertEqual(
                    "Record all three stages, then finish.",
                    summary.active_request.content,
                )
                self.assertEqual(
                    ["complete-active-request"],
                    [entry.key for entry in summary.unresolved_commitments],
                )
            final_summary = compacted_turns[-1].model_context.summary
            assert final_summary is not None
            self.assertTrue(final_summary.facts)
            self.assertTrue(final_summary.decisions)
            self.assertTrue(final_summary.artifact_refs)
            known_event_ids = {event.event_id for event in events}
            for entry in (*final_summary.facts, *final_summary.decisions):
                self.assertTrue(set(entry.source_event_ids) <= known_event_ids)
            for artifact_entry in final_summary.artifact_refs:
                self.assertTrue(
                    set(artifact_entry.source_event_ids) <= known_event_ids
                )

            exact_tool_bodies = [
                event.payload["content"]
                for event in events
                if event.event_type == "history.advanced"
                and event.payload.get("message_type") == "tool_result"
            ]
            self.assertGreater(len(exact_tool_bodies[0].encode("utf-8")), 32_768)
            recovered = artifact_store.recover(artifact_ref)
            self.assertEqual(exact_tool_bodies[0].encode("utf-8"), recovered)
            first_reduced_result = next(
                message
                for message in compacted_turns[0].conversation.messages
                if isinstance(message, ToolResultMessage)
            )
            reduced_reference = json.loads(first_reduced_result.content)[
                "externalized_tool_result"
            ]
            self.assertEqual(artifact_ref["locator"], reduced_reference["locator"])
            self.assertEqual(artifact_ref["sha256"], reduced_reference["sha256"])
            self.assertLess(
                event_types.index("artifact.externalized"),
                event_types.index("context.compaction_started"),
            )
            start = next(
                event
                for event in events
                if event.event_type == "context.compaction_started"
            )
            trigger = start.payload["trigger"]
            self.assertGreater(
                trigger["estimated_input_tokens"]
                + trigger["requested_output_room"]
                + trigger["provider_protocol_and_tool_overhead"]
                + trigger["safety_margin"],
                trigger["verified_context_window"],
            )

            compact = render_run_events(events)
            expanded = render_run_events(events, explain_compaction=True)
            self.assertNotIn("WHY_COMPACT", compact)
            self.assertIn("WHY_COMPACT", expanded)
            self.assertEqual(
                expanded,
                replay_run_event_log(log_path, explain_compaction=True),
            )

    def test_compaction_keeps_one_multi_call_turn_and_all_results_atomic(self) -> None:
        tool = DemoEchoTool()
        first_call = CanonicalToolCall("batch-a", "echo", {"text": "first"})
        second_call = CanonicalToolCall("batch-b", "echo", {"text": "second"})
        assistant = AssistantToolCall(
            call=first_call,
            additional_calls=(second_call,),
            reasoning="Run two independent reads.",
        )
        first_result = ToolResultMessage(
            "batch-a",
            "echo",
            "large:" + ("evidence" * 6_000),
        )
        second_result = ToolResultMessage("batch-b", "echo", "small-result")
        conversation = CanonicalConversation(
            (UserMessage("retain the complete batch"), assistant, first_result, second_result)
        )
        request = ContextProjectionRequest(
            run_id="batch-compaction",
            turn_id="batch-compaction:turn:2",
            active_request_event_id="event-user",
            canonical_history=conversation,
            history_groups=(
                ProjectionHistoryGroup(
                    call=assistant,
                    results=(first_result, second_result),
                    call_event_id="event-batch",
                    result_event_ids=("event-result-a", "event-result-b"),
                    facts=(("first fact",), ("second fact",)),
                ),
            ),
            unresolved_commitments=(),
            tools=(tool.definition,),
            system_policy_identity="evented-demo-policy/v1",
        )
        projection = SemanticContextProjector(
            policy=ContextPolicy(
                verified_context_window=15_000,
                requested_output_room=6_000,
                protocol_tool_overhead_tokens=256,
                overhead_estimator_id="demo-translation-overhead/v1",
                overhead_source="deterministic-demo-lock",
                overhead_confidence="high",
                overhead_tool_set_identity=action_tool_set_identity(
                    (tool.definition,)
                ),
                system_policy_identity="evented-demo-policy/v1",
            ),
            estimator=CanonicalJsonTokenEstimator(),
            artifact_store=InMemoryArtifactStore(),
        ).project(request)

        self.assertTrue(projection.compacted)
        self.assertIsNotNone(projection.model_context)
        assert projection.model_context is not None
        retained = projection.model_context.conversation.messages
        self.assertEqual(4, len(retained))
        self.assertIsInstance(retained[1], AssistantToolCall)
        assert isinstance(retained[1], AssistantToolCall)
        self.assertEqual(("batch-a", "batch-b"), tuple(call.call_id for call in retained[1].calls))
        self.assertEqual(
            ("batch-a", "batch-b"),
            tuple(message.call_id for message in retained[2:]),
        )
        self.assertIn("externalized_tool_result", retained[2].content)
        self.assertEqual("small-result", retained[3].content)

    def test_projection_fails_closed_before_exchange_when_minimum_cannot_fit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            gateway = DeterministicDemoGateway()
            tool = DemoEchoTool()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(root / "cannot-fit.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=10_000,
                        requested_output_room=9_500,
                        protocol_tool_overhead_tokens=256,
                        overhead_estimator_id="demo-translation-overhead/v1",
                        overhead_source="deterministic-demo-lock",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=FileArtifactStore(root / "cannot-fit-artifacts"),
                ),
                run_id="cannot-fit",
            ).run(
                Task(task_id="cannot-fit", prompt="must fail before exchange"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            events = load_run_event_log(root / "cannot-fit.jsonl")
            event_types = [event.event_type for event in events]
            self.assertEqual(EventedRunStatus.CONTEXT_COMPACTION_ERROR, result.status)
            self.assertEqual(0, result.model_calls)
            self.assertEqual((), gateway.prepared_turns)
            self.assertIn("context.compaction_started", event_types)
            self.assertIn("context.compaction_failed", event_types)
            self.assertNotIn("context.projected", event_types)
            self.assertNotIn("model.exchange_started", event_types)
            self.assertEqual("context_compaction_error", events[-1].payload["status"])

    def test_unaccounted_tool_schema_fails_before_exchange(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            gateway = DeterministicDemoGateway()
            actual_tool = DemoEchoTool()
            different_tool = DemoJournalTool()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(actual_tool,),
                event_log=JsonlRunEventLog(root / "tool-mismatch.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=100_000,
                        requested_output_room=1_000,
                        protocol_tool_overhead_tokens=256,
                        overhead_estimator_id="demo-translation-overhead/v1",
                        overhead_source="deterministic-demo-lock",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (different_tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=FileArtifactStore(root / "tool-mismatch-artifacts"),
                ),
                run_id="tool-mismatch",
            ).run(
                Task(task_id="tool-mismatch", prompt="must fail before exchange"),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            events = load_run_event_log(root / "tool-mismatch.jsonl")
            self.assertEqual(EventedRunStatus.CONTEXT_COMPACTION_ERROR, result.status)
            self.assertEqual((), gateway.prepared_turns)
            self.assertNotIn(
                "model.exchange_started",
                [event.event_type for event in events],
            )
            self.assertIn("does not cover", str(events[-2].payload["error"]))

    def test_oversized_active_request_is_retained_and_never_character_truncated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            prompt = "constraint:" + ("不得删除" * 10_000)
            gateway = DeterministicDemoGateway()
            tool = DemoEchoTool()
            result = EventedAgentLoop(
                gateway=gateway,
                tools=(tool,),
                event_log=JsonlRunEventLog(root / "large-request.jsonl"),
                context_projector=SemanticContextProjector(
                    policy=ContextPolicy(
                        verified_context_window=10_000,
                        requested_output_room=1_000,
                        protocol_tool_overhead_tokens=256,
                        overhead_estimator_id="demo-translation-overhead/v1",
                        overhead_source="deterministic-demo-lock",
                        overhead_confidence="high",
                        overhead_tool_set_identity=action_tool_set_identity(
                            (tool.definition,)
                        ),
                        system_policy_identity="evented-demo-policy/v1",
                    ),
                    estimator=CanonicalJsonTokenEstimator(),
                    artifact_store=FileArtifactStore(root / "large-request-artifacts"),
                ),
                run_id="large-active-request",
            ).run(
                Task(task_id="large-request", prompt=prompt),
                RunLimits(max_steps=1, max_model_calls=2, timeout_seconds=5),
            )

            events = load_run_event_log(root / "large-request.jsonl")
            self.assertEqual(EventedRunStatus.CONTEXT_COMPACTION_ERROR, result.status)
            self.assertEqual((), gateway.prepared_turns)
            self.assertEqual(prompt, events[0].payload["prompt"])
            self.assertEqual(
                "minimal_semantic_projection_does_not_fit",
                events[-2].payload["error_code"],
            )


if __name__ == "__main__":
    unittest.main()
