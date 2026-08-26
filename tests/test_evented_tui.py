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

from workspace_agent_harness.evented import load_run_event_log, render_run_events


PROJECT_ROOT = Path(__file__).parents[1]


class EventedTuiPtyTest(unittest.TestCase):
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
