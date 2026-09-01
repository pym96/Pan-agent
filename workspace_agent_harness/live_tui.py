from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import Event, Thread
from types import MappingProxyType
from typing import Callable, Mapping, Protocol, Sequence, TextIO, cast

from workspace_agent_harness import RunLimits, Task
from workspace_agent_harness.context_projection import (
    CanonicalJsonTokenEstimator,
    ContextPolicy,
    FileArtifactStore,
    SemanticContextProjector,
    SemanticToolObservation,
    action_tool_set_identity,
)
from workspace_agent_harness.deepseek_live import (
    DeepSeekHttpTransport,
    DeepSeekLiveTranslationAdapter,
    DeepSeekModelGateway,
    DeepSeekToolBinding,
    FileDeepSeekExchangeStore,
    locked_deepseek_v3_model_profile,
)
from workspace_agent_harness.evented import (
    AgentLoop,
    EventedRunResult,
    EventedRunStatus,
    EventTool,
    JsonlRunEventLog,
    MAX_TOOL_CALLS_PER_BATCH,
    ModelGateway,
    RunEvent,
    RunEventView,
    load_run_event_log,
    render_run_events,
)
from workspace_agent_harness.translation import ActionTool, canonical_json_bytes


LIVE_TUI_AGENT_ID = "deepseek-live-workspace-agent/v1"
LIVE_TUI_SYSTEM_POLICY_ID = "deepseek-live-workspace-policy/v1"
LIVE_TUI_MAX_FILE_BYTES = 262_144
LIVE_TUI_MAX_LIST_ENTRIES = 500
LIVE_TUI_RUN_LIMITS = RunLimits(
    max_steps=12,
    max_model_calls=16,
    timeout_seconds=300,
)
LIVE_TUI_SYSTEM_PROMPT = (
    "Act on the task only through provided functions. One response may contain "
    f"between 1 and {MAX_TOOL_CALLS_PER_BATCH} independent domain function calls; "
    "they execute serially in the returned order after the complete batch validates. "
    "Use complete or abstain only as the single function in a response. Never place "
    "reasoning, rationale, thought, or analysis in function arguments. The selected "
    "workspace is the only filesystem authority. All paths must "
    "be relative to that workspace. Use inspect_workspace and read_file before "
    "changing unfamiliar files. Use write_file for bounded atomic text changes. "
    "Use verify_workspace for supported syntax checks; no host shell is available. "
    "After a write, inspect or verify when the task requires exact content, then "
    "call complete."
)


class LiveTuiGatewayFactory(Protocol):
    def __call__(
        self,
        run_root: Path,
        tools: tuple[EventTool, ...],
    ) -> ModelGateway: ...


@dataclass(frozen=True)
class LiveRunRecord:
    run_id: str
    status: EventedRunStatus
    event_log_path: Path
    run_root: Path
    model_calls: int
    tool_calls: int
    usage: Mapping[str, int | None]
    changed_workspace_paths: tuple[str, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "usage", MappingProxyType(dict(self.usage)))


