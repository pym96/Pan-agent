from __future__ import annotations

import os
import pty
import select
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from workspace_agent_harness.evented import (
    JsonlRunEventLog,
    classified_event_field,
    load_run_event_log,
    render_run_events,
    replay_run_event_log,
)


PROJECT_ROOT = Path(__file__).parents[1]


class EventedTuiPtyTest(unittest.TestCase):
    def test_replay_filters_visibility_in_all_three_pty_views(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "visibility-replay.jsonl"
            event_log = JsonlRunEventLog(log_path)
            started = event_log.append(
                run_id="visibility-pty-run",
                event_type="run.started",
                phase="accepted",
                caused_by_event_id=None,
                payload={
                    "prompt": "Replay safely.",
                    "expanded": classified_event_field(
                        "allowed-expanded-detail", "expanded"
                    ),
                    "restricted": classified_event_field(
                        "restricted-payload-must-not-leak", "restricted"
                    ),
                    "reasoning": "reasoning-payload-must-not-leak",
                    "credential": "credential-payload-must-not-leak",
                },
            )
            secret = event_log.append(
                run_id="visibility-pty-run",
                event_type="provider.secret_reference",
                phase="accepted",
                caused_by_event_id=started.event_id,
                visibility="secret-ref",
                payload={"locator": "secret-locator-must-not-leak"},
            )
            event_log.append(
                run_id="visibility-pty-run",
                event_type="run.terminal",
                phase="terminal",
                caused_by_event_id=secret.event_id,
                payload={
                    "status": "completed",
                    "output": "safe",
                    "error": None,
                    "steps": 0,
                    "model_calls": 0,
                },
            )

            process, master = _spawn_tui(
                "--replay",
                str(log_path),
                "--view",
                "compact",
                "--view",
                "expanded",
                "--view",
                "trace",
            )
            try:
                output = _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            text = output.decode(errors="replace")
            self.assertEqual(0, process.returncode, text)
            self.assertIn("allowed-expanded-detail", text)
            for prohibited in (
                "restricted-payload-must-not-leak",
                "reasoning-payload-must-not-leak",
                "credential-payload-must-not-leak",
                "secret-locator-must-not-leak",
            ):
                self.assertNotIn(prohibited, text)
            self.assertIn("<restricted>", text)
            self.assertIn("<secret-ref>", text)

    def test_malformed_view_selection_exits_before_creating_a_run(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "invalid-view.jsonl"
            process, master = _spawn_tui(
                "--log",
                str(log_path),
                "--view",
                "provider-wire",
            )
            try:
                output = _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            text = output.decode(errors="replace")
            self.assertEqual(2, process.returncode, text)
            self.assertIn("invalid choice", text)
            self.assertFalse(log_path.exists())

    def test_live_and_replay_switch_across_the_same_three_views(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "three-views.jsonl"
            arguments = (
                "--view",
                "compact",
                "--view",
                "expanded",
                "--view",
                "trace",
            )
            process, master = _spawn_tui("--log", str(log_path), *arguments)
            try:
                output = _read_until(master, b"Task> ")
                os.write(master, "切换 café 三视图\n".encode())
                output += _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            live_text = output.decode(errors="replace").replace("\r\n", "\n")
            self.assertEqual(0, process.returncode, live_text)
            self.assertLess(
                live_text.index("VIEW compact"),
                live_text.index("VIEW expanded"),
            )
            self.assertLess(
                live_text.index("VIEW expanded"),
                live_text.index("VIEW trace"),
            )
            self.assertEqual(3, live_text.count("TERMINAL completed"))

            replay, replay_master = _spawn_tui(
                "--replay",
                str(log_path),
                *arguments,
            )
            try:
                replay_output = _read_to_exit(replay, replay_master)
            finally:
                _stop_if_running(replay)
                os.close(replay_master)
            replay_text = replay_output.decode(errors="replace").replace("\r\n", "\n")

            self.assertEqual(0, replay.returncode, replay_text)
            live_projection = live_text[live_text.index("VIEW compact") :]
            live_projection = live_projection[: live_projection.index("EVENT_LOG")]
            self.assertEqual(live_projection.strip(), replay_text.strip())

    def test_overflow_demo_recovers_through_the_tui_and_replays_offline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "overflow-recovery.jsonl"
            process, master = _spawn_tui(
                "--log",
                str(log_path),
                "--overflow-recovery-demo",
                "--explain-compaction",
                "--view",
                "compact",
                "--view",
                "expanded",
            )
            try:
                output = _read_until(master, b"Task> ")
                os.write(master, b"recover, use the tool, and finish\n")
                output += _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            text = output.decode(errors="replace")
            self.assertEqual(0, process.returncode, text)
            self.assertIn("model.exchange_failed attempt=1 kind=context_overflow", text)
            self.assertIn(
                "context.compaction_completed attempt=overflow-recovery",
                text,
            )
            self.assertIn("context.overflow_retry_succeeded retry=success", text)
            self.assertIn("tool.execution_completed", text)
            self.assertIn("WHY_COMPACT overflow-recovery", text)
            self.assertIn("TERMINAL completed", text)
            self.assertIn('"usage":', text)
            self.assertIn('"timing":', text)
            self.assertIn('"response_identity":', text)
            self.assertIn('"context_window":', text)
            self.assertIn(" cause=", text)

            before = log_path.read_bytes()
            replayed = replay_run_event_log(log_path, explain_compaction=True)
            self.assertIn("context.overflow_retry_succeeded retry=success", replayed)
            self.assertEqual(before, log_path.read_bytes())

    def test_overflow_exhaustion_demo_has_an_explicit_terminal_projection(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "overflow-exhausted.jsonl"
            process, master = _spawn_tui(
                "--log",
                str(log_path),
                "--overflow-exhaustion-demo",
            )
            try:
                output = _read_until(master, b"Task> ")
                os.write(master, b"show bounded exhaustion\n")
                output += _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            text = output.decode(errors="replace")
            self.assertEqual(1, process.returncode, text)
            self.assertEqual(2, text.count("model.exchange_failed attempt="))
            self.assertIn("context.overflow_retry_exhausted retry=exhausted", text)
            self.assertIn("TERMINAL context_overflow", text)
            events = load_run_event_log(log_path)
            self.assertEqual("context_overflow", events[-1].payload["status"])
            self.assertNotIn(
                "tool.execution_started",
                [event.event_type for event in events],
            )

    def test_long_demo_compacts_and_expands_the_same_retained_event(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "long.jsonl"
            process, master = _spawn_tui(
                "--log",
                str(log_path),
                "--semantic-compaction-demo",
                "--explain-compaction",
                "--view",
                "expanded",
                "--view",
                "trace",
            )
            try:
                output = _read_until(master, b"Task> ")
                os.write(master, b"record three stages\n")
                output += _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            text = output.decode(errors="replace")
            self.assertEqual(0, process.returncode, text)
            events = load_run_event_log(log_path)
            self.assertEqual("completed", events[-1].payload["status"])
            self.assertIn("context.compaction_completed", text)
            self.assertIn("WHY_COMPACT", text)
            self.assertIn("PRESERVED", text)
            self.assertIn("VIEW expanded", text)
            self.assertIn("VIEW trace", text)
            self.assertLess(len(output), 100_000)
            self.assertTrue(Path(f"{log_path}.artifacts").is_dir())

    def test_unicode_task_runs_one_tool_round_trip_in_a_real_pty(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "unicode.jsonl"
            process, master = _spawn_tui("--log", str(log_path))
            try:
                output = _read_until(master, b"Task> ")
                os.write(master, "手动 café 🚀\n".encode())
                output += _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            self.assertEqual(0, process.returncode, output.decode(errors="replace"))
            events = load_run_event_log(log_path)
            rendered = render_run_events(events).replace("\n", "\r\n")
            text = output.decode()
            self.assertIn(rendered, text)
            self.assertEqual("completed", events[-1].payload["status"])
            self.assertEqual(
                1,
                sum(
                    event.event_type == "tool.execution_completed"
                    for event in events
                ),
            )

    def test_blank_terminal_input_exits_without_creating_a_run(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "blank.jsonl"
            process, master = _spawn_tui("--log", str(log_path))
            try:
                output = _read_until(master, b"Task> ")
                os.write(master, b"   \n")
                output += _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            self.assertEqual(2, process.returncode, output.decode(errors="replace"))
            self.assertFalse(log_path.exists())
            self.assertIn("Task must not be blank", output.decode())

    def test_ctrl_c_during_exchange_records_cancelled_terminal_and_exits_130(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "cancel.jsonl"
            process, master = _spawn_tui(
                "--log",
                str(log_path),
                "--wait-for-cancel",
                "--view",
                "trace",
            )
            try:
                output = _read_until(master, b"Task> ")
                os.write(master, b"cancel this run\n")
                _wait_for_log_event(log_path, "model.exchange_started")
                os.kill(process.pid, signal.SIGINT)
                output += _read_to_exit(process, master)
            finally:
                _stop_if_running(process)
                os.close(master)

            self.assertEqual(130, process.returncode, output.decode(errors="replace"))
            events = load_run_event_log(log_path)
            self.assertEqual("control.cancel_requested", events[-2].event_type)
            self.assertEqual("cancelled", events[-1].payload["status"])
            self.assertEqual(
                1,
                sum(event.event_type == "run.terminal" for event in events),
            )
            self.assertIn("control.cancel_requested", output.decode(errors="replace"))
            self.assertIn('"status":"cancelled"', output.decode(errors="replace"))
            self.assertNotIn(
                "tool.execution_started",
                [event.event_type for event in events],
            )


def _spawn_tui(*arguments: str) -> tuple[subprocess.Popen[bytes], int]:
    master, slave = pty.openpty()
    process = subprocess.Popen(
        [sys.executable, "-m", "workspace_agent_harness.tui", *arguments],
        cwd=PROJECT_ROOT,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
    )
    os.close(slave)
    return process, master


def _read_until(master: int, marker: bytes, timeout: float = 5) -> bytes:
    output = b""
    deadline = time.monotonic() + timeout
    while marker not in output and time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.05)
        if ready:
            chunk = os.read(master, 65_536)
            if not chunk:
                break
            output += chunk
    if marker not in output:
        raise AssertionError(f"did not observe terminal marker {marker!r}: {output!r}")
    return output


def _read_to_exit(
    process: subprocess.Popen[bytes],
    master: int,
    timeout: float = 8,
) -> bytes:
    output = b""
    deadline = time.monotonic() + timeout
    while process.poll() is None and time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.05)
        if ready:
            chunk = os.read(master, 65_536)
            if not chunk:
                break
            output += chunk
    process.wait(timeout=max(0.1, deadline - time.monotonic()))
    while True:
        ready, _, _ = select.select([master], [], [], 0)
        if not ready:
            break
        try:
            chunk = os.read(master, 65_536)
        except OSError:
            break
        if not chunk:
            break
        output += chunk
    return output


def _wait_for_log_event(path: Path, event_type: str, timeout: float = 5) -> None:
    deadline = time.monotonic() + timeout
    needle = f'"event_type":"{event_type}"'
    while time.monotonic() < deadline:
        if path.exists() and needle in path.read_text(encoding="utf-8"):
            return
        time.sleep(0.02)
    raise AssertionError(f"event {event_type!r} was not retained in time")


def _stop_if_running(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        process.kill()
        process.wait(timeout=2)


if __name__ == "__main__":
    unittest.main()
