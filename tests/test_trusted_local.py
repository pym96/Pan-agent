from __future__ import annotations

import tempfile
import time
import unittest
import io
import os
import pty
import sys
import termios
from contextlib import contextmanager
from os import environ
from pathlib import Path
from threading import Event, Thread

from workspace_agent_harness.trusted_local import (
    HumanPtyHandoffController,
    PosixPtyAdapter,
    TrustedLocalExecutor,
)


TRUSTED_LOCAL_FIXTURES = Path(__file__).parent / "fixtures" / "trusted_local"


class TrustedLocalExecutorTest(unittest.TestCase):
    def test_nonzero_exit_is_a_settlement_not_an_executor_crash(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )

            settlement = executor.run_noninteractive(
                command="printf 'expected failure' >&2; exit 7",
                timeout_seconds=5,
                cancel_signal=Event(),
            )

            self.assertEqual("completed", settlement.status)
            self.assertEqual(7, settlement.exit_code)
            self.assertEqual(b"expected failure", settlement.stderr.read_bytes())

    def test_noninteractive_command_returns_typed_stream_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            (workspace / "hello.py").write_text(
                "print('hello from trusted local')\n",
                encoding="utf-8",
            )
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )

            settlement = executor.run_noninteractive(
                command="python3 hello.py",
                timeout_seconds=5,
                cancel_signal=Event(),
            )

            self.assertEqual("completed", settlement.status)
            self.assertEqual(0, settlement.exit_code)
            self.assertEqual(b"hello from trusted local\n", settlement.stdout.read_bytes())
            self.assertEqual(b"", settlement.stderr.read_bytes())
            self.assertEqual(25, settlement.stdout.byte_count)
            self.assertTrue(settlement.stdout.sha256.startswith("sha256:"))
            self.assertFalse(Path(settlement.stdout.locator).is_absolute())

    def test_child_environment_omits_provider_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )
            command = (
                "python3 -c \"import os; "
                "print('present' if 'DEEPSEEK_API_KEY' in os.environ else 'absent')\""
            )

            with _environment_variable("DEEPSEEK_API_KEY", "test-only-sentinel"):
                settlement = executor.run_noninteractive(
                    command=command,
                    timeout_seconds=5,
                    cancel_signal=Event(),
                )

            self.assertEqual(b"absent\n", settlement.stdout.read_bytes())

    def test_cancellation_settles_and_terminates_the_command_group(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )
            cancel_signal = Event()
            canceller = Thread(
                target=lambda: (time.sleep(0.05), cancel_signal.set()),
                daemon=True,
            )
            canceller.start()
            started = time.monotonic()

            settlement = executor.run_noninteractive(
                command="python3 -c 'import time; time.sleep(2)'",
                timeout_seconds=1,
                cancel_signal=cancel_signal,
            )

            self.assertEqual("cancelled", settlement.status)
            self.assertLess(time.monotonic() - started, 0.8)

    def test_cancellation_kills_descendant_before_late_workspace_effect(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )
            cancel_signal = Event()
            Thread(
                target=lambda: (time.sleep(0.05), cancel_signal.set()),
                daemon=True,
            ).start()

            settlement = executor.run_noninteractive(
                command="(sleep 0.4; printf late > late.txt) & wait",
                timeout_seconds=2,
                cancel_signal=cancel_signal,
            )
            time.sleep(0.5)

            self.assertEqual("cancelled", settlement.status)
            self.assertFalse((workspace / "late.txt").exists())

    def test_timeout_is_typed_and_kills_the_command_group(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )

            settlement = executor.run_noninteractive(
                command="python3 -c 'import time; time.sleep(2)'",
                timeout_seconds=1,
                cancel_signal=Event(),
            )

            self.assertEqual("timed_out", settlement.status)
            self.assertIsNotNone(settlement.exit_code)

    def test_workspace_local_venv_uses_its_own_interpreter_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )

            settlement = executor.run_noninteractive(
                command=(
                    "python3 -m venv .venv && "
                    ".venv/bin/python -c \"import pathlib,sys; "
                    "pathlib.Path('venv-prefix.txt').write_text(sys.prefix)\""
                ),
                timeout_seconds=30,
                cancel_signal=Event(),
            )

            self.assertEqual("completed", settlement.status)
            self.assertEqual(0, settlement.exit_code)
            local_prefix = (workspace / "venv-prefix.txt").read_text(encoding="utf-8")
            self.assertEqual((workspace / ".venv").resolve(), Path(local_prefix).resolve())
            self.assertNotEqual(Path(sys.prefix).resolve(), Path(local_prefix).resolve())

    def test_model_observation_is_bounded_while_raw_output_remains_lossless(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            executor = TrustedLocalExecutor(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
            )

            settlement = executor.run_noninteractive(
                command=(
                    "python3 -c \"import sys; "
                    "sys.stdout.write('H' * 6000 + 'M' * 12000 + 'T' * 6000)\""
                ),
                timeout_seconds=5,
                cancel_signal=Event(),
            )
            observation = settlement.model_observation()

            self.assertEqual(24_000, settlement.stdout.byte_count)
            self.assertEqual(24_000, len(settlement.stdout.read_bytes()))
            self.assertLess(len(observation.encode("utf-8")), 10_000)
            self.assertIn("HHHH", observation)
            self.assertIn("TTTT", observation)
            self.assertNotIn("MMMMMMMM", observation)
            self.assertIn(settlement.stdout.sha256, observation)


class HumanPtyHandoffControllerTest(unittest.TestCase):
    def test_trusted_local_fixture_manifest_is_content_bound(self) -> None:
        import hashlib
        import json

        manifest = json.loads(
            (TRUSTED_LOCAL_FIXTURES / "manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            "workspace-agent-harness/trusted-local-fixtures/v1",
            manifest["schema"],
        )
        for entry in manifest["files"]:
            body = (TRUSTED_LOCAL_FIXTURES / entry["path"]).read_bytes()
            self.assertEqual(entry["bytes"], len(body))
            self.assertEqual(entry["sha256"], hashlib.sha256(body).hexdigest())

    def test_terminal_snake_fixture_accepts_q_and_quits_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            workspace = Path(temporary_directory)
            (workspace / "snake.py").write_bytes(
                (TRUSTED_LOCAL_FIXTURES / "snake.py").read_bytes()
            )
            read_fd, write_fd = os.pipe()
            input_stream = os.fdopen(read_fd, "r", encoding="utf-8", buffering=1)
            Thread(
                target=lambda: (
                    time.sleep(0.05),
                    os.write(write_fd, b"q"),
                    os.close(write_fd),
                ),
                daemon=True,
            ).start()
            try:
                result = PosixPtyAdapter().run(
                    command="python3 snake.py",
                    cwd=workspace,
                    environment={"PATH": os.environ["PATH"], "TERM": "xterm-256color"},
                    timeout_seconds=5,
                    cancel_signal=Event(),
                    input_stream=input_stream,
                    output=io.StringIO(),
                )
            finally:
                input_stream.close()

            self.assertEqual("completed", result.status)
            self.assertEqual(0, result.exit_code)
            self.assertIn(b"SNAKE_READY", result.transcript)
            self.assertIn(b"SNAKE_QUIT", result.transcript)

    def test_rejection_retains_decision_without_starting_a_child(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            output = io.StringIO()
            adapter = _FailIfPtyStarts()
            updates = []
            controller = HumanPtyHandoffController(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
                input_stream=io.StringIO("no\n"),
                output=output,
                pty_adapter=adapter,
            )

            settlement = controller.handoff(
                command="python3 snake.py",
                timeout_seconds=30,
                cancel_signal=Event(),
                observe=updates.append,
            )

            self.assertEqual("rejected", settlement.status)
            self.assertFalse(settlement.accepted)
            self.assertIsNone(settlement.exit_code)
            self.assertEqual(0, adapter.calls)
            self.assertEqual(
                ["human_handoff_requested", "human_handoff_rejected"],
                [update.kind for update in updates],
            )
            rendered = output.getvalue()
            self.assertIn("COMMAND python3 snake.py", rendered)
            self.assertIn(f"CWD {workspace.resolve()}", rendered)
            self.assertIn("current host user's authority", rendered)

    def test_acceptance_transfers_to_adapter_and_returns_only_typed_settlement(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            workspace = root / "workspace"
            workspace.mkdir()
            output = io.StringIO()
            adapter = _CompletedPtyAdapter()
            updates = []
            controller = HumanPtyHandoffController(
                workspace_root=workspace,
                artifact_root=root / "artifacts",
                input_stream=io.StringIO("yes\n"),
                output=output,
                pty_adapter=adapter,
            )

            with _environment_variable("DEEPSEEK_API_KEY", "test-only-sentinel"):
                settlement = controller.handoff(
                    command="python3 snake.py",
                    timeout_seconds=30,
                    cancel_signal=Event(),
                    observe=updates.append,
                )

            self.assertEqual("completed", settlement.status)
            self.assertTrue(settlement.accepted)
            self.assertEqual(0, settlement.exit_code)
            self.assertEqual(1, adapter.calls)
            self.assertNotIn("DEEPSEEK_API_KEY", adapter.environment)
            self.assertEqual(
                [
                    "human_handoff_requested",
                    "human_handoff_accepted",
                    "pty_started",
                    "pty_settled",
                ],
                [update.kind for update in updates],
            )
            self.assertIsNotNone(settlement.transcript)
            assert settlement.transcript is not None
            self.assertEqual(b"terminal frame that stays local\n", settlement.transcript.read_bytes())
            observation = settlement.model_observation()
            self.assertIn(settlement.transcript.sha256, observation)
            self.assertNotIn("terminal frame that stays local", observation)
            self.assertIn("Terminal control returned to Live TUI", output.getvalue())

    def test_posix_adapter_forwards_terminal_input_and_settles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            workspace = Path(temporary_directory)
            read_fd, write_fd = os.pipe()
            input_stream = os.fdopen(read_fd, "r", encoding="utf-8", buffering=1)
            output = io.StringIO()
            sender = Thread(
                target=lambda: (
                    time.sleep(0.05),
                    os.write(write_fd, b"q\n"),
                    os.close(write_fd),
                ),
                daemon=True,
            )
            sender.start()
            try:
                result = PosixPtyAdapter().run(
                    command=(
                        "python3 -c \"import sys; print('READY', flush=True); "
                        "value=sys.stdin.readline().strip(); print('GOT:' + value)\""
                    ),
                    cwd=workspace,
                    environment={"PATH": os.environ["PATH"], "TERM": "xterm-256color"},
                    timeout_seconds=5,
                    cancel_signal=Event(),
                    input_stream=input_stream,
                    output=output,
                )
            finally:
                input_stream.close()

            self.assertEqual("completed", result.status)
            self.assertEqual(0, result.exit_code)
            self.assertIn(b"READY", result.transcript)
            self.assertIn(b"GOT:q", result.transcript)
            self.assertIn("GOT:q", output.getvalue())

    def test_posix_adapter_cancellation_kills_descendants(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            workspace = Path(temporary_directory)
            read_fd, write_fd = os.pipe()
            input_stream = os.fdopen(read_fd, "r", encoding="utf-8", buffering=1)
            cancel_signal = Event()
            Thread(
                target=lambda: (time.sleep(0.05), cancel_signal.set()),
                daemon=True,
            ).start()
            try:
                result = PosixPtyAdapter().run(
                    command="(sleep 0.4; printf late > late.txt) & wait",
                    cwd=workspace,
                    environment={"PATH": os.environ["PATH"], "TERM": "xterm-256color"},
                    timeout_seconds=2,
                    cancel_signal=cancel_signal,
                    input_stream=input_stream,
                    output=io.StringIO(),
                )
            finally:
                os.close(write_fd)
                input_stream.close()
            time.sleep(0.5)

            self.assertEqual("cancelled", result.status)
            self.assertFalse((workspace / "late.txt").exists())

    def test_posix_adapter_restores_human_terminal_attributes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            workspace = Path(temporary_directory)
            human_master, human_slave = pty.openpty()
            input_stream = os.fdopen(
                os.dup(human_slave),
                "r",
                encoding="utf-8",
                buffering=1,
            )
            before = termios.tcgetattr(input_stream.fileno())
            Thread(
                target=lambda: (
                    time.sleep(0.05),
                    os.write(human_master, b"q\n"),
                ),
                daemon=True,
            ).start()
            try:
                result = PosixPtyAdapter().run(
                    command="python3 -c \"input(); print('quit')\"",
                    cwd=workspace,
                    environment={"PATH": os.environ["PATH"], "TERM": "xterm-256color"},
                    timeout_seconds=5,
                    cancel_signal=Event(),
                    input_stream=input_stream,
                    output=io.StringIO(),
                )
                after = termios.tcgetattr(input_stream.fileno())
            finally:
                input_stream.close()
                os.close(human_master)
                os.close(human_slave)

            self.assertEqual("completed", result.status)
            # macOS may set transient PENDIN after raw-mode input is restored;
            # compare the durable terminal settings rather than that driver bit.
            after[3] &= ~termios.PENDIN
            self.assertEqual(before, after)


class _FailIfPtyStarts:
    def __init__(self) -> None:
        self.calls = 0

    def run(self, **kwargs):
        self.calls += 1
        raise AssertionError("PTY child must not start after Human rejection")


class _CompletedPtyAdapter:
    def __init__(self) -> None:
        self.calls = 0
        self.environment = {}

    def run(self, **kwargs):
        from workspace_agent_harness.trusted_local import PtyProcessResult

        self.calls += 1
        self.environment = dict(kwargs["environment"])
        return PtyProcessResult(
            status="completed",
            exit_code=0,
            duration_ms=12,
            transcript=b"terminal frame that stays local\n",
        )


@contextmanager
def _environment_variable(name: str, value: str):
    previous = environ.get(name)
    environ[name] = value
    try:
        yield
    finally:
        if previous is None:
            environ.pop(name, None)
        else:
            environ[name] = previous


if __name__ == "__main__":
    unittest.main()