class WorkspaceBoundary:
    """Resolve one explicit root and reject every path that can escape it."""

    def __init__(self, root: Path) -> None:
        try:
            resolved = root.expanduser().resolve(strict=True)
        except OSError as error:
            raise ValueError(f"workspace cannot be resolved: {error}") from error
        if not resolved.is_dir():
            raise ValueError("workspace root must be an existing directory")
        self.root = resolved

    def inspect(self, relative_path: str) -> SemanticToolObservation:
        self.validate_inspect(relative_path)
        selected = self._resolve_existing(relative_path, allow_root=True)
        entries: list[dict[str, object]] = []
        for child in sorted(selected.iterdir(), key=lambda item: item.name):
            if len(entries) >= LIVE_TUI_MAX_LIST_ENTRIES:
                raise ValueError("workspace listing exceeds the bounded entry limit")
            child_relative = child.relative_to(self.root).as_posix()
            child_stat = child.lstat()
            if stat.S_ISLNK(child_stat.st_mode):
                kind = "symlink-blocked"
            elif stat.S_ISDIR(child_stat.st_mode):
                kind = "directory"
            elif stat.S_ISREG(child_stat.st_mode):
                kind = "file"
            else:
                kind = "unsupported"
            entries.append(
                {
                    "path": child_relative,
                    "kind": kind,
                    "bytes": child_stat.st_size if kind == "file" else None,
                }
            )
        relative = "." if selected == self.root else selected.relative_to(self.root).as_posix()
        content = _canonical_json({"directory": relative, "entries": entries})
        return SemanticToolObservation(
            content=content,
            facts=(f"Inspected workspace directory {relative} with {len(entries)} entries.",),
        )

    def read_text(self, relative_path: str) -> SemanticToolObservation:
        self.validate_read(relative_path)
        selected = self._resolve_existing(relative_path)
        body = selected.read_bytes()
        if len(body) > LIVE_TUI_MAX_FILE_BYTES:
            raise ValueError("read_file changed beyond the bounded text-file size")
        try:
            content = body.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError("read_file supports UTF-8 text only") from error
        relative = selected.relative_to(self.root).as_posix()
        digest = hashlib.sha256(body).hexdigest()
        return SemanticToolObservation(
            content=content,
            facts=(f"Read {relative} as UTF-8 text with sha256:{digest}.",),
        )

    def write_text(self, relative_path: str, content: str) -> tuple[str, bool]:
        self.validate_write(relative_path, content)
        body = content.encode("utf-8")
        selected = self._resolve_write_target(relative_path)
        previous: bytes | None = None
        if selected.exists():
            selected_stat = selected.stat()
            if selected_stat.st_size <= LIVE_TUI_MAX_FILE_BYTES:
                previous = selected.read_bytes()
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".workspace-agent-write-",
            dir=selected.parent,
        )
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, selected)
        finally:
            if temporary.exists():
                temporary.unlink()
        relative = selected.relative_to(self.root).as_posix()
        digest = hashlib.sha256(body).hexdigest()
        changed = previous != body
        receipt = _canonical_json(
            {
                "path": relative,
                "bytes": len(body),
                "sha256": f"sha256:{digest}",
                "changed": changed,
            }
        )
        return receipt, changed

    def verify(self, check: str) -> SemanticToolObservation:
        self.validate_verify(check)
        suffix = ".py" if check == "python-syntax" else ".json"
        checked = 0
        failures: list[str] = []
        for path in self._safe_regular_files(suffix):
            checked += 1
            relative = path.relative_to(self.root).as_posix()
            try:
                if path.stat().st_size > LIVE_TUI_MAX_FILE_BYTES:
                    failures.append(
                        f"{relative}: bounded verification file size exceeded"
                    )
                    continue
                text = path.read_text(encoding="utf-8")
                if check == "python-syntax":
                    compile(text, relative, "exec")
                else:
                    json.loads(text)
            except (OSError, UnicodeDecodeError, SyntaxError, json.JSONDecodeError) as error:
                failures.append(f"{relative}: {type(error).__name__}: {error}")
        status = "passed" if not failures else "failed"
        content = _canonical_json(
            {
                "check": check,
                "status": status,
                "files_checked": checked,
                "failures": failures,
            }
        )
        return SemanticToolObservation(
            content=content,
            facts=(f"Ran {check} over {checked} workspace files: {status}.",),
            failures=tuple(failures),
        )

    def validate_inspect(self, relative_path: str) -> None:
        selected = self._resolve_existing(relative_path, allow_root=True)
        if not selected.is_dir():
            raise ValueError("inspect_workspace path must name a directory")

    def validate_read(self, relative_path: str) -> None:
        selected = self._resolve_existing(relative_path)
        selected_stat = selected.stat()
        if not stat.S_ISREG(selected_stat.st_mode):
            raise ValueError("read_file path must name a regular file")
        if selected_stat.st_size > LIVE_TUI_MAX_FILE_BYTES:
            raise ValueError("read_file exceeds the bounded text-file size")

    def validate_write(self, relative_path: str, content: str) -> None:
        if not isinstance(content, str):
            raise ValueError("write_file content must be text")
        if len(content.encode("utf-8")) > LIVE_TUI_MAX_FILE_BYTES:
            raise ValueError("write_file exceeds the bounded text-file size")
        self._resolve_write_target(relative_path)

    def validate_verify(self, check: str) -> None:
        if check not in {"python-syntax", "json-syntax"}:
            raise ValueError("unsupported workspace verification check")

    def _safe_regular_files(self, suffix: str) -> Sequence[Path]:
        selected: list[Path] = []
        for directory, names, files in os.walk(self.root, followlinks=False):
            directory_path = Path(directory)
            safe_names: list[str] = []
            for name in sorted(names):
                child = directory_path / name
                if child.is_symlink():
                    continue
                safe_names.append(name)
            names[:] = safe_names
            for name in sorted(files):
                child = directory_path / name
                if child.suffix != suffix or child.is_symlink():
                    continue
                if child.is_file():
                    selected.append(child)
                if len(selected) > LIVE_TUI_MAX_LIST_ENTRIES:
                    raise ValueError("workspace verification exceeds the bounded file limit")
        return tuple(selected)

    def _resolve_existing(self, raw_path: str, *, allow_root: bool = False) -> Path:
        parts = self._relative_parts(raw_path, allow_root=allow_root)
        selected = self.root.joinpath(*parts)
        self._reject_symlink_components(selected)
        try:
            resolved = selected.resolve(strict=True)
        except OSError as error:
            raise ValueError(f"workspace path does not exist: {raw_path}") from error
        self._require_within_root(resolved)
        return resolved

    def _resolve_write_target(self, raw_path: str) -> Path:
        parts = self._relative_parts(raw_path, allow_root=False)
        selected = self.root.joinpath(*parts)
        parent = selected.parent
        self._reject_symlink_components(parent)
        try:
            resolved_parent = parent.resolve(strict=True)
        except OSError as error:
            raise ValueError("write_file parent directory does not exist") from error
        self._require_within_root(resolved_parent)
        if not resolved_parent.is_dir():
            raise ValueError("write_file parent must be a directory")
        target = resolved_parent / selected.name
        if target.is_symlink():
            raise ValueError("workspace symlink paths are not writable")
        if target.exists() and not target.is_file():
            raise ValueError("write_file target must be a regular file or absent")
        return target

    def _relative_parts(self, raw_path: str, *, allow_root: bool) -> tuple[str, ...]:
        if not isinstance(raw_path, str) or not raw_path:
            raise ValueError("workspace path must be non-empty text")
        if "\x00" in raw_path or "\\" in raw_path:
            raise ValueError("workspace path contains unsupported characters")
        candidate = Path(raw_path)
        if candidate.is_absolute():
            raise ValueError("workspace path must be relative")
        parts = tuple(part for part in candidate.parts if part != ".")
        if any(part in {"", ".."} for part in parts):
            raise ValueError("workspace path traversal is not allowed")
        if not parts and not allow_root:
            raise ValueError("workspace path must name a child of the workspace")
        return parts

    def _reject_symlink_components(self, selected: Path) -> None:
        try:
            relative = selected.relative_to(self.root)
        except ValueError as error:
            raise ValueError("workspace path escapes the selected root") from error
        current = self.root
        for part in relative.parts:
            current = current / part
            try:
                mode = current.lstat().st_mode
            except FileNotFoundError:
                break
            if stat.S_ISLNK(mode):
                raise ValueError("workspace symlink traversal is not allowed")

    def _require_within_root(self, selected: Path) -> None:
        try:
            selected.relative_to(self.root)
        except ValueError as error:
            raise ValueError("workspace path escapes the selected root") from error


