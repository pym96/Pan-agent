"""Independent Regulator negative probes for the ReAct MVP 30-slot backlog.

Authored by the independent Regulator session reviewing the 2026-08-20..23
ReAct MVP backlog (sixth review). These probes cover surfaces not exercised by
the Working Agent's own tests: summary-slot identity tampering, frozen-config
byte drift, and extra protocol-contract rejections. They are
development-governance Evidence, not Learning Wiki knowledge objects.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from workspace_agent_harness.react_mvp import (  # noqa: E402
    AgentVariant,
    ProviderProtocolError,
    _validate_action_document,
    load_react_mvp_config,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = (
    PROJECT_ROOT / "workspace_agent_harness" / "benchmark_configs" / "react-mvp-5-v1.json"
)
RUN_ROOT = PROJECT_ROOT / ".runs" / "react-mvp-5"
SUMMARIZE = PROJECT_ROOT / "scripts" / "summarize_react_mvp.py"


@unittest.skipUnless(RUN_ROOT.is_dir(), "raw react-mvp-5 run artifacts are local-only")
class SummaryTamperProbeTest(unittest.TestCase):
    def _summarize(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SUMMARIZE), "--run-root", str(root)],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
        )

    def test_tampered_slot_instance_id_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory) / "react-mvp-5"
            shutil.copytree(RUN_ROOT, copied)
            attempt = copied / "sqlfluff-2419-act-only-r2" / "attempt.json"
            payload = json.loads(attempt.read_text(encoding="utf-8"))
            payload["instance_id"] = "sqlfluff__sqlfluff-9999"
            attempt.write_text(json.dumps(payload), encoding="utf-8")
            result = self._summarize(copied)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("does not match frozen slot", result.stderr)

    def test_tampered_slot_config_hash_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            copied = Path(directory) / "react-mvp-5"
            shutil.copytree(RUN_ROOT, copied)
            attempt = copied / "sqlfluff-2419-act-only-r2" / "attempt.json"
            payload = json.loads(attempt.read_text(encoding="utf-8"))
            payload["config_hash"] = "sha256:" + "0" * 64
            attempt.write_text(json.dumps(payload), encoding="utf-8")
            result = self._summarize(copied)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("does not match frozen slot", result.stderr)


class ProtocolContractProbeTest(unittest.TestCase):
    def test_extra_field_in_action_is_rejected(self) -> None:
        with self.assertRaises(ProviderProtocolError):
            _validate_action_document(
                '{"type":"tool","tool":"bash","arguments":{"command":"ls"},'
                '"thought":"ok","extra":1}',
                variant=AgentVariant.REACT,
                max_thought_chars=1_000,
            )

    def test_non_bash_tool_is_rejected(self) -> None:
        with self.assertRaises(ProviderProtocolError):
            _validate_action_document(
                '{"type":"tool","tool":"python","arguments":{"command":"ls"},'
                '"thought":"ok"}',
                variant=AgentVariant.REACT,
                max_thought_chars=1_000,
            )

    def test_config_byte_drift_fails_closed(self) -> None:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        config["experiment"]["repetitions"] = 4
        with tempfile.TemporaryDirectory() as directory:
            drifted = Path(directory) / "react-mvp-5-v1.json"
            drifted.write_text(json.dumps(config, ensure_ascii=False, indent=2))
            with self.assertRaisesRegex(ValueError, "content hash mismatch"):
                load_react_mvp_config(drifted)


if __name__ == "__main__":
    unittest.main()
