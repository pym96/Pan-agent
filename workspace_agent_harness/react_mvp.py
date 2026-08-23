from __future__ import annotations

import hashlib
import json
import re
import subprocess
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from types import MappingProxyType
from typing import Mapping, Protocol, Sequence, cast

from . import AgentLoop, RunLimits, RunResult, Task


class AgentVariant(StrEnum):
    ACT_ONLY = "act-only"
    REACT = "react"


class ProviderProtocolError(RuntimeError):
    """A secret-free provider or response-contract failure."""


@dataclass(frozen=True)
class ProviderUsage:
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None


@dataclass(frozen=True)
class ProviderCallRecord:
    request_index: int
    model: str
    system_fingerprint: str | None
    usage: ProviderUsage


class JsonTransport(Protocol):
    def post_json(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> Mapping[str, object]: ...


class UrllibJsonTransport:
    """Small JSON transport that never includes credentials in raised errors."""

    def post_json(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> Mapping[str, object]:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=dict(headers),
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                body = response.read()
        except urllib.error.HTTPError as error:
            error_type = "unknown"
            try:
                decoded = json.loads(error.read().decode("utf-8", errors="replace"))
                if isinstance(decoded, dict) and isinstance(decoded.get("error"), dict):
                    provider_error = cast(dict[str, object], decoded["error"])
                    candidate = provider_error.get("type") or provider_error.get("code")
                    if isinstance(candidate, str):
                        error_type = candidate
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
            raise ProviderProtocolError(
                f"provider HTTP {error.code}: {error_type}"
            ) from None
        except urllib.error.URLError as error:
            reason = type(error.reason).__name__
            raise ProviderProtocolError(f"provider transport error: {reason}") from None
        try:
            decoded = json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ProviderProtocolError("provider response is not valid UTF-8 JSON") from None
        if not isinstance(decoded, dict):
            raise ProviderProtocolError("provider response must be a JSON object")
        return decoded


class DeepSeekJsonAdapter:
    """DeepSeek V4 Flash adapter for a harness-owned action protocol.

    Provider-native reasoning and tool calls are deliberately outside this MVP.
    Both variants use the same model with thinking disabled; the only treatment
    difference is whether the visible action document must contain a bounded
    `thought` field.
    """

    PROMPT_VERSION = "react-mvp-json-v1"

    def __init__(
        self,
        *,
        api_key: str,
        variant: AgentVariant,
        transport: JsonTransport | None = None,
        endpoint: str = "https://api.deepseek.com/chat/completions",
        model: str = "deepseek-v4-flash",
        max_completion_tokens: int = 2_048,
        max_thought_chars: int = 1_000,
        timeout_seconds: float = 120,
    ) -> None:
        if not api_key or api_key.isspace():
            raise ValueError("DeepSeek API key cannot be empty")
        if not endpoint.startswith("https://"):
            raise ValueError("DeepSeek endpoint must use HTTPS")
        if model != "deepseek-v4-flash":
            raise ValueError("ReAct MVP locks model to deepseek-v4-flash")
        if max_completion_tokens <= 0 or max_thought_chars <= 0:
            raise ValueError("model output limits must be positive")
        if timeout_seconds <= 0:
            raise ValueError("provider timeout must be positive")
        self._api_key = api_key
        self._variant = variant
        self._transport = transport or UrllibJsonTransport()
        self._endpoint = endpoint
        self._model = model
        self._max_completion_tokens = max_completion_tokens
        self._max_thought_chars = max_thought_chars
        self._timeout_seconds = timeout_seconds
        self._calls: list[ProviderCallRecord] = []

    @property
    def calls(self) -> tuple[ProviderCallRecord, ...]:
        return tuple(self._calls)

    def identity_material(self) -> object:
        return {
            "adapter": "deepseek-json-action",
            "endpoint": self._endpoint,
            "model": self._model,
            "thinking": "disabled",
            "response_format": "json_object",
            "temperature": 0,
            "max_completion_tokens": self._max_completion_tokens,
            "max_thought_chars": self._max_thought_chars,
            "variant": self._variant.value,
            "prompt_version": self.PROMPT_VERSION,
            "transport": f"{type(self._transport).__module__}.{type(self._transport).__qualname__}",
        }

    def respond(self, context: tuple[dict[str, object], ...]) -> str:
        payload: dict[str, object] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": self._system_prompt()},
                *self._provider_messages(context),
            ],
            "thinking": {"type": "disabled"},
            "response_format": {"type": "json_object"},
            "temperature": 0,
            "max_tokens": self._max_completion_tokens,
            "stream": False,
        }
        response = self._transport.post_json(
            url=self._endpoint,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "User-Agent": "workspace-agent-harness/react-mvp",
            },
            payload=payload,
            timeout_seconds=self._timeout_seconds,
        )
        self._calls.append(
            _provider_call_record(response, len(self._calls) + 1, self._model)
        )
        content = _provider_content(response)
        canonical = _validate_action_document(
            content,
            variant=self._variant,
            max_thought_chars=self._max_thought_chars,
        )
        return canonical

    def _system_prompt(self) -> str:
        action_contract = (
            'Return {"type":"tool","tool":"bash","arguments":{"command":"..."}} '
            'to act, or {"type":"final","output":"..."} to finish.'
        )
        if self._variant is AgentVariant.ACT_ONLY:
            return (
                "You operate an isolated software repository through one bash tool. "
                "Return exactly one JSON object and no prose. Do not include a thought, "
                f"analysis, rationale, or planning field. {action_contract}"
            )
        return (
            "You operate an isolated software repository through one bash tool using "
            "Thought, Action, Observation. Return exactly one JSON object and no prose. "
            f"Include one non-empty `thought` string of at most {self._max_thought_chars} "
            "characters that states the action-relevant working note. "
            f"{action_contract}"
        )

    @staticmethod
    def _provider_messages(
        context: Sequence[Mapping[str, object]],
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        for item in context:
            role = item.get("role")
            content = item.get("content")
            if not isinstance(content, str):
                raise ProviderProtocolError("AgentLoop context content must be text")
            if role == "assistant":
                messages.append({"role": "assistant", "content": content})
            elif role == "tool":
                name = item.get("name")
                label = name if isinstance(name, str) else "tool"
                messages.append(
                    {
                        "role": "user",
                        "content": f"Observation from {label}:\n{content}",
                    }
                )
            elif role == "user":
                messages.append({"role": "user", "content": content})
            else:
                raise ProviderProtocolError(f"unsupported AgentLoop role: {role!r}")
        return messages


@dataclass(frozen=True)
class CommandExecution:
    exit_code: int
    stdout: bytes
    stderr: bytes
    timed_out: bool = False


class CommandRunner(Protocol):
    def run(self, command: str, *, timeout_seconds: float) -> CommandExecution: ...


@dataclass(frozen=True)
class CommandArtifact:
    sequence: int
    command_sha256: str
    stdout_path: Path
    stdout_sha256: str
    stderr_path: Path
    stderr_sha256: str
    exit_code: int
    timed_out: bool


class DockerExecRunner:
    """Execute one command in an already isolated SWE-bench container."""

    def __init__(self, container_name: str, *, workdir: str = "/testbed") -> None:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", container_name):
            raise ValueError("invalid Docker container name")
        if not workdir.startswith("/"):
            raise ValueError("Docker workdir must be absolute")
        self._container_name = container_name
        self._workdir = workdir

    def run(self, command: str, *, timeout_seconds: float) -> CommandExecution:
        try:
            completed = subprocess.run(
                (
                    "docker",
                    "exec",
                    "--workdir",
                    self._workdir,
                    self._container_name,
                    "timeout",
                    "--signal=TERM",
                    "--kill-after=5s",
                    f"{timeout_seconds}s",
                    "bash",
                    "-lc",
                    command,
                ),
                check=False,
                capture_output=True,
                timeout=timeout_seconds + 10,
            )
        except subprocess.TimeoutExpired as error:
            subprocess.run(
                ("docker", "kill", self._container_name),
                check=False,
                capture_output=True,
            )
            return CommandExecution(
                exit_code=124,
                stdout=_output_bytes(error.stdout),
                stderr=(
                    _output_bytes(error.stderr)
                    + b"\nhost timeout guard fired; container killed"
                ),
                timed_out=True,
            )
        if completed.returncode == 124:
            return CommandExecution(
                exit_code=124,
                stdout=completed.stdout,
                stderr=completed.stderr + b"\ncommand timed out; container retained",
                timed_out=True,
            )
        return CommandExecution(
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )


class DockerBashTool:
    """Bash-only ACI with bounded observations and lossless raw artifacts."""

    name = "bash"

    def __init__(
        self,
        *,
        runner: CommandRunner,
        artifact_root: Path,
        max_observation_bytes: int = 32_768,
        command_timeout_seconds: float = 120,
    ) -> None:
        if max_observation_bytes < 512:
            raise ValueError("observation limit must be at least 512 bytes")
        if command_timeout_seconds <= 0:
            raise ValueError("command timeout must be positive")
        self._runner = runner
        self._artifact_root = Path(artifact_root)
        self._max_observation_bytes = max_observation_bytes
        self._command_timeout_seconds = command_timeout_seconds
        self._artifacts: list[CommandArtifact] = []

    @property
    def artifacts(self) -> tuple[CommandArtifact, ...]:
        return tuple(self._artifacts)

    def execute(self, arguments: dict[str, object]) -> str:
        if set(arguments) != {"command"} or not isinstance(arguments.get("command"), str):
            raise ValueError("bash requires exactly one string command")
        command = cast(str, arguments["command"])
        if not command.strip():
            raise ValueError("bash command cannot be empty")
        execution = self._runner.run(
            command,
            timeout_seconds=self._command_timeout_seconds,
        )
        sequence = len(self._artifacts) + 1
        command_root = self._artifact_root / "commands"
        command_root.mkdir(parents=True, exist_ok=True)
        stdout_path = command_root / f"{sequence:04d}.stdout"
        stderr_path = command_root / f"{sequence:04d}.stderr"
        stdout_bytes = execution.stdout
        stderr_bytes = execution.stderr
        stdout_path.write_bytes(stdout_bytes)
        stderr_path.write_bytes(stderr_bytes)
        artifact = CommandArtifact(
            sequence=sequence,
            command_sha256=_sha256(command.encode("utf-8")),
            stdout_path=stdout_path,
            stdout_sha256=_sha256(stdout_bytes),
            stderr_path=stderr_path,
            stderr_sha256=_sha256(stderr_bytes),
            exit_code=execution.exit_code,
            timed_out=execution.timed_out,
        )
        self._artifacts.append(artifact)
        stream_limit = self._max_observation_bytes // 4
        while True:
            visible_stdout, stdout_truncated = _head_tail(
                execution.stdout,
                stream_limit,
            )
            visible_stderr, stderr_truncated = _head_tail(
                execution.stderr,
                stream_limit,
            )
            observation = {
                "exit_code": execution.exit_code,
                "timed_out": execution.timed_out,
                "stdout": visible_stdout,
                "stderr": visible_stderr,
                "stdout_truncated": stdout_truncated,
                "stderr_truncated": stderr_truncated,
                "raw_artifacts": {
                    "stdout": stdout_path.relative_to(self._artifact_root).as_posix(),
                    "stdout_sha256": artifact.stdout_sha256,
                    "stderr": stderr_path.relative_to(self._artifact_root).as_posix(),
                    "stderr_sha256": artifact.stderr_sha256,
                },
            }
            encoded = json.dumps(
                observation,
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")
            if len(encoded) <= self._max_observation_bytes:
                return encoded.decode("utf-8")
            if stream_limit == 0:
                raise RuntimeError("observation metadata exceeds the configured limit")
            excess = len(encoded) - self._max_observation_bytes
            stream_limit = max(0, stream_limit - max(1, excess // 2))


class SWEbenchDockerSession:
    """Disposable, no-network container for one SWE-bench agent run."""

    def __init__(self, *, image: str, run_label: str) -> None:
        if not image or not run_label:
            raise ValueError("Docker image and run label are required")
        safe_label = re.sub(r"[^a-z0-9_.-]+", "-", run_label.lower()).strip("-.")
        if not safe_label:
            raise ValueError("run label has no Docker-safe characters")
        self.image = image
        self.container_name = f"wah-{safe_label[:32]}-{uuid.uuid4().hex[:10]}"
        self._started = False

    def start(self) -> "SWEbenchDockerSession":
        completed = subprocess.run(
            (
                "docker",
                "create",
                "--platform",
                "linux/amd64",
                "--name",
                self.container_name,
                "--network",
                "none",
                "--cpus",
                "2",
                "--memory",
                "4g",
                "--pids-limit",
                "512",
                "--label",
                "workspace-agent-harness=react-mvp",
                "--entrypoint",
                "sleep",
                self.image,
                "infinity",
            ),
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            raise RuntimeError(f"Docker create failed: {completed.stderr.strip()}")
        started = subprocess.run(
            ("docker", "start", self.container_name),
            check=False,
            capture_output=True,
            text=True,
        )
        if started.returncode != 0:
            self.close()
            raise RuntimeError(f"Docker start failed: {started.stderr.strip()}")
        self._started = True
        return self

    def patch(self) -> str:
        if not self._started:
            raise RuntimeError("Docker session is not running")
        completed = subprocess.run(
            (
                "docker",
                "exec",
                "--workdir",
                "/testbed",
                self.container_name,
                "git",
                "diff",
                "--binary",
            ),
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            raise RuntimeError(f"patch extraction failed: {completed.stderr.strip()}")
        return completed.stdout

    def close(self) -> None:
        subprocess.run(
            ("docker", "rm", "-f", self.container_name),
            check=False,
            capture_output=True,
        )
        self._started = False

    def __enter__(self) -> "SWEbenchDockerSession":
        return self.start()

    def __exit__(self, *_: object) -> None:
        self.close()


@dataclass(frozen=True)
class ReactMvpRun:
    result: RunResult
    provider_calls: tuple[ProviderCallRecord, ...]
    command_artifacts: tuple[CommandArtifact, ...]


def run_react_mvp(
    *,
    task: Task,
    variant: AgentVariant,
    api_key: str,
    container_name: str,
    trace_path: Path,
    artifact_root: Path,
    limits: RunLimits,
) -> ReactMvpRun:
    model = DeepSeekJsonAdapter(api_key=api_key, variant=variant)
    bash = DockerBashTool(
        runner=DockerExecRunner(container_name),
        artifact_root=artifact_root,
    )
    result = AgentLoop(
        model=model,
        tools=(bash,),
        trace_path=trace_path,
    ).run(task, limits)
    return ReactMvpRun(
        result=result,
        provider_calls=model.calls,
        command_artifacts=bash.artifacts,
    )


def load_react_mvp_config(path: Path) -> Mapping[str, object]:
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("ReAct MVP configuration must be a JSON object")
    if value.get("schema") != "workspace-agent-harness/react-mvp/v1":
        raise ValueError("unsupported ReAct MVP configuration schema")
    declared_hash = value.get("content_hash")
    if not isinstance(declared_hash, str):
        raise ValueError("ReAct MVP configuration content_hash is required")
    material = dict(value)
    del material["content_hash"]
    actual_hash = "sha256:" + _sha256(_canonical_json(material))
    if declared_hash != actual_hash:
        raise ValueError("ReAct MVP configuration content hash mismatch")
    selection = value.get("selection")
    experiment = value.get("experiment")
    if not isinstance(selection, dict) or not isinstance(experiment, dict):
        raise ValueError("ReAct MVP selection and experiment objects are required")
    ids = selection.get("ordered_instance_ids")
    if not isinstance(ids, list) or len(ids) != 5 or len(set(ids)) != 5:
        raise ValueError("react-mvp-5 requires exactly five unique instances")
    images = selection.get("images_by_instance_id")
    if not isinstance(images, dict) or set(images) != set(ids):
        raise ValueError("each ReAct MVP instance requires exactly one Docker image")
    if any(
        not isinstance(image, str)
        or not image.startswith("swebench/sweb.eval.x86_64.")
        for image in images.values()
    ):
        raise ValueError("ReAct MVP Docker images must use official x86_64 eval tags")
    image_digests = selection.get("image_digests_by_instance_id")
    if not isinstance(image_digests, dict) or set(image_digests) != set(ids):
        raise ValueError("each ReAct MVP instance requires exactly one image digest")
    if any(
        not isinstance(digest, str)
        or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest)
        for digest in image_digests.values()
    ):
        raise ValueError("ReAct MVP image digests must be SHA-256 registry digests")
    if experiment.get("variants") != ["act-only", "react"]:
        raise ValueError("ReAct MVP variants must be act-only and react")
    if experiment.get("repetitions") != 3:
        raise ValueError("ReAct MVP requires exactly three repetitions")
    if experiment.get("run_limits") != {
        "max_steps": 30,
        "max_model_calls": 31,
        "timeout_seconds": 1800,
    }:
        raise ValueError("ReAct MVP run limits have drifted")
    return MappingProxyType(value)


def _validate_action_document(
    content: str,
    *,
    variant: AgentVariant,
    max_thought_chars: int,
) -> str:
    try:
        value = json.loads(content)
    except json.JSONDecodeError:
        raise ProviderProtocolError("provider content is not valid JSON") from None
    if not isinstance(value, dict):
        raise ProviderProtocolError("action document must be a JSON object")
    thought = value.get("thought")
    if variant is AgentVariant.ACT_ONLY:
        if "thought" in value:
            raise ProviderProtocolError("act-only response cannot contain thought")
    elif not isinstance(thought, str) or not thought.strip():
        raise ProviderProtocolError("ReAct response requires a non-empty thought")
    elif len(thought) > max_thought_chars:
        raise ProviderProtocolError("ReAct thought exceeds the configured limit")
    action_type = value.get("type")
    if action_type == "tool":
        allowed = {"type", "tool", "arguments"}
        if variant is AgentVariant.REACT:
            allowed.add("thought")
        if set(value) != allowed:
            raise ProviderProtocolError("tool action contains unexpected fields")
        if value.get("tool") != "bash":
            raise ProviderProtocolError("ReAct MVP permits only the bash tool")
        arguments = value.get("arguments")
        if not isinstance(arguments, dict) or set(arguments) != {"command"}:
            raise ProviderProtocolError("bash action requires exactly one command")
        if not isinstance(arguments.get("command"), str) or not arguments["command"].strip():
            raise ProviderProtocolError("bash command must be non-empty text")
    elif action_type == "final":
        allowed = {"type", "output"}
        if variant is AgentVariant.REACT:
            allowed.add("thought")
        if set(value) != allowed or not isinstance(value.get("output"), str):
            raise ProviderProtocolError("invalid final action")
    else:
        raise ProviderProtocolError(f"unknown action type: {action_type!r}")
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _provider_content(response: Mapping[str, object]) -> str:
    choices = response.get("choices")
    if not isinstance(choices, list) or len(choices) != 1:
        raise ProviderProtocolError("provider response requires exactly one choice")
    choice = choices[0]
    if not isinstance(choice, dict) or not isinstance(choice.get("message"), dict):
        raise ProviderProtocolError("provider choice is missing a message")
    message = cast(dict[str, object], choice["message"])
    content = message.get("content")
    if not isinstance(content, str):
        raise ProviderProtocolError("provider message content must be text")
    return content


def _provider_call_record(
    response: Mapping[str, object],
    request_index: int,
    requested_model: str,
) -> ProviderCallRecord:
    usage = response.get("usage")
    usage_value = usage if isinstance(usage, dict) else {}
    return ProviderCallRecord(
        request_index=request_index,
        model=str(response.get("model") or requested_model),
        system_fingerprint=(
            str(response["system_fingerprint"])
            if response.get("system_fingerprint") is not None
            else None
        ),
        usage=ProviderUsage(
            prompt_tokens=_optional_nonnegative_int(usage_value.get("prompt_tokens")),
            completion_tokens=_optional_nonnegative_int(
                usage_value.get("completion_tokens")
            ),
            total_tokens=_optional_nonnegative_int(usage_value.get("total_tokens")),
        ),
    )


def _optional_nonnegative_int(value: object) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ProviderProtocolError("provider usage fields must be non-negative integers")
    return value


def _head_tail(value: bytes, max_bytes: int) -> tuple[str, bool]:
    if len(value) <= max_bytes:
        return value.decode("utf-8", errors="replace"), False
    marker = b"\n...<observation truncated; full output retained as artifact>...\n"
    if max_bytes <= len(marker):
        return marker[:max_bytes].decode("ascii", errors="ignore"), True
    available = max(0, max_bytes - len(marker))
    head_size = available // 2
    tail_size = available - head_size
    visible = value[:head_size] + marker + value[len(value) - tail_size :]
    return visible.decode("utf-8", errors="replace"), True


def _output_bytes(value: bytes | str | None) -> bytes:
    if value is None:
        return b""
    if isinstance(value, str):
        return value.encode("utf-8")
    return value


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


__all__ = [
    "AgentVariant",
    "CommandArtifact",
    "CommandExecution",
    "DeepSeekJsonAdapter",
    "DockerBashTool",
    "DockerExecRunner",
    "ProviderCallRecord",
    "ProviderProtocolError",
    "ProviderUsage",
    "ReactMvpRun",
    "SWEbenchDockerSession",
    "UrllibJsonTransport",
    "load_react_mvp_config",
    "run_react_mvp",
]