class _WorkspaceTool:
    definition: ActionTool

    def __init__(self, boundary: WorkspaceBoundary) -> None:
        self._boundary = boundary


class InspectWorkspaceTool(_WorkspaceTool):
    definition = ActionTool(
        name="inspect_workspace",
        description=(
            "List one workspace directory without following symlinks. The path must "
            "be workspace-relative; use . for the selected workspace root."
        ),
        argument_name="input",
        argument_description="Canonical JSON containing the directory path.",
    )

    def execute(
        self,
        arguments: Mapping[str, object],
        cancel_signal: Event,
    ) -> SemanticToolObservation:
        payload = _decode_tool_input(arguments, ("path",))
        return self._boundary.inspect(cast(str, payload["path"]))

    def validate(self, arguments: Mapping[str, object]) -> None:
        payload = _decode_tool_input(arguments, ("path",))
        self._boundary.validate_inspect(cast(str, payload["path"]))


class ReadWorkspaceFileTool(_WorkspaceTool):
    definition = ActionTool(
        name="read_file",
        description=(
            "Read one bounded UTF-8 regular file inside the selected workspace. "
            "Absolute paths, traversal, and symlinks are rejected."
        ),
        argument_name="input",
        argument_description="Canonical JSON containing the workspace-relative path.",
    )

    def execute(
        self,
        arguments: Mapping[str, object],
        cancel_signal: Event,
    ) -> SemanticToolObservation:
        payload = _decode_tool_input(arguments, ("path",))
        return self._boundary.read_text(cast(str, payload["path"]))

    def validate(self, arguments: Mapping[str, object]) -> None:
        payload = _decode_tool_input(arguments, ("path",))
        self._boundary.validate_read(cast(str, payload["path"]))


