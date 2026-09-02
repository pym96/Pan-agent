from __future__ import annotations

import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from threading import Event

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.deepseek_live import (
    DeepSeekLiveTranslationAdapter,
    DeepSeekModelGateway,
    FileDeepSeekExchangeStore,
    RetainedDeepSeekResponse,
    locked_deepseek_v3_model_profile,
)
from workspace_agent_harness.evented import (
    AgentLoop,
    CandidateFinal,
    CandidateToolBatch,
    CandidateToolCall,
    ExchangeFailed,
    ExchangeSettled,
    JsonlRunEventLog,
    PreparedModelTurn,
    ProviderFailure,
    ProviderFailureKind,
    MAX_TOOL_CALLS_PER_BATCH,
    load_run_event_log,
)
from workspace_agent_harness.live_tui import (
    LIVE_TUI_SYSTEM_PROMPT,
    LiveProgressProjection,
    LiveTuiSession,
    ReadWorkspaceFileTool,
    VerifyWorkspaceTool,
    WorkspaceBoundary,
    WriteWorkspaceFileTool,
    live_workspace_bindings,
    live_workspace_tools,
    run_live_tui,
)
from workspace_agent_harness.trusted_local import PtyProcessResult
from workspace_agent_harness.trusted_local import (
    HumanPtyHandoffController,
    TrustedLocalExecutor,
)


LIVE_TUI_FIXTURES = Path(__file__).parent / "fixtures" / "live_tui"


