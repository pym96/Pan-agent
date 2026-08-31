from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
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
    CandidateToolCall,
    ExchangeFailed,
    ExchangeSettled,
    JsonlRunEventLog,
    PreparedModelTurn,
    ProviderFailure,
    ProviderFailureKind,
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


class LiveTuiSessionTest(unittest.TestCase):
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

            def gateway_factory(run_root, tools):
                return DeepSeekModelGateway(
                    adapter=DeepSeekLiveTranslationAdapter(
                        profile=locked_deepseek_v3_model_profile(),
                        tool_bindings=live_workspace_bindings(tools),
                        system_prompt=LIVE_TUI_SYSTEM_PROMPT,
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
                input_stream=io.StringIO("yes\nwrite the exact result\n:exit\n"),
                output=output,
                gateway_factory=gateway_factory,
                credential_loader=_must_not_be_called,
                run_id_factory=lambda: "deepseek-seam-run",
            )

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
                "Use the bounded write tool.",
                second_messages[2]["reasoning_content"],
            )
            record = session.records[0]
            self.assertEqual(108, record.usage["input_tokens"])
            self.assertEqual(24, record.usage["output_tokens"])
            self.assertEqual(132, record.usage["total_tokens"])
            self.assertEqual(2, record.usage["known_calls"])
            self.assertEqual(
                2,
                len(tuple((record.run_root / "provider-exchanges").iterdir())),
            )
            self.assertNotIn("Use the bounded write tool.", output.getvalue())
            self.assertNotIn(
                "The retained tool result proves completion.",
                output.getvalue(),
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


def _json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _provider_tool_response(
    *,
    call_id: str,
    name: str,
    arguments: object,
    input_tokens: int,
    output_tokens: int,
) -> RetainedDeepSeekResponse:
    return _provider_response(
        finish_reason="tool_calls",
        message={
            "role": "assistant",
            "content": "",
            "reasoning_content": "Use the bounded write tool.",
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
