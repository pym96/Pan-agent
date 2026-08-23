from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from typing import Mapping
from unittest.mock import call, patch

from workspace_agent_harness import AgentLoop, RunLimits, RunStatus, Task
from workspace_agent_harness.react_mvp import (
    AgentVariant,
    CommandExecution,
    DeepSeekJsonAdapter,
    DockerBashTool,
    DockerExecRunner,
    ProviderProtocolError,
    load_react_mvp_config,
)


class RecordingTransport:
    def __init__(self, contents: list[str]) -> None:
        self._contents = iter(contents)
        self.requests: list[dict[str, object]] = []

    def post_json(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> Mapping[str, object]:
        self.requests.append(
            {
                "url": url,
                "headers": dict(headers),
                "payload": dict(payload),
                "timeout_seconds": timeout_seconds,
            }
        )
        request_index = len(self.requests)
        return {
            "model": "deepseek-v4-flash",
            "system_fingerprint": "fp-test",
            "choices": [{"message": {"content": next(self._contents)}}],
            "usage": {
                "prompt_tokens": 10 * request_index,
                "completion_tokens": 5,
                "total_tokens": 10 * request_index + 5,
            },
        }


class FakeCommandRunner:
    def __init__(self, executions: list[CommandExecution]) -> None:
        self._executions = iter(executions)
        self.commands: list[tuple[str, float]] = []

    def run(self, command: str, *, timeout_seconds: float) -> CommandExecution:
        self.commands.append((command, timeout_seconds))
        return next(self._executions)


class ReactMvpContractTest(unittest.TestCase):
    def test_adapter_locks_nonthinking_json_and_excludes_secret_from_identity(self) -> None:
        secret = "deepseek-secret-must-never-enter-identity"
        transport = RecordingTransport(
            ['{"type":"final","output":"done"}']
        )
        adapter = DeepSeekJsonAdapter(
            api_key=secret,
            variant=AgentVariant.ACT_ONLY,
            transport=transport,
        )

        response = adapter.respond(({"role": "user", "content": "repair"},))

        request = transport.requests[0]
        payload = request["payload"]
        self.assertIsInstance(payload, dict)
        assert isinstance(payload, dict)
        self.assertEqual("deepseek-v4-flash", payload["model"])
        self.assertEqual({"type": "disabled"}, payload["thinking"])
        self.assertEqual({"type": "json_object"}, payload["response_format"])
        self.assertEqual(0, payload["temperature"])
        self.assertEqual(
            "Bearer " + secret,
            request["headers"]["Authorization"],  # type: ignore[index]
        )
        self.assertNotIn(secret, json.dumps(adapter.identity_material()))
        self.assertEqual('{"output":"done","type":"final"}', response)
        self.assertEqual(15, adapter.calls[0].usage.total_tokens)

    def test_act_only_rejects_visible_thought(self) -> None:
        adapter = DeepSeekJsonAdapter(
            api_key="secret",
            variant=AgentVariant.ACT_ONLY,
            transport=RecordingTransport(
                ['{"thought":"plan","type":"final","output":"done"}']
            ),
        )

        with self.assertRaisesRegex(
            ProviderProtocolError,
            "act-only response cannot contain thought",
        ):
            adapter.respond(({"role": "user", "content": "repair"},))

        self.assertEqual(1, len(adapter.calls))
        self.assertEqual(15, adapter.calls[0].usage.total_tokens)

    def test_react_requires_bounded_thought_and_only_bash(self) -> None:
        missing_thought = DeepSeekJsonAdapter(
            api_key="secret",
            variant=AgentVariant.REACT,
            transport=RecordingTransport(
                ['{"type":"tool","tool":"bash","arguments":{"command":"pwd"}}']
            ),
        )
        with self.assertRaisesRegex(ProviderProtocolError, "requires a non-empty thought"):
            missing_thought.respond(({"role": "user", "content": "repair"},))

        wrong_tool = DeepSeekJsonAdapter(
            api_key="secret",
            variant=AgentVariant.REACT,
            transport=RecordingTransport(
                [
                    '{"thought":"inspect","type":"tool","tool":"search",'
                    '"arguments":{"command":"pwd"}}'
                ]
            ),
        )
        with self.assertRaisesRegex(ProviderProtocolError, "only the bash tool"):
            wrong_tool.respond(({"role": "user", "content": "repair"},))

    def test_react_uses_existing_agent_loop_and_observation_changes_next_request(self) -> None:
        transport = RecordingTransport(
            [
                '{"thought":"inspect first","type":"tool","tool":"bash",'
                '"arguments":{"command":"pwd"}}',
                '{"thought":"the observation is enough","type":"final",'
                '"output":"done"}',
            ]
        )
        adapter = DeepSeekJsonAdapter(
            api_key="secret",
            variant=AgentVariant.REACT,
            transport=transport,
        )
        runner = FakeCommandRunner([CommandExecution(0, b"/testbed\n", b"")])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bash = DockerBashTool(
                runner=runner,
                artifact_root=root / "artifacts",
            )
            result = AgentLoop(
                model=adapter,
                tools=(bash,),
                trace_path=root / "trace.jsonl",
            ).run(
                Task("react-loop", "repair the repository"),
                RunLimits(3, 3, 30),
            )
            trace = (root / "trace.jsonl").read_text(encoding="utf-8")

        self.assertIs(RunStatus.SUCCEEDED, result.status)
        self.assertEqual("done", result.output)
        self.assertEqual([("pwd", 120)], runner.commands)
        self.assertIn("inspect first", trace)
        second_messages = transport.requests[1]["payload"]["messages"]  # type: ignore[index]
        self.assertIn("Observation from bash", json.dumps(second_messages))
        self.assertIn("/testbed", json.dumps(second_messages))

    def test_observation_is_bounded_while_raw_streams_remain_lossless(self) -> None:
        stdout = b"start-" + b"x" * 4_000 + b"\xff-end"
        stderr = b"warning-" + b"y" * 2_000 + b"\xfe-tail"
        runner = FakeCommandRunner([CommandExecution(7, stdout, stderr)])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bash = DockerBashTool(
                runner=runner,
                artifact_root=root,
                max_observation_bytes=1_024,
                command_timeout_seconds=9,
            )

            serialized = bash.execute({"command": "failing-test"})
            visible = json.loads(serialized)
            artifact = bash.artifacts[0]

            self.assertEqual(stdout, artifact.stdout_path.read_bytes())
            self.assertEqual(stderr, artifact.stderr_path.read_bytes())

        self.assertEqual([("failing-test", 9)], runner.commands)
        self.assertEqual(7, visible["exit_code"])
        self.assertTrue(visible["stdout_truncated"])
        self.assertTrue(visible["stderr_truncated"])
        self.assertIn("start-", visible["stdout"])
        self.assertIn("-end", visible["stdout"])
        self.assertIn("observation truncated", visible["stdout"])
        self.assertLessEqual(len(serialized.encode("utf-8")), 1_024)
        self.assertEqual(64, len(visible["raw_artifacts"]["stdout_sha256"]))

    @patch("workspace_agent_harness.react_mvp.subprocess.run")
    def test_docker_command_timeout_retains_container_for_patch_extraction(
        self,
        run: unittest.mock.Mock,
    ) -> None:
        run.return_value = subprocess.CompletedProcess(
            args=(),
            returncode=124,
            stdout=b"partial",
            stderr=b"",
        )

        result = DockerExecRunner("safe-container").run(
            "pytest -q",
            timeout_seconds=7,
        )

        self.assertTrue(result.timed_out)
        self.assertEqual(124, result.exit_code)
        self.assertIn(b"container retained", result.stderr)
        self.assertEqual(1, run.call_count)
        command = run.call_args.args[0]
        self.assertEqual("timeout", command[5])
        self.assertIn("7s", command)
        self.assertEqual(17, run.call_args.kwargs["timeout"])

    @patch("workspace_agent_harness.react_mvp.subprocess.run")
    def test_docker_host_timeout_guard_kills_container(
        self,
        run: unittest.mock.Mock,
    ) -> None:
        timeout_error = subprocess.TimeoutExpired(cmd=("docker", "exec"), timeout=17)
        run.side_effect = [
            timeout_error,
            subprocess.CompletedProcess(args=(), returncode=0, stdout=b"", stderr=b""),
        ]

        result = DockerExecRunner("safe-container").run(
            "pytest -q",
            timeout_seconds=7,
        )

        self.assertTrue(result.timed_out)
        self.assertIn(b"host timeout guard fired", result.stderr)
        self.assertEqual(
            call(
                ("docker", "kill", "safe-container"),
                check=False,
                capture_output=True,
            ),
            run.call_args_list[1],
        )

    def test_frozen_react_mvp_5_configuration_rejects_drift(self) -> None:
        config_path = (
            Path(__file__).parents[1]
            / "workspace_agent_harness"
            / "benchmark_configs"
            / "react-mvp-5-v1.json"
        )
        loaded = load_react_mvp_config(config_path)
        self.assertEqual("react-mvp-5", loaded["suite_id"])
        self.assertEqual("SWE-bench/SWE-bench_Lite", loaded["source"]["dataset"])  # type: ignore[index]
        self.assertEqual("dev", loaded["source"]["split"])  # type: ignore[index]
        self.assertEqual(5, len(loaded["selection"]["ordered_instance_ids"]))  # type: ignore[index]
        self.assertEqual(
            set(loaded["selection"]["ordered_instance_ids"]),  # type: ignore[index]
            set(loaded["selection"]["images_by_instance_id"]),  # type: ignore[index]
        )
        self.assertEqual(
            set(loaded["selection"]["ordered_instance_ids"]),  # type: ignore[index]
            set(loaded["selection"]["image_digests_by_instance_id"]),  # type: ignore[index]
        )
        self.assertEqual(30, loaded["experiment"]["run_limits"]["max_steps"])  # type: ignore[index]

        drifted = json.loads(config_path.read_text(encoding="utf-8"))
        drifted["experiment"]["repetitions"] = 1
        with tempfile.TemporaryDirectory() as temporary:
            drifted_path = Path(temporary) / "react-mvp-5.json"
            drifted_path.write_text(json.dumps(drifted), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "content hash mismatch"):
                load_react_mvp_config(drifted_path)


if __name__ == "__main__":
    unittest.main()