class WriteWorkspaceFileTool(_WorkspaceTool):
    definition = ActionTool(
        name="write_file",
        description=(
            "Atomically write one bounded UTF-8 text file inside an existing "
            "workspace directory. Absolute paths, traversal, and symlinks are rejected."
        ),
        argument_name="input",
        argument_description="Canonical JSON containing path and complete text content.",
    )

    def __init__(self, boundary: WorkspaceBoundary) -> None:
        super().__init__(boundary)
        self._changed_paths: set[str] = set()

    @property
    def changed_paths(self) -> tuple[str, ...]:
        return tuple(sorted(self._changed_paths))

    def execute(
        self,
        arguments: Mapping[str, object],
        cancel_signal: Event,
    ) -> SemanticToolObservation:
        payload = _decode_tool_input(arguments, ("path", "content"))
        path = cast(str, payload["path"])
        receipt, changed = self._boundary.write_text(
            path,
            cast(str, payload["content"]),
        )
        normalized = _normalized_relative_path(path)
        if changed:
            self._changed_paths.add(normalized)
        return SemanticToolObservation(
            content=receipt,
            facts=(f"Wrote workspace file {normalized}; changed={str(changed).lower()}.",),
        )

    def validate(self, arguments: Mapping[str, object]) -> None:
        payload = _decode_tool_input(arguments, ("path", "content"))
        self._boundary.validate_write(
            cast(str, payload["path"]),
            cast(str, payload["content"]),
        )


class VerifyWorkspaceTool(_WorkspaceTool):
    definition = ActionTool(
        name="verify_workspace",
        description=(
            "Run one built-in, non-executing workspace syntax check. Supported "
            "checks are python-syntax and json-syntax; no shell is available."
        ),
        argument_name="input",
        argument_description="Canonical JSON containing one supported check name.",
    )

    def execute(
        self,
        arguments: Mapping[str, object],
        cancel_signal: Event,
    ) -> SemanticToolObservation:
        payload = _decode_tool_input(arguments, ("check",))
        return self._boundary.verify(cast(str, payload["check"]))

    def validate(self, arguments: Mapping[str, object]) -> None:
        payload = _decode_tool_input(arguments, ("check",))
        self._boundary.validate_verify(cast(str, payload["check"]))


def live_workspace_tools(boundary: WorkspaceBoundary) -> tuple[EventTool, ...]:
    return (
        InspectWorkspaceTool(boundary),
        ReadWorkspaceFileTool(boundary),
        WriteWorkspaceFileTool(boundary),
        VerifyWorkspaceTool(boundary),
    )


def live_workspace_bindings(
    tools: Sequence[EventTool],
) -> tuple[DeepSeekToolBinding, ...]:
    schemas: dict[str, Mapping[str, object]] = {
        "inspect_workspace": _closed_string_schema(("path",)),
        "read_file": _closed_string_schema(("path",)),
        "write_file": _closed_string_schema(("path", "content")),
        "verify_workspace": _closed_string_schema(
            ("check",),
            enums={"check": ("python-syntax", "json-syntax")},
        ),
    }
    return tuple(
        DeepSeekToolBinding(
            runtime_tool=tool.definition,
            provider_parameters=schemas[tool.definition.name],
        )
        for tool in tools
    )


class LiveProgressProjection:
    """Render only public lifecycle metadata from already committed events."""

    def __init__(self, output: TextIO) -> None:
        self._output = output

    def observe(self, event: RunEvent) -> None:
        line: str | None = None
        if event.event_type == "run.started":
            line = f"PROGRESS run.started run={event.run_id}"
        elif event.event_type == "model.exchange_started":
            line = (
                "PROGRESS model.exchange_started"
                f" attempt={event.payload.get('exchange_attempt')}"
            )
        elif event.event_type in {"model.exchange_settled", "model.exchange_failed"}:
            usage = event.payload.get("usage")
            total = usage.get("total_tokens") if isinstance(usage, Mapping) else None
            line = f"PROGRESS {event.event_type} usage_total={total}"
        elif event.event_type in {"tool.execution_started", "tool.execution_completed"}:
            line = f"PROGRESS {event.event_type} tool={event.payload.get('tool_name')}"
        elif event.event_type == "run.terminal":
            line = f"PROGRESS run.terminal status={event.payload.get('status')}"
        if line is not None:
            self._output.write(line + "\n")
            self._output.flush()