class LiveTuiSessionTest(unittest.TestCase):
    def test_invalid_late_shell_call_rejects_the_batch_before_write_effect(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            gateway = _QueueGateway(
                (
                    CandidateToolBatch(
                        calls=(
                            CandidateToolCall(
                                "early-write",
                                "write_file",
                                {
                                    "input": _json(
                                        {"path": "marker.txt", "content": "must not land"}
                                    )
                                },
                            ),
                            CandidateToolCall(
                                "late-invalid-shell",
                                "trusted_local_shell",
                                {"input": _json({"command": "x" * 32_769})},
                            ),
                        )
                    ),
                )
            )
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\nreject invalid batch\n:exit\n"),
                output=io.StringIO(),
                gateway_factory=lambda run_root, tools: gateway,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "invalid-shell-batch",
                trusted_local=True,
            )

            self.assertEqual(0, session.run())
            self.assertFalse((workspace / "marker.txt").exists())
            self.assertEqual("protocol_error", session.records[0].status.value)
            events = load_run_event_log(session.records[0].event_log_path)
            self.assertNotIn("tool.execution_started", [event.event_type for event in events])

    def test_accepted_pty_handoff_records_lifecycle_and_replay_is_inert(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            adapter = _CompletedPtyAdapter()
            gateway = _QueueGateway(
                (
                    CandidateToolCall(
                        "play-snake",
                        "human_interactive_pty",
                        {
                            "input": _json(
                                {"command": "python3 snake.py", "timeout_seconds": 30}
                            )
                        },
                    ),
                    CandidateFinal("The Human quit the terminal program cleanly."),
                )
            )
            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO(
                    "yes\nrun the terminal game\nyes\n:replay pty-run\n:exit\n"
                ),
                output=output,
                gateway_factory=lambda run_root, tools: gateway,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "pty-run",
                trusted_local=True,
                pty_adapter=adapter,
            )

            self.assertEqual(0, session.run())
            self.assertEqual(1, adapter.calls)
            self.assertEqual(2, len(gateway.prepared_turns))
            observation = gateway.prepared_turns[1].conversation.messages[-1].content
            self.assertIn('"status":"completed"', observation)
            self.assertNotIn("Human key bytes", observation)
            events = load_run_event_log(session.records[0].event_log_path)
            lifecycle = [
                event.event_type
                for event in events
                if event.event_type.startswith("tool.human_")
                or event.event_type.startswith("tool.pty_")
            ]
            self.assertEqual(
                [
                    "tool.human_handoff_requested",
                    "tool.human_handoff_accepted",
                    "tool.pty_started",
                    "tool.pty_settled",
                ],
                lifecycle,
            )
            self.assertGreaterEqual(output.getvalue().count("VIEW compact"), 2)
            self.assertEqual(
                2,
                output.getvalue().count(
                    "HANDOFF tool.human_handoff_accepted decision=accepted"
                ),
            )
            self.assertEqual(
                2,
                output.getvalue().count(
                    "PTY tool.pty_settled status=completed exit_code=0"
                ),
            )

    def test_pty_rejection_is_an_observation_with_no_child_process(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            marker = workspace / "must-not-exist"
            gateway = _QueueGateway(
                (
                    CandidateToolCall(
                        "propose-pty",
                        "human_interactive_pty",
                        {
                            "input": _json(
                                {
                                    "command": f"touch {marker.name}",
                                    "timeout_seconds": 5,
                                }
                            )
                        },
                    ),
                    CandidateFinal("Human rejected the PTY handoff."),
                )
            )
            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO(
                    "yes\npropose an interactive command\nno\n:exit\n"
                ),
                output=output,
                gateway_factory=lambda run_root, tools: gateway,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "pty-rejected-run",
                trusted_local=True,
            )

            self.assertEqual(0, session.run())
            self.assertFalse(marker.exists())
            self.assertIn('"status":"rejected"', gateway.prepared_turns[1].conversation.messages[-1].content)
            events = load_run_event_log(session.records[0].event_log_path)
            self.assertEqual(
                ["tool.human_handoff_requested", "tool.human_handoff_rejected"],
                [
                    event.event_type
                    for event in events
                    if event.event_type.startswith("tool.human_handoff_")
                ],
            )
            self.assertNotIn("tool.pty_started", [event.event_type for event in events])

    def test_opt_in_fake_model_writes_executes_observes_and_completes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            gateway = _QueueGateway(
                (
                    CandidateToolCall(
                        "write-program",
                        "write_file",
                        {
                            "input": _json(
                                {
                                    "path": "hello.py",
                                    "content": "print('shell-observed')\n",
                                }
                            )
                        },
                    ),
                    CandidateToolCall(
                        "run-program",
                        "trusted_local_shell",
                        {
                            "input": _json(
                                {"command": "python3 hello.py", "timeout_seconds": 5}
                            )
                        },
                    ),
                    CandidateFinal("created and executed hello.py"),
                )
            )
            exposed_tool_names: list[str] = []

            def gateway_factory(run_root, tools):
                exposed_tool_names.extend(tool.definition.name for tool in tools)
                return gateway

            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\ncreate and run hello.py\n:exit\n"),
                output=output,
                gateway_factory=gateway_factory,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "trusted-local-run",
                trusted_local=True,
            )

            self.assertEqual(0, session.run())
            self.assertIn("trusted_local_shell", exposed_tool_names)
            self.assertIn("human_interactive_pty", exposed_tool_names)
            self.assertIn("shell-observed", gateway.prepared_turns[2].conversation.messages[-1].content)
            self.assertEqual("completed", session.records[0].status.value)
            self.assertIn("current host user's authority", output.getvalue())
            self.assertIn("cwd is not containment", output.getvalue())
            events = load_run_event_log(session.records[0].event_log_path)
            shell_lifecycle = [
                event for event in events if event.event_type.startswith("tool.shell_")
            ]
            self.assertEqual(
                ["tool.shell_started", "tool.shell_settled"],
                [event.event_type for event in shell_lifecycle],
            )
            self.assertEqual("completed", shell_lifecycle[-1].payload["status"])
            self.assertIn("locator", shell_lifecycle[-1].payload["stdout"])
            self.assertIn(
                "SHELL tool.shell_settled status=completed exit_code=0",
                output.getvalue(),
            )
            self.assertTrue(
                tuple((session.records[0].run_root / "tool-artifacts").rglob("stdout.raw"))
            )

    def test_multi_tool_fixtures_are_hash_bound_and_secret_free(self) -> None:
        manifest = json.loads(
            (LIVE_TUI_FIXTURES / "manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            "workspace-agent-harness/live-tui-multi-tool-fixtures/v1",
            manifest["schema"],
        )
        for entry in manifest["files"]:
            body = (LIVE_TUI_FIXTURES / entry["path"]).read_bytes()
            self.assertEqual(entry["sha256"], hashlib.sha256(body).hexdigest())
            lowered = body.lower()
            self.assertNotIn(b"api_key", lowered)
            self.assertNotIn(b"authorization", lowered)

    def test_multiple_tasks_share_workspace_but_start_fresh_model_contexts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            session_root = root / "artifacts" / "session"
            gateways: list[_QueueGateway] = []
            action_sets = iter(
                (
                    (
                        CandidateToolCall(
                            "write-shared",
                            "write_file",
                            {
                                "input": _json(
                                    {"path": "shared.txt", "content": "shared-state"}
                                )
                            },
                        ),
                        CandidateFinal("first complete"),
                    ),
                    (
                        CandidateToolCall(
                            "read-shared",
                            "read_file",
                            {"input": _json({"path": "shared.txt"})},
                        ),
                        CandidateFinal("second complete"),
                    ),
                )
            )

            def gateway_factory(run_root, tools):
                gateway = _QueueGateway(next(action_sets))
                gateways.append(gateway)
                return gateway

            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=session_root,
                input_stream=io.StringIO(
                    "yes\nfirst task\nsecond task\n:runs\n:replay run-1\n:exit\n"
                ),
                output=output,
                gateway_factory=gateway_factory,
                credential_loader=_must_not_be_called,
                run_id_factory=iter(("run-1", "run-2")).__next__,
            )

            self.assertEqual(0, session.run())
            self.assertEqual("shared-state", (workspace / "shared.txt").read_text())
            self.assertEqual(2, len(session.records))
            self.assertEqual(2, len(gateways))
            self.assertEqual(
                ["first task", "second task"],
                [
                    gateway.prepared_turns[0].conversation.messages[0].content
                    for gateway in gateways
                ],
            )
            self.assertEqual(
                [1, 1],
                [len(gateway.prepared_turns[0].conversation.messages) for gateway in gateways],
            )
            self.assertIn("shared-state", gateways[1].prepared_turns[1].conversation.messages[-1].content)
            for record in session.records:
                events = load_run_event_log(record.event_log_path)
                self.assertEqual(1, sum(event.event_type == "run.terminal" for event in events))
            self.assertEqual(("shared.txt",), session.records[0].changed_workspace_paths)
            self.assertEqual((), session.records[1].changed_workspace_paths)
            rendered = output.getvalue()
            self.assertGreaterEqual(rendered.count("Task> "), 5)
            self.assertIn("RUNS run-1 status=completed", rendered)
            self.assertIn("VIEW compact", rendered)

    def test_live_tui_composes_the_accepted_deepseek_translation_and_gateway(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            transport = _RetainedTransport(
                (
                    _provider_tool_response(
                        call_id="provider-write-1",
                        name="write_file",
                        arguments={"path": "result.txt", "content": "total=5"},
                        content="I will write the requested result.",
                        input_tokens=41,
                        output_tokens=13,
                    ),
                    _provider_final_response(
                        content="Wrote the requested exact result.",
                        input_tokens=67,
                        output_tokens=11,
                    ),
                )
            )

            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\nwrite the exact result\n:exit\n"),
                output=output,
                credential_loader=lambda: "test-only-key",
                run_id_factory=lambda: "deepseek-seam-run",
            )

            with patch(
                "workspace_agent_harness.live_tui.DeepSeekHttpTransport",
                return_value=transport,
            ):
                self.assertEqual(0, session.run())
            self.assertEqual("total=5", (workspace / "result.txt").read_text())
            self.assertEqual(2, transport.calls)
            first_payload = transport.requests[0].payload
            self.assertEqual("deepseek-v4-flash", first_payload["model"])
            self.assertEqual({"type": "enabled"}, first_payload["thinking"])
            self.assertNotIn("tool_choice", first_payload)
            self.assertEqual(
                locked_deepseek_v3_model_profile().max_output_tokens,
                first_payload["max_tokens"],
            )
            tool_names = [tool["function"]["name"] for tool in first_payload["tools"]]
            self.assertEqual(
                [
                    "inspect_workspace",
                    "read_file",
                    "write_file",
                    "verify_workspace",
                    "complete",
                    "abstain",
                ],
                tool_names,
            )
            second_messages = transport.requests[1].payload["messages"]
            self.assertEqual(
                ["system", "user", "assistant", "tool"],
                [message["role"] for message in second_messages],
            )
            self.assertEqual(
                "",
                second_messages[2]["reasoning_content"],
            )
            self.assertEqual("", second_messages[2]["content"])
            record = session.records[0]
            self.assertEqual(108, record.usage["input_tokens"])
            self.assertEqual(24, record.usage["output_tokens"])
            self.assertEqual(132, record.usage["total_tokens"])
            self.assertEqual(2, record.usage["known_calls"])
            self.assertEqual(
                2,
                len(tuple((record.run_root / "provider-exchanges").iterdir())),
            )
            self.assertNotIn(
                "The retained tool result proves completion.",
                output.getvalue(),
            )

    def test_live_tui_executes_provider_tool_batch_in_order_with_paired_history(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            (workspace / "notes").mkdir(parents=True)
            (workspace / "notes" / "a.txt").write_text("alpha=2\n", encoding="utf-8")
            (workspace / "notes" / "b.txt").write_text("beta=3\n", encoding="utf-8")
            transport = _RetainedTransport(
                (
                    _live_tui_fixture("valid-three-domain-tools.response.json"),
                    _provider_final_response(
                        content="The exact result is present.",
                        input_tokens=1_100,
                        output_tokens=21,
                    ),
                )
            )

            def gateway_factory(run_root, tools):
                return DeepSeekModelGateway(
                    adapter=DeepSeekLiveTranslationAdapter(
                        profile=locked_deepseek_v3_model_profile(),
                        tool_bindings=live_workspace_bindings(tools),
                        system_prompt=LIVE_TUI_SYSTEM_PROMPT,
                        max_tool_calls_per_response=MAX_TOOL_CALLS_PER_BATCH,
                    ),
                    transport=transport,
                    exchange_store=FileDeepSeekExchangeStore(
                        run_root / "provider-exchanges"
                    ),
                )

            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\ncalculate the exact total\n:exit\n"),
                output=output,
                gateway_factory=gateway_factory,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "multi-tool-live-run",
            )

            self.assertEqual(0, session.run())
            self.assertEqual("total=5", (workspace / "result.txt").read_text())
            self.assertEqual(2, transport.calls)
            follow_up = transport.requests[1].payload["messages"]
            self.assertEqual(
                ["system", "user", "assistant", "tool", "tool", "tool"],
                [message["role"] for message in follow_up],
            )
            self.assertEqual(
                ["batch-read-a", "batch-read-b", "batch-write-result"],
                [call["id"] for call in follow_up[2]["tool_calls"]],
            )
            self.assertEqual(
                ["batch-read-a", "batch-read-b", "batch-write-result"],
                [message["tool_call_id"] for message in follow_up[3:]],
            )
            record = session.records[0]
            self.assertEqual(2, record.model_calls)
            self.assertEqual(3, record.tool_calls)
            self.assertIn(
                "ACTION candidate.accepted kind=tool_call_batch calls=3",
                output.getvalue(),
            )
            events = load_run_event_log(record.event_log_path)
            self.assertEqual(
                ["read_file", "read_file", "write_file"],
                [
                    event.payload["tool_name"]
                    for event in events
                    if event.event_type == "tool.execution_started"
                ],
            )

    def test_invalid_late_batch_call_rejects_every_call_before_effects(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            (root / "outside.txt").write_text("outside", encoding="utf-8")
            transport = _RetainedTransport(
                (_live_tui_fixture("invalid-last-path.response.json"),)
            )

            def gateway_factory(run_root, tools):
                return DeepSeekModelGateway(
                    adapter=DeepSeekLiveTranslationAdapter(
                        profile=locked_deepseek_v3_model_profile(),
                        tool_bindings=live_workspace_bindings(tools),
                        system_prompt=LIVE_TUI_SYSTEM_PROMPT,
                        max_tool_calls_per_response=MAX_TOOL_CALLS_PER_BATCH,
                    ),
                    transport=transport,
                    exchange_store=FileDeepSeekExchangeStore(
                        run_root / "provider-exchanges"
                    ),
                )

            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\nreject the unsafe batch\n:exit\n"),
                output=io.StringIO(),
                gateway_factory=gateway_factory,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "invalid-late-batch-run",
            )

            self.assertEqual(0, session.run())
            self.assertEqual("protocol_error", session.records[0].status.value)
            self.assertEqual(1, transport.calls)
            self.assertFalse((workspace / "marker.txt").exists())
            events = load_run_event_log(session.records[0].event_log_path)
            self.assertNotIn(
                "tool.execution_started",
                [event.event_type for event in events],
            )
            rejected = next(
                event for event in events if event.event_type == "candidate.rejected"
            )
            self.assertIn("tool preflight rejected", rejected.payload["error"])

    def test_mixed_terminal_domain_batch_fails_in_translation_before_effects(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            (workspace / "notes").mkdir(parents=True)
            (workspace / "notes" / "a.txt").write_text("alpha", encoding="utf-8")
            transport = _RetainedTransport(
                (_live_tui_fixture("invalid-mixed-terminal-domain.response.json"),)
            )

            def gateway_factory(run_root, tools):
                return DeepSeekModelGateway(
                    adapter=DeepSeekLiveTranslationAdapter(
                        profile=locked_deepseek_v3_model_profile(),
                        tool_bindings=live_workspace_bindings(tools),
                        system_prompt=LIVE_TUI_SYSTEM_PROMPT,
                        max_tool_calls_per_response=MAX_TOOL_CALLS_PER_BATCH,
                    ),
                    transport=transport,
                    exchange_store=FileDeepSeekExchangeStore(
                        run_root / "provider-exchanges"
                    ),
                )

            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\nreject the ambiguous batch\n:exit\n"),
                output=io.StringIO(),
                gateway_factory=gateway_factory,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "mixed-terminal-batch-run",
            )

            self.assertEqual(0, session.run())
            self.assertEqual("model_error", session.records[0].status.value)
            events = load_run_event_log(session.records[0].event_log_path)
            failed = next(
                event for event in events if event.event_type == "model.exchange_failed"
            )
            self.assertEqual("terminal_action_mixed", failed.payload["failure_code"])
            self.assertNotIn(
                "tool.execution_started",
                [event.event_type for event in events],
            )

    def test_semantic_context_overflow_recovery_remains_active_in_live_session(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            gateway = _OverflowThenFinalGateway()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\nrecover this task\n:exit\n"),
                output=io.StringIO(),
                gateway_factory=lambda run_root, tools: gateway,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "overflow-run",
            )

            self.assertEqual(0, session.run())
            self.assertEqual("completed", session.records[0].status.value)
            self.assertEqual(2, session.records[0].model_calls)
            event_types = [
                event.event_type
                for event in load_run_event_log(session.records[0].event_log_path)
            ]
            self.assertIn("context.overflow_retry_succeeded", event_types)
            self.assertEqual(1, event_types.count("run.terminal"))

    def test_help_view_runs_replay_and_cancel_before_submit_make_zero_calls(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            calls = {"gateway": 0, "credential": 0}

            def gateway_factory(run_root, tools):
                calls["gateway"] += 1
                raise AssertionError("gateway factory reached without a task")

            def credential_loader():
                calls["credential"] += 1
                raise AssertionError("credential reached without a task")

            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO(
                    "yes\n:help\n:view trace\n:runs\n:replay missing\n:exit\n"
                ),
                output=output,
                gateway_factory=gateway_factory,
                credential_loader=credential_loader,
            )

            self.assertEqual(0, session.run())
            self.assertEqual({"gateway": 0, "credential": 0}, calls)
            self.assertEqual((), session.records)
            self.assertIn("Unknown Run ID", output.getvalue())

            cancelled_root = root / "cancelled-session"
            cancelled = LiveTuiSession(
                workspace_root=workspace,
                session_root=cancelled_root,
                input_stream=io.StringIO("no\n"),
                output=io.StringIO(),
                gateway_factory=gateway_factory,
                credential_loader=credential_loader,
            )
            self.assertEqual(0, cancelled.run())
            self.assertFalse(cancelled_root.exists())
            self.assertEqual({"gateway": 0, "credential": 0}, calls)

    def test_ctrl_c_at_prompt_closes_without_creating_a_run(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=_InterruptingInput(),
                output=output,
                gateway_factory=lambda run_root, tools: _must_not_be_called(),
                credential_loader=_must_not_be_called,
            )

            self.assertEqual(130, session.run())
            self.assertEqual((), session.records)
            self.assertFalse((root / "session").exists())
            self.assertIn("closed by interrupt", output.getvalue())

    def test_real_cli_entry_displays_boundary_and_exits_without_provider_call(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            session_root = root / "session"
            environment = os.environ.copy()
            environment["DEEPSEEK_API_KEY"] = "must-not-be-read-or-used"
            process = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "workspace_agent_harness.tui",
                    "--live-deepseek",
                    "--workspace",
                    str(workspace),
                    "--session-root",
                    str(session_root),
                ],
                cwd=Path(__file__).parents[1],
                input="no\n",
                text=True,
                capture_output=True,
                env=environment,
                timeout=10,
                check=False,
            )

            self.assertEqual(0, process.returncode, process.stderr)
            self.assertIn("PROVIDER DeepSeek", process.stdout)
            self.assertIn("MODEL deepseek-v4-flash", process.stdout)
            self.assertIn(f"WORKSPACE {workspace.resolve()}", process.stdout)
            self.assertIn("no Run or Provider call was created", process.stdout)
            self.assertNotIn("must-not-be-read-or-used", process.stdout)
            self.assertFalse(session_root.exists())

    def test_real_cli_requires_explicit_trusted_local_opt_in(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            session_root = root / "session"
            environment = os.environ.copy()
            environment["DEEPSEEK_API_KEY"] = "must-not-be-read-or-used"

            enabled = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "workspace_agent_harness.tui",
                    "--live-deepseek",
                    "--trusted-local",
                    "--workspace",
                    str(workspace),
                    "--session-root",
                    str(session_root),
                ],
                cwd=Path(__file__).parents[1],
                input="no\n",
                text=True,
                capture_output=True,
                env=environment,
                timeout=10,
                check=False,
            )

            self.assertEqual(0, enabled.returncode, enabled.stderr)
            self.assertIn("trusted-local enabled", enabled.stdout)
            self.assertIn("current host user's authority", enabled.stdout)
            self.assertNotIn("must-not-be-read-or-used", enabled.stdout)
            self.assertFalse(session_root.exists())

            invalid = subprocess.run(
                [sys.executable, "-m", "workspace_agent_harness.tui", "--trusted-local"],
                cwd=Path(__file__).parents[1],
                text=True,
                capture_output=True,
                timeout=10,
                check=False,
            )
            self.assertEqual(2, invalid.returncode)
            self.assertIn("--trusted-local requires --live-deepseek", invalid.stderr)

    def test_missing_credential_and_invalid_workspace_fail_before_external_call(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            output = io.StringIO()
            credential_reads = 0

            def empty_credential() -> str:
                nonlocal credential_reads
                credential_reads += 1
                return ""

            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\ntry once\n:exit\n"),
                output=output,
                credential_loader=empty_credential,
            )
            self.assertEqual(0, session.run())
            self.assertEqual(1, credential_reads)
            self.assertEqual((), session.records)
            self.assertIn("no Provider call was made", output.getvalue())

            invalid_output = io.StringIO()
            self.assertEqual(
                2,
                run_live_tui(
                    workspace_root=root / "missing",
                    session_root=root / "unused",
                    input_stream=io.StringIO("yes\n"),
                    output=invalid_output,
                ),
            )
            self.assertIn("validation failed", invalid_output.getvalue())

    def test_cancelled_and_provider_failed_runs_return_to_task_prompt(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            factories = iter((_InterruptGateway(), _ProviderFailureGateway()))
            output = io.StringIO()
            session = LiveTuiSession(
                workspace_root=workspace,
                session_root=root / "session",
                input_stream=io.StringIO("yes\ncancel task\nfailed task\n:exit\n"),
                output=output,
                gateway_factory=lambda run_root, tools: next(factories),
                credential_loader=_must_not_be_called,
                run_id_factory=iter(("cancelled-run", "failed-run")).__next__,
            )

            self.assertEqual(0, session.run())
            self.assertEqual(
                ["cancelled", "model_error"],
                [record.status.value for record in session.records],
            )
            self.assertGreaterEqual(output.getvalue().count("Task> "), 3)
            for record in session.records:
                events = load_run_event_log(record.event_log_path)
                self.assertEqual("run.terminal", events[-1].event_type)
                self.assertEqual(1, sum(event.event_type == "run.terminal" for event in events))


class WorkspaceToolBoundaryTest(unittest.TestCase):
    def test_opt_in_binding_profile_exposes_closed_shell_and_pty_schemas(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            boundary = WorkspaceBoundary(workspace)
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts" / "shell",
            )
            controller = HumanPtyHandoffController(
                workspace_root=workspace,
                artifact_root=root / "artifacts" / "pty",
                input_stream=io.StringIO("no\n"),
                output=io.StringIO(),
                pty_adapter=_CompletedPtyAdapter(),
            )
            tools = live_workspace_tools(
                boundary,
                trusted_local_executor=executor,
                pty_controller=controller,
            )
            bindings = live_workspace_bindings(tools)

            self.assertEqual(
                [
                    "inspect_workspace",
                    "read_file",
                    "write_file",
                    "verify_workspace",
                    "trusted_local_shell",
                    "human_interactive_pty",
                ],
                [binding.runtime_tool.name for binding in bindings],
            )
            for binding in bindings[-2:]:
                self.assertEqual(["command"], binding.provider_parameters["required"])
                timeout_schema = binding.provider_parameters["properties"]["timeout_seconds"]
                self.assertEqual("integer", timeout_schema["type"])
                self.assertEqual(120, timeout_schema["maximum"])

    def test_traversal_absolute_path_and_symlink_escape_fail_before_side_effect(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            outside = root / "outside.txt"
            outside.write_text("outside-original", encoding="utf-8")
            (workspace / "escape").symlink_to(outside)
            boundary = WorkspaceBoundary(workspace)
            reader = ReadWorkspaceFileTool(boundary)
            writer = WriteWorkspaceFileTool(boundary)

            for path in ("../outside.txt", str(outside), "escape"):
                with self.subTest(read_path=path), self.assertRaises(ValueError):
                    reader.execute(
                        {"input": _json({"path": path})},
                        Event(),
                    )
                with self.subTest(write_path=path), self.assertRaises(ValueError):
                    writer.execute(
                        {"input": _json({"path": path, "content": "changed"})},
                        Event(),
                    )
            self.assertEqual("outside-original", outside.read_text(encoding="utf-8"))
            self.assertEqual((), writer.changed_paths)

    def test_malformed_inputs_and_unknown_tool_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            boundary = WorkspaceBoundary(workspace)
            writer = WriteWorkspaceFileTool(boundary)
            malformed = (
                {},
                {"input": "{"},
                {"input": _json({"path": "a.txt"})},
                {
                    "input": _json(
                        {"path": "a.txt", "content": "x", "extra": "no"}
                    )
                },
            )
            for arguments in malformed:
                with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                    writer.execute(arguments, Event())
            self.assertFalse((workspace / "a.txt").exists())

            log_path = root / "unknown-tool.jsonl"
            result = AgentLoop(
                gateway=_QueueGateway(
                    (
                        CandidateToolCall(
                            "unknown-call",
                            "host_shell",
                            {"input": _json({"command": "touch escaped"})},
                        ),
                    )
                ),
                tools=live_workspace_tools(boundary),
                event_log=JsonlRunEventLog(log_path),
                run_id="unknown-tool-run",
            ).run(
                Task(task_id="unknown-tool", prompt="try an unknown tool"),
                RunLimits(max_steps=1, max_model_calls=1, timeout_seconds=5),
            )
            self.assertEqual("protocol_error", result.status.value)
            self.assertFalse((workspace / "escaped").exists())
            self.assertNotIn(
                "tool.execution_started",
                [event.event_type for event in load_run_event_log(log_path)],
            )

    def test_write_is_atomic_and_verification_never_executes_workspace_code(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            marker = root / "must-not-exist"
            (workspace / "safe.py").write_text(
                f"from pathlib import Path\nPath({str(marker)!r}).write_text('bad')\n",
                encoding="utf-8",
            )
            boundary = WorkspaceBoundary(workspace)
            writer = WriteWorkspaceFileTool(boundary)
            observation = writer.execute(
                {
                    "input": _json(
                        {"path": "result.txt", "content": "total=5"}
                    )
                },
                Event(),
            )
            self.assertEqual("total=5", (workspace / "result.txt").read_text())
            self.assertIn('"changed":true', observation.content)
            verifier = VerifyWorkspaceTool(boundary)
            result = verifier.execute(
                {"input": _json({"check": "python-syntax"})},
                Event(),
            )
            self.assertIn('"status":"passed"', result.content)
            self.assertFalse(marker.exists())

    def test_live_binding_profile_exposes_no_shell_or_open_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            boundary = WorkspaceBoundary(Path(temporary_directory))
            tools = live_workspace_tools(boundary)
            bindings = live_workspace_bindings(tools)
            self.assertEqual(
                ["inspect_workspace", "read_file", "write_file", "verify_workspace"],
                [binding.runtime_tool.name for binding in bindings],
            )
            self.assertFalse(any("shell" in binding.runtime_tool.name for binding in bindings))
            for binding in bindings:
                self.assertIs(False, binding.provider_parameters["additionalProperties"])


class LiveProjectionInertnessTest(unittest.TestCase):
    def test_removing_progress_projection_does_not_change_retained_run(self) -> None:
        retained = []
        for render in (False, True):
            with tempfile.TemporaryDirectory() as temporary_directory:
                log_path = Path(temporary_directory) / "events.jsonl"
                gateway = _QueueGateway(
                    (
                        CandidateFinal(
                            "safe output",
                            reasoning="hidden-reasoning-must-not-render",
                        ),
                    )
                )
                event_log = JsonlRunEventLog(
                    log_path,
                    monotonic_ns=_IncrementingClock(),
                )
                result = AgentLoop(
                    gateway=gateway,
                    tools=(),
                    event_log=event_log,
                    run_id="projection-inert-run",
                ).run(
                    Task(task_id="projection-inert", prompt="same task"),
                    RunLimits(max_steps=1, max_model_calls=1, timeout_seconds=5),
                )
                rendered = io.StringIO()
                if render:
                    projection = LiveProgressProjection(rendered)
                    for event in event_log.snapshot():
                        projection.observe(event)
                retained.append(
                    (
                        result,
                        tuple(turn.identity for turn in gateway.prepared_turns),
                        log_path.read_bytes(),
                    )
                )
                self.assertNotIn("hidden-reasoning-must-not-render", rendered.getvalue())
        self.assertEqual(retained[0], retained[1])


class _QueueGateway:
    def __init__(self, actions) -> None:
        self._actions = tuple(actions)
        self.prepared_turns: list[PreparedModelTurn] = []

    def exchange(self, prepared_turn, cancel_signal):
        self.prepared_turns.append(prepared_turn)
        action = self._actions[len(self.prepared_turns) - 1]
        return ExchangeSettled(
            exchange_id=f"exchange-{len(self.prepared_turns)}",
            candidate=action,
        )


class _InterruptGateway:
    def exchange(self, prepared_turn, cancel_signal):
        raise KeyboardInterrupt


class _ProviderFailureGateway:
    def exchange(self, prepared_turn, cancel_signal):
        return ExchangeFailed(
            exchange_id="provider-failed",
            failure=ProviderFailure(
                kind=ProviderFailureKind.PROTOCOL,
                code="deterministic_failure",
                message="deterministic provider failure",
            ),
        )


class _OverflowThenFinalGateway:
    def __init__(self) -> None:
        self.calls = 0

    def exchange(self, prepared_turn, cancel_signal):
        self.calls += 1
        if self.calls == 1:
            return ExchangeFailed(
                exchange_id="overflow-original",
                failure=ProviderFailure(
                    kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                    code="context_overflow",
                    message="deterministic context overflow",
                ),
            )
        return ExchangeSettled(
            exchange_id="overflow-retry",
            candidate=CandidateFinal("recovered"),
        )


class _RetainedTransport:
    def __init__(self, responses) -> None:
        self._responses = tuple(responses)
        self.requests = []
        self.calls = 0

    def send(self, request, cancel_signal):
        self.requests.append(request)
        response = self._responses[self.calls]
        self.calls += 1
        return response


class _InterruptingInput:
    def readline(self):
        raise KeyboardInterrupt


class _IncrementingClock:
    def __init__(self) -> None:
        self._value = 0

    def __call__(self) -> int:
        self._value += 1
        return self._value


class _CompletedPtyAdapter:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, **kwargs):
        self.calls += 1
        return PtyProcessResult(
            status="completed",
            exit_code=0,
            duration_ms=17,
            transcript=b"Human key bytes stay in the local PTY transcript\n",
        )


def _json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _provider_tool_response(
    *,
    call_id: str,
    name: str,
    arguments: object,
    content: str = "",
    input_tokens: int,
    output_tokens: int,
) -> RetainedDeepSeekResponse:
    return _provider_response(
        finish_reason="tool_calls",
        message={
            "role": "assistant",
            "content": content,
            "reasoning_content": "",
            "tool_calls": [
                {
                    "id": call_id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": _json(arguments),
                    },
                }
            ],
        },
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


def _live_tui_fixture(name: str) -> RetainedDeepSeekResponse:
    return RetainedDeepSeekResponse(
        status_code=200,
        body=(LIVE_TUI_FIXTURES / name).read_bytes(),
        duration_ms=1,
    )


def _provider_final_response(
    *,
    content: str,
    input_tokens: int,
    output_tokens: int,
) -> RetainedDeepSeekResponse:
    return _provider_response(
        finish_reason="stop",
        message={
            "role": "assistant",
            "content": content,
            "reasoning_content": "The retained tool result proves completion.",
        },
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )


def _provider_response(
    *,
    finish_reason: str,
    message: object,
    input_tokens: int,
    output_tokens: int,
) -> RetainedDeepSeekResponse:
    return RetainedDeepSeekResponse(
        status_code=200,
        body=_json(
            {
                "id": f"response-{input_tokens}",
                "model": "deepseek-v4-flash",
                "system_fingerprint": "live-tui-fixture-fingerprint",
                "choices": [
                    {"finish_reason": finish_reason, "message": message}
                ],
                "usage": {
                    "prompt_tokens": input_tokens,
                    "completion_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                },
            }
        ).encode("utf-8"),
        duration_ms=1,
    )


def _must_not_be_called():
    raise AssertionError("credential loader must not be called")


if __name__ == "__main__":
    unittest.main()
