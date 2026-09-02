from __future__ import annotations

import errno
import fcntl
import hashlib
import json
import os
import pty
import select
import signal
import subprocess
import sys
import termios
import time
import tty
from dataclasses import dataclass, field
from pathlib import Path
from threading import Event
from types import MappingProxyType
from typing import Callable, Mapping, Protocol, TextIO


TRUSTED_LOCAL_DEFAULT_TIMEOUT_SECONDS = 30
TRUSTED_LOCAL_MAX_TIMEOUT_SECONDS = 120
TRUSTED_LOCAL_MAX_COMMAND_BYTES = 32_768
TRUSTED_LOCAL_STREAM_PREVIEW_EDGE_BYTES = 4_096


@dataclass(frozen=True)
class StreamArtifact:
    locator: str
    sha256: str
    byte_count: int
    preview: str
    _artifact_root: Path = field(repr=False, compare=False)

    def read_bytes(self) -> bytes:
        return (self._artifact_root / self.locator).read_bytes()

    def model_material(self) -> dict[str, object]:
        return {
            "byte_count": self.byte_count,
            "sha256": self.sha256,
            "preview": self.preview,
        }


@dataclass(frozen=True)
class CommandSettlement:
    status: str
    exit_code: int | None
    duration_ms: int
    stdout: StreamArtifact
    stderr: StreamArtifact

    def model_observation(self) -> str:
        return json.dumps(
            {
                "status": self.status,
                "exit_code": self.exit_code,
                "duration_ms": self.duration_ms,
                "stdout": self.stdout.model_material(),
                "stderr": self.stderr.model_material(),
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )


@dataclass(frozen=True)
class PtyHandoffUpdate:
    kind: str
    payload: Mapping[str, object]

    def __post_init__(self) -> None:
        if self.kind not in {
            "human_handoff_requested",
            "human_handoff_accepted",
            "human_handoff_rejected",
            "human_handoff_cancelled",
            "pty_started",
            "pty_settled",
        }:
            raise ValueError("unknown PTY handoff update")
        object.__setattr__(self, "payload", MappingProxyType(dict(self.payload)))


@dataclass(frozen=True)
class PtyProcessResult:
    status: str
    exit_code: int | None
    duration_ms: int
    transcript: bytes


class PtyProcessAdapter(Protocol):
    def run(
        self,
        *,
        command: str,
        cwd: Path,
        environment: Mapping[str, str],
        timeout_seconds: int,
        cancel_signal: Event,
        input_stream: TextIO,
        output: TextIO,
    ) -> PtyProcessResult: ...


@dataclass(frozen=True)
class PtyHandoffSettlement:
    status: str
    accepted: bool
    exit_code: int | None
    duration_ms: int
    transcript: StreamArtifact | None

    def model_observation(self) -> str:
        transcript_material: object = None
        if self.transcript is not None:
            transcript_material = {
                "byte_count": self.transcript.byte_count,
                "sha256": self.transcript.sha256,
            }
        return json.dumps(
            {
                "status": self.status,
                "human_accepted": self.accepted,
                "exit_code": self.exit_code,
                "duration_ms": self.duration_ms,
                "transcript": transcript_material,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )


class HumanPtyHandoffController:
    """Keep command proposal/confirmation separate from terminal execution."""

    def __init__(
        self,
        *,
        workspace_root: Path,
        artifact_root: Path,
        input_stream: TextIO = sys.stdin,
        output: TextIO = sys.stdout,
        pty_adapter: PtyProcessAdapter | None = None,
    ) -> None:
        self.workspace_root = workspace_root.expanduser().resolve(strict=True)
        if not self.workspace_root.is_dir():
            raise ValueError("PTY workspace must be an existing directory")
        self.artifact_root = artifact_root.expanduser().resolve(strict=False)
        self.artifact_root.mkdir(parents=True, exist_ok=False)
        self._input = input_stream
        self._output = output
        self._pty_adapter = pty_adapter or PosixPtyAdapter()
        self._handoff_count = 0

    def handoff(
        self,
        *,
        command: str,
        timeout_seconds: int,
        cancel_signal: Event,
        observe: Callable[[PtyHandoffUpdate], None],
    ) -> PtyHandoffSettlement:
        _validate_command_request(command, timeout_seconds)
        request_payload = {
            "command": command,
            "cwd": str(self.workspace_root),
            "authority": "current-host-user",
        }
        observe(PtyHandoffUpdate("human_handoff_requested", request_payload))
        self._output.write("PTY_HANDOFF_REQUEST\n")
        self._output.write(f"COMMAND {command}\n")
        self._output.write(f"CWD {self.workspace_root}\n")
        self._output.write(
            "AUTHORITY current host user's authority; cwd is not containment.\n"
        )
        self._output.write("Transfer terminal control [y/N]> ")
        self._output.flush()
        answer = self._read_confirmation(cancel_signal)
        if answer is None:
            observe(
                PtyHandoffUpdate(
                    "human_handoff_cancelled",
                    {"decision": "cancelled", "child_started": False},
                )
            )
            self._output.write(
                "\nPTY handoff cancelled; no child process started.\n"
            )
            self._output.flush()
            return PtyHandoffSettlement(
                status="cancelled",
                accepted=False,
                exit_code=None,
                duration_ms=0,
                transcript=None,
            )
        if answer.strip().casefold() not in {"y", "yes"}:
            observe(
                PtyHandoffUpdate(
                    "human_handoff_rejected",
                    {"decision": "rejected", "child_started": False},
                )
            )
            self._output.write("PTY handoff rejected; no child process started.\n")
            self._output.flush()
            return PtyHandoffSettlement(
                status="rejected",
                accepted=False,
                exit_code=None,
                duration_ms=0,
                transcript=None,
            )
        observe(
            PtyHandoffUpdate(
                "human_handoff_accepted",
                {"decision": "accepted", "child_started": False},
            )
        )
        self._handoff_count += 1
        handoff_root = self.artifact_root / f"pty-{self._handoff_count:03d}"
        handoff_root.mkdir(exist_ok=False)
        observe(
            PtyHandoffUpdate(
                "pty_started",
                {"command": command, "cwd": str(self.workspace_root)},
            )
        )
        self._output.write(
            "PTY attached; keyboard input now belongs to the Human until the child settles.\n"
        )
        self._output.flush()
        result = self._pty_adapter.run(
            command=command,
            cwd=self.workspace_root,
            environment=_trusted_local_environment(),
            timeout_seconds=timeout_seconds,
            cancel_signal=cancel_signal,
            input_stream=self._input,
            output=self._output,
        )
        transcript = self._retain_transcript(handoff_root, result.transcript)
        observe(
            PtyHandoffUpdate(
                "pty_settled",
                {
                    "status": result.status,
                    "exit_code": result.exit_code,
                    "duration_ms": result.duration_ms,
                    "transcript": {
                        "locator": transcript.locator,
                        "sha256": transcript.sha256,
                        "byte_count": transcript.byte_count,
                    },
                },
            )
        )
        self._output.write("\nTerminal control returned to Live TUI.\n")
        self._output.flush()
        return PtyHandoffSettlement(
            status=result.status,
            accepted=True,
            exit_code=result.exit_code,
            duration_ms=result.duration_ms,
            transcript=transcript,
        )

    def _read_confirmation(self, cancel_signal: Event) -> str | None:
        if cancel_signal.is_set():
            return None
        try:
            input_fd = self._input.fileno()
        except (AttributeError, OSError):
            return self._input.readline()
        while not cancel_signal.is_set():
            readable, _, _ = select.select([input_fd], [], [], 0.05)
            if readable:
                if cancel_signal.is_set():
                    return None
                return self._input.readline()
        return None

    def _retain_transcript(
        self,
        handoff_root: Path,
        body: bytes,
    ) -> StreamArtifact:
        path = handoff_root / "transcript.raw"
        path.write_bytes(body)
        return StreamArtifact(
            locator=path.relative_to(self.artifact_root).as_posix(),
            sha256="sha256:" + hashlib.sha256(body).hexdigest(),
            byte_count=len(body),
            preview="<interactive PTY transcript retained locally>",
            _artifact_root=self.artifact_root,
        )


class PosixPtyAdapter:
    """Attach a host child to a PTY while forwarding only Human terminal bytes."""

    def run(
        self,
        *,
        command: str,
        cwd: Path,
        environment: Mapping[str, str],
        timeout_seconds: int,
        cancel_signal: Event,
        input_stream: TextIO,
        output: TextIO,
    ) -> PtyProcessResult:
        _validate_command_request(command, timeout_seconds)
        try:
            input_fd = input_stream.fileno()
        except (AttributeError, OSError) as error:
            raise ValueError("interactive PTY handoff requires a real input file descriptor") from error
        master_fd, slave_fd = pty.openpty()
        saved_terminal: list[int | list[bytes | int]] | None = None
        if os.isatty(input_fd):
            saved_terminal = termios.tcgetattr(input_fd)
            tty.setraw(input_fd)
            self._copy_terminal_size(input_fd, master_fd)
        process: subprocess.Popen[bytes] | None = None
        transcript = bytearray()
        status = "completed"
        started_ns = time.monotonic_ns()
        deadline = time.monotonic() + timeout_seconds
        input_open = True
        try:
            process = subprocess.Popen(
                ["/bin/sh", "-c", command],
                cwd=cwd,
                env=dict(environment),
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                start_new_session=True,
                close_fds=True,
            )
            os.close(slave_fd)
            slave_fd = -1
            while True:
                if cancel_signal.is_set():
                    status = "cancelled"
                    self._terminate_process_group(process)
                elif time.monotonic() >= deadline:
                    status = "timed_out"
                    self._terminate_process_group(process)

                readers = [master_fd]
                if input_open and process.poll() is None:
                    readers.append(input_fd)
                ready, _, _ = select.select(readers, [], [], 0.05)
                if input_fd in ready:
                    human_bytes = os.read(input_fd, 4_096)
                    if human_bytes:
                        try:
                            os.write(master_fd, human_bytes)
                        except OSError as error:
                            if error.errno not in {errno.EIO, errno.EBADF}:
                                raise
                    else:
                        input_open = False
                if master_fd in ready:
                    try:
                        frame = os.read(master_fd, 65_536)
                    except OSError as error:
                        if error.errno == errno.EIO:
                            frame = b""
                        else:
                            raise
                    if frame:
                        transcript.extend(frame)
                        self._write_terminal_output(output, frame)
                    elif process.poll() is not None:
                        break
                if os.isatty(input_fd):
                    self._copy_terminal_size(input_fd, master_fd)
                if process.poll() is not None and master_fd not in ready:
                    break
            exit_code = process.wait()
        finally:
            if process is not None and process.poll() is None:
                self._terminate_process_group(process)
                process.wait()
            if slave_fd >= 0:
                os.close(slave_fd)
            os.close(master_fd)
            if saved_terminal is not None:
                termios.tcsetattr(input_fd, termios.TCSADRAIN, saved_terminal)
            output.flush()
        duration_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
        return PtyProcessResult(
            status=status,
            exit_code=exit_code,
            duration_ms=duration_ms,
            transcript=bytes(transcript),
        )

    def _terminate_process_group(self, process: subprocess.Popen[bytes]) -> None:
        if process.poll() is not None:
            return
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            process.wait(timeout=0.25)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def _copy_terminal_size(self, input_fd: int, master_fd: int) -> None:
        try:
            size = fcntl.ioctl(input_fd, termios.TIOCGWINSZ, b"\0" * 8)
            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, size)
        except OSError:
            pass

    def _write_terminal_output(self, output: TextIO, body: bytes) -> None:
        binary = getattr(output, "buffer", None)
        if binary is not None:
            binary.write(body)
            binary.flush()
            return
        output.write(body.decode("utf-8", errors="replace"))
        output.flush()


class TrustedLocalExecutor:
    """Run one host-local command behind a typed, artifact-retaining Interface."""

    def __init__(
        self,
        *,
        workspace_root: Path,
        artifact_root: Path,
        shell_path: Path = Path("/bin/sh"),
    ) -> None:
        self.workspace_root = workspace_root.expanduser().resolve(strict=True)
        if not self.workspace_root.is_dir():
            raise ValueError("trusted-local workspace must be an existing directory")
        self.artifact_root = artifact_root.expanduser().resolve(strict=False)
        self.artifact_root.mkdir(parents=True, exist_ok=False)
        self._shell_path = shell_path
        self._execution_count = 0

    def run_noninteractive(
        self,
        *,
        command: str,
        timeout_seconds: int = TRUSTED_LOCAL_DEFAULT_TIMEOUT_SECONDS,
        cancel_signal: Event,
    ) -> CommandSettlement:
        _validate_command_request(command, timeout_seconds)
        self._execution_count += 1
        execution_root = self.artifact_root / f"command-{self._execution_count:03d}"
        execution_root.mkdir(exist_ok=False)
        started_ns = time.monotonic_ns()
        process = subprocess.Popen(
            [str(self._shell_path), "-c", command],
            cwd=self.workspace_root,
            env=self._child_environment(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        deadline = time.monotonic() + timeout_seconds
        status = "completed"
        while True:
            if cancel_signal.is_set():
                status = "cancelled"
                stdout, stderr = self._terminate_process_group(process)
                break
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                status = "timed_out"
                stdout, stderr = self._terminate_process_group(process)
                break
            try:
                stdout, stderr = process.communicate(timeout=min(0.05, remaining))
            except subprocess.TimeoutExpired:
                continue
            break
        duration_ms = max(0, (time.monotonic_ns() - started_ns) // 1_000_000)
        return CommandSettlement(
            status=status,
            exit_code=process.returncode,
            duration_ms=duration_ms,
            stdout=self._retain_stream(execution_root, "stdout.raw", stdout),
            stderr=self._retain_stream(execution_root, "stderr.raw", stderr),
        )

    def _terminate_process_group(
        self,
        process: subprocess.Popen[bytes],
    ) -> tuple[bytes, bytes]:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        try:
            return process.communicate(timeout=0.25)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            return process.communicate()

    def _child_environment(self) -> dict[str, str]:
        return _trusted_local_environment()

    def _retain_stream(
        self,
        execution_root: Path,
        name: str,
        body: bytes,
    ) -> StreamArtifact:
        path = execution_root / name
        path.write_bytes(body)
        locator = path.relative_to(self.artifact_root).as_posix()
        return StreamArtifact(
            locator=locator,
            sha256="sha256:" + hashlib.sha256(body).hexdigest(),
            byte_count=len(body),
            preview=self._bounded_preview(body),
            _artifact_root=self.artifact_root,
        )

    def _bounded_preview(self, body: bytes) -> str:
        edge = TRUSTED_LOCAL_STREAM_PREVIEW_EDGE_BYTES
        if len(body) <= edge * 2:
            selected = body
        else:
            omitted = len(body) - (edge * 2)
            selected = (
                body[:edge]
                + f"\n<... {omitted} bytes omitted from model observation ...>\n".encode(
                    "utf-8"
                )
                + body[-edge:]
            )
        return selected.decode("utf-8", errors="replace")


def _validate_command_request(command: str, timeout_seconds: int) -> None:
    if not isinstance(command, str) or not command.strip():
        raise ValueError("trusted-local command must be non-empty text")
    if len(command.encode("utf-8")) > TRUSTED_LOCAL_MAX_COMMAND_BYTES:
        raise ValueError("trusted-local command exceeds the bounded size")
    if (
        not isinstance(timeout_seconds, int)
        or isinstance(timeout_seconds, bool)
        or not 1 <= timeout_seconds <= TRUSTED_LOCAL_MAX_TIMEOUT_SECONDS
    ):
        raise ValueError(
            "trusted-local timeout_seconds must be an integer from 1 to "
            f"{TRUSTED_LOCAL_MAX_TIMEOUT_SECONDS}"
        )


def _trusted_local_environment() -> dict[str, str]:
    allowed = ("PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TMPDIR")
    return {name: os.environ[name] for name in allowed if name in os.environ}


__all__ = [
    "CommandSettlement",
    "HumanPtyHandoffController",
    "PosixPtyAdapter",
    "PtyHandoffSettlement",
    "PtyHandoffUpdate",
    "PtyProcessAdapter",
    "PtyProcessResult",
    "StreamArtifact",
    "TRUSTED_LOCAL_DEFAULT_TIMEOUT_SECONDS",
    "TRUSTED_LOCAL_MAX_COMMAND_BYTES",
    "TRUSTED_LOCAL_MAX_TIMEOUT_SECONDS",
    "TRUSTED_LOCAL_STREAM_PREVIEW_EDGE_BYTES",
    "TrustedLocalExecutor",
]