class LiveTuiSession:
    """Own interactive task admission while delegating each Run to AgentLoop."""

    def __init__(
        self,
        *,
        workspace_root: Path,
        session_root: Path,
        input_stream: TextIO = sys.stdin,
        output: TextIO = sys.stdout,
        initial_view: RunEventView | str = RunEventView.COMPACT,
        explain_compaction: bool = False,
        gateway_factory: LiveTuiGatewayFactory | None = None,
        credential_loader: Callable[[], str] | None = None,
        run_id_factory: Callable[[], str] | None = None,
        progress_enabled: bool = True,
    ) -> None:
        self._boundary = WorkspaceBoundary(workspace_root)
        self._session_root = session_root.expanduser().resolve(strict=False)
        _require_disjoint_roots(self._boundary.root, self._session_root)
        if self._session_root.exists():
            raise ValueError("session root must be a new exclusive path")
        self._input = input_stream
        self._output = output
        self._view = RunEventView(initial_view)
        self._explain_compaction = explain_compaction
        self._gateway_factory = gateway_factory
        self._credential_loader = credential_loader or _environment_credential
        self._api_key: str | None = None
        self._run_id_factory = run_id_factory or (lambda: uuid.uuid4().hex)
        self._progress_enabled = progress_enabled
        self._records: dict[str, LiveRunRecord] = {}
        self._close_status = 0
        self._close_after_active_run = False

    @property
    def records(self) -> tuple[LiveRunRecord, ...]:
        return tuple(self._records.values())

    def run(self) -> int:
        self._render_banner()
        confirmation = self._readline("Confirm live provider/workspace [y/N]> ")
        if confirmation is None:
            return self._close_status
        if confirmation.strip().casefold() not in {"y", "yes"}:
            self._output.write("Live session cancelled; no Run or Provider call was created.\n")
            return 0
        try:
            self._session_root.mkdir(parents=True, exist_ok=False)
        except OSError as error:
            self._output.write(
                f"Live TUI validation failed: cannot create session root: {error}\n"
            )
            return 2
        self._output.write(f"SESSION_ARTIFACTS {self._session_root}\n")
        self._render_help()
        while True:
            task = self._readline("Task> ")
            if task is None:
                if self._close_status == 0:
                    self._output.write("Input ended; closing Live TUI.\n")
                return self._close_status
            stripped = task.strip()
            if not stripped:
                self._output.write("Task must not be blank; no Run was created.\n")
                continue
            if stripped.startswith(":"):
                if self._handle_command(stripped):
                    return 0
                continue
            try:
                record = self.execute_task(task)
            except ValueError as error:
                self._output.write(f"Task validation failed: {error}; no Provider call was made.\n")
                continue
            self._render_terminal_record(record)
            if self._close_after_active_run:
                self._output.write(
                    "Live TUI closed after the cancelled Run reached its terminal state.\n"
                )
                return 130

    def execute_task(self, prompt: str) -> LiveRunRecord:
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("task prompt must contain non-whitespace text")
        if self._gateway_factory is None:
            self._ensure_credential()
        run_id = self._run_id_factory()
        if not run_id or run_id in self._records:
            raise ValueError("Run ID must be unique and non-empty")
        run_root = self._session_root / "runs" / run_id
        run_root.mkdir(parents=True, exist_ok=False)
        event_log_path = run_root / "events.jsonl"
        event_log = JsonlRunEventLog(event_log_path)
        tools = live_workspace_tools(self._boundary)
        gateway = (
            self._gateway_factory(run_root, tools)
            if self._gateway_factory is not None
            else self._default_gateway(run_root, tools)
        )
        projector = _live_context_projector(
            run_root=run_root,
            tools=tools,
        )
        cancel_signal = Event()
        result_box: list[EventedRunResult] = []
        error_box: list[BaseException] = []

        def execute() -> None:
            try:
                result_box.append(
                    AgentLoop(
                        gateway=gateway,
                        tools=tools,
                        event_log=event_log,
                        context_projector=projector,
                        run_id=run_id,
                        agent_id=LIVE_TUI_AGENT_ID,
                        system_policy_identity=LIVE_TUI_SYSTEM_POLICY_ID,
                        loop_policy_id="observation-feedback-v0",
                    ).run(
                        Task(task_id=f"live-tui:{run_id}", prompt=prompt),
                        LIVE_TUI_RUN_LIMITS,
                        cancel_signal=cancel_signal,
                    )
                )
            except BaseException as error:
                error_box.append(error)

        worker = Thread(target=execute, name=f"live-tui-{run_id}", daemon=False)
        worker.start()
        projection = LiveProgressProjection(self._output)
        observed_count = 0
        while worker.is_alive():
            if self._progress_enabled:
                snapshot = event_log.snapshot()
                for event in snapshot[observed_count:]:
                    projection.observe(event)
                observed_count = len(snapshot)
            try:
                worker.join(timeout=0.02)
            except KeyboardInterrupt:
                if not cancel_signal.is_set():
                    cancel_signal.set()
                    self._output.write("Cancellation requested; waiting for terminal settlement.\n")
                    self._output.flush()
                else:
                    self._close_after_active_run = True
                    self._close_status = 130
                    self._output.write(
                        "Second interrupt received; closing after terminal settlement.\n"
                    )
                    self._output.flush()
        if self._progress_enabled:
            snapshot = event_log.snapshot()
            for event in snapshot[observed_count:]:
                projection.observe(event)
        if error_box:
            raise RuntimeError(
                f"AgentLoop worker failed before terminal settlement: {type(error_box[0]).__name__}"
            ) from error_box[0]
        if len(result_box) != 1:
            raise RuntimeError("AgentLoop worker did not return exactly one result")
        result = result_box[0]
        events = load_run_event_log(event_log_path)
        write_tool = next(
            tool for tool in tools if isinstance(tool, WriteWorkspaceFileTool)
        )
        usage = _aggregate_usage(events)
        record = LiveRunRecord(
            run_id=run_id,
            status=result.status,
            event_log_path=event_log_path,
            run_root=run_root,
            model_calls=result.model_calls,
            tool_calls=result.steps,
            usage=usage,
            changed_workspace_paths=write_tool.changed_paths,
        )
        _write_run_summary(
            record,
            workspace_root=self._boundary.root,
            provider="DeepSeek",
            model=locked_deepseek_v3_model_profile().requested_model,
        )
        self._records[run_id] = record
        return record

    def _ensure_credential(self) -> None:
        if self._api_key is not None:
            return
        candidate = self._credential_loader()
        if not isinstance(candidate, str) or not candidate.strip():
            raise ValueError("DEEPSEEK_API_KEY is required only when a task is submitted")
        self._api_key = candidate.strip()

    def _default_gateway(
        self,
        run_root: Path,
        tools: tuple[EventTool, ...],
    ) -> ModelGateway:
        assert self._api_key is not None
        return DeepSeekModelGateway(
            adapter=DeepSeekLiveTranslationAdapter(
                profile=locked_deepseek_v3_model_profile(),
                tool_bindings=live_workspace_bindings(tools),
                system_prompt=LIVE_TUI_SYSTEM_PROMPT,
                max_tool_calls_per_response=MAX_TOOL_CALLS_PER_BATCH,
                allow_tool_call_content=True,
            ),
            transport=DeepSeekHttpTransport(
                api_key=self._api_key,
                timeout_seconds=60,
            ),
            exchange_store=FileDeepSeekExchangeStore(
                run_root / "provider-exchanges"
            ),
        )

    def _render_banner(self) -> None:
        profile = locked_deepseek_v3_model_profile()
        self._output.write("LIVE MODE: external model calls occur only after task submit.\n")
        self._output.write(f"PROVIDER {profile.provider}\n")
        self._output.write(f"MODEL {profile.requested_model}\n")
        self._output.write(f"WORKSPACE {self._boundary.root}\n")
        self._output.write(f"SESSION_ROOT {self._session_root}\n")
        self._output.write(
            "BOUNDARY no host shell; workspace-relative inspect/read/write/syntax tools only.\n"
        )

    def _render_help(self) -> None:
        self._output.write(
            "COMMANDS :help | :view compact|expanded|trace | :runs | "
            ":replay RUN_ID | :exit\n"
        )
        self._output.write(
            "CTRL-C during a Run requests cancellation; Ctrl-C at Task> or :exit closes.\n"
        )
        self._output.write(
            "Each non-empty task is a fresh model context and Run; the selected workspace persists.\n"
        )

    def _handle_command(self, command: str) -> bool:
        pieces = command.split()
        name = pieces[0].casefold()
        if name in {":exit", ":quit"} and len(pieces) == 1:
            self._output.write("Live TUI closed.\n")
            return True
        if name == ":help" and len(pieces) == 1:
            self._render_help()
            return False
        if name == ":runs" and len(pieces) == 1:
            if not self._records:
                self._output.write("RUNS none\n")
            for record in self._records.values():
                self._output.write(f"RUNS {record.run_id} status={record.status.value}\n")
            return False
        if name == ":view" and len(pieces) == 2:
            try:
                self._view = RunEventView(pieces[1].casefold())
            except ValueError:
                self._output.write("Unknown view; choose compact, expanded, or trace.\n")
            else:
                self._output.write(f"VIEW_SELECTED {self._view.value}\n")
            return False
        if name == ":replay" and len(pieces) == 2:
            replay_record = self._records.get(pieces[1])
            if replay_record is None:
                self._output.write("Unknown Run ID; no replay or external call occurred.\n")
                return False
            events = load_run_event_log(replay_record.event_log_path)
            self._output.write(
                render_run_events(
                    events,
                    view=self._view,
                    explain_compaction=self._explain_compaction,
                )
            )
            return False
        self._output.write("Unknown command; use :help. No Run was created.\n")
        return False

    def _render_terminal_record(self, record: LiveRunRecord) -> None:
        events = load_run_event_log(record.event_log_path)
        self._output.write(
            render_run_events(
                events,
                view=self._view,
                explain_compaction=self._explain_compaction,
            )
        )
        self._output.write(
            "RUN_METADATA"
            f" run_id={record.run_id}"
            f" terminal={record.status.value}"
            f" model_calls={record.model_calls}"
            f" tool_calls={record.tool_calls}"
            f" input_tokens={record.usage.get('input_tokens')}"
            f" output_tokens={record.usage.get('output_tokens')}"
            f" total_tokens={record.usage.get('total_tokens')}"
            f" usage_known_calls={record.usage.get('known_calls')}"
            f" changed_paths={_canonical_json(list(record.changed_workspace_paths))}\n"
        )
        self._output.write(f"EVENT_LOG {record.event_log_path}\n")
        self._output.write(f"RUN_ARTIFACTS {record.run_root}\n")
        self._output.flush()

    def _readline(self, prompt: str) -> str | None:
        self._output.write(prompt)
        self._output.flush()
        try:
            line = self._input.readline()
        except KeyboardInterrupt:
            self._close_status = 130
            self._output.write("\nLive TUI closed by interrupt.\n")
            return None
        if line == "":
            return None
        return line.rstrip("\r\n")


