"""Independent Regulator negative probes for the protocol-reliability backlog.

Authored by the independent Regulator session reviewing the 2026-08-23/24
protocol-reliability-v1 and max-token-sensitivity backlog (seventh/eighth
review). Loader-level fail-closed probes that do not depend on local-only
`.runs/` artifacts; the large raw-body reassessment behind them is recorded in
`80-监管与验收/当前审查/Regulator-20260824-协议可靠性验收.md`.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from workspace_agent_harness.protocol_reliability import (  # noqa: E402
    load_protocol_config,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG = (
    PROJECT_ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "protocol-reliability-v1.json"
)
CORPUS = (
    PROJECT_ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "protocol-reliability-v1-contexts.json"
)


class ProtocolLockProbeTest(unittest.TestCase):
    def test_config_byte_drift_fails_closed(self) -> None:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        config["experiment"]["repetitions"] = 6
        with tempfile.TemporaryDirectory() as directory:
            drifted = Path(directory) / "config.json"
            drifted.write_text(json.dumps(config), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "content hash mismatch"):
                load_protocol_config(drifted, CORPUS)

    def test_corpus_drift_breaks_config_binding(self) -> None:
        corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
        corpus["contexts"][0]["cohort"] = "control"
        with tempfile.TemporaryDirectory() as directory:
            drifted = Path(directory) / "corpus.json"
            drifted.write_text(json.dumps(corpus), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "hash"):
                load_protocol_config(CONFIG, drifted)

    def test_forged_corpus_pointer_fails_closed(self) -> None:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        config["context_corpus_hash"] = "sha256:" + "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            forged = Path(directory) / "config.json"
            forged.write_text(json.dumps(config), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "hash"):
                load_protocol_config(forged, CORPUS)


if __name__ == "__main__":
    unittest.main()