def run_live_tui(
    *,
    workspace_root: Path,
    session_root: Path,
    input_stream: TextIO = sys.stdin,
    output: TextIO = sys.stdout,
    initial_view: RunEventView | str = RunEventView.COMPACT,
    explain_compaction: bool = False,
) -> int:
    try:
        session = LiveTuiSession(
            workspace_root=workspace_root,
            session_root=session_root,
            input_stream=input_stream,
            output=output,
            initial_view=initial_view,
            explain_compaction=explain_compaction,
        )
    except ValueError as error:
        output.write(f"Live TUI validation failed: {error}\n")
        return 2
    return session.run()


def _live_context_projector(
    *,
    run_root: Path,
    tools: Sequence[EventTool],
) -> SemanticContextProjector:
    profile = locked_deepseek_v3_model_profile()
    bindings = live_workspace_bindings(tools)
    estimator = CanonicalJsonTokenEstimator()
    overhead_material = {
        "system_prompt": LIVE_TUI_SYSTEM_PROMPT,
        "tool_bindings": [binding.identity_material() for binding in bindings],
        "terminal_tools": ("complete", "abstain"),
    }
    overhead_tokens = estimator.estimate(overhead_material)
    return SemanticContextProjector(
        policy=ContextPolicy(
            verified_context_window=profile.context_window_tokens,
            fallback_context_window=None,
            context_window_source=profile.capability_source,
            context_window_confidence="high",
            requested_output_room=profile.max_output_tokens,
            protocol_tool_overhead_tokens=overhead_tokens,
            overhead_estimator_id=(
                f"{estimator.identity}:deepseek-live-tui-protocol/v1"
            ),
            overhead_source="canonical Live TUI system prompt and Provider tool schemas",
            overhead_confidence=estimator.confidence,
            overhead_tool_set_identity=action_tool_set_identity(
                tuple(tool.definition for tool in tools)
            ),
            system_policy_identity=LIVE_TUI_SYSTEM_POLICY_ID,
        ),
        estimator=estimator,
        artifact_store=FileArtifactStore(run_root / "context-artifacts"),
    )


def _decode_tool_input(
    arguments: Mapping[str, object],
    expected_fields: tuple[str, ...],
) -> dict[str, object]:
    if set(arguments) != {"input"} or not isinstance(arguments.get("input"), str):
        raise ValueError("workspace tool requires one canonical JSON input string")
    try:
        payload = json.loads(cast(str, arguments["input"]))
    except json.JSONDecodeError as error:
        raise ValueError("workspace tool input must be valid JSON") from error
    if not isinstance(payload, dict) or set(payload) != set(expected_fields):
        raise ValueError("workspace tool input violates its closed schema")
    if not all(isinstance(payload[field], str) for field in expected_fields):
        raise ValueError("workspace tool fields must be strings")
    return cast(dict[str, object], payload)


def _closed_string_schema(
    fields: tuple[str, ...],
    *,
    enums: Mapping[str, tuple[str, ...]] | None = None,
) -> Mapping[str, object]:
    selected_enums = enums or {}
    properties: dict[str, object] = {}
    for field in fields:
        definition: dict[str, object] = {"type": "string"}
        if field in selected_enums:
            definition["enum"] = list(selected_enums[field])
        properties[field] = definition
    return {
        "type": "object",
        "properties": properties,
        "required": list(fields),
        "additionalProperties": False,
    }


def _aggregate_usage(events: Sequence[RunEvent]) -> dict[str, int | None]:
    totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    known_calls = 0
    exchange_calls = 0
    for event in events:
        if event.event_type not in {"model.exchange_settled", "model.exchange_failed"}:
            continue
        exchange_calls += 1
        usage = event.payload.get("usage")
        if not isinstance(usage, Mapping):
            continue
        values = {key: usage.get(key) for key in totals}
        if not all(isinstance(value, int) and not isinstance(value, bool) for value in values.values()):
            continue
        known_calls += 1
        for key, value in values.items():
            totals[key] += cast(int, value)
    return {
        **totals,
        "known_calls": known_calls,
        "exchange_calls": exchange_calls,
    }


def _write_run_summary(
    record: LiveRunRecord,
    *,
    workspace_root: Path,
    provider: str,
    model: str,
) -> None:
    document = {
        "schema": "workspace-agent-harness/live-tui-run-summary/v1",
        "run_id": record.run_id,
        "terminal_classification": record.status.value,
        "provider": provider,
        "model": model,
        "workspace_root": str(workspace_root),
        "model_calls": record.model_calls,
        "tool_calls": record.tool_calls,
        "usage": dict(record.usage),
        "cost": {"amount": None, "currency": "CNY", "source": "unreported"},
        "event_log": record.event_log_path.name,
        "changed_workspace_paths": list(record.changed_workspace_paths),
    }
    (record.run_root / "summary.json").write_bytes(
        canonical_json_bytes(document) + b"\n"
    )


def _normalized_relative_path(path: str) -> str:
    return Path(path).as_posix().removeprefix("./")


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _environment_credential() -> str:
    return os.environ.get("DEEPSEEK_API_KEY", "")


def _require_disjoint_roots(workspace_root: Path, session_root: Path) -> None:
    if _is_relative_to(workspace_root, session_root) or _is_relative_to(
        session_root,
        workspace_root,
    ):
        raise ValueError(
            "session artifacts and the model-writable workspace must be disjoint"
        )


def _is_relative_to(candidate: Path, parent: Path) -> bool:
    try:
        candidate.relative_to(parent)
    except ValueError:
        return False
    return True


__all__ = [
    "InspectWorkspaceTool",
    "LIVE_TUI_AGENT_ID",
    "LIVE_TUI_RUN_LIMITS",
    "LIVE_TUI_SYSTEM_POLICY_ID",
    "LIVE_TUI_SYSTEM_PROMPT",
    "LiveProgressProjection",
    "LiveRunRecord",
    "LiveTuiSession",
    "ReadWorkspaceFileTool",
    "VerifyWorkspaceTool",
    "WorkspaceBoundary",
    "WriteWorkspaceFileTool",
    "live_workspace_bindings",
    "live_workspace_tools",
    "run_live_tui",
]
