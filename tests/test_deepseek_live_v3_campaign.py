from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from workspace_agent_harness.deepseek_live import (
    DeepSeekLiveTranslationAdapter,
    DeepSeekToolBinding,
    locked_deepseek_model_profile,
    locked_deepseek_v3_model_profile,
)
from workspace_agent_harness.behavioral_eval import load_behavioral_eval_manifest
from workspace_agent_harness.deepseek_live_campaign import (
    V3_BUDGETED_RUNNER_IDENTITY,
    V3_LIVE_ENTRY_IDENTITY,
    build_v3_zero_call_dry_run,
    load_deepseek_live_eval_lock,
    load_deepseek_live_eval_v3_lock,
)
from workspace_agent_harness.translation import identity_sha256
from workspace_agent_harness.deepseek_live_runner import required_live_acknowledgement


ROOT = Path(__file__).parents[1]
V2_LOCK_PATH = (
    ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "deepseek-live-behavioral-eval-v0.json"
)
V3_LOCK_PATH = (
    ROOT
    / "workspace_agent_harness"
    / "benchmark_configs"
    / "deepseek-live-behavioral-eval-v3.json"
)
V3_ENTRY = ROOT / "scripts" / "run_deepseek_live_behavioral_eval_v3.py"


class DeepSeekLiveV3CampaignTest(unittest.TestCase):
    def test_v3_lock_versions_only_changed_contract_and_keeps_exact_denominator(self) -> None:
        v2 = load_deepseek_live_eval_lock()
        v3 = load_deepseek_live_eval_v3_lock()
        dry_run = build_v3_zero_call_dry_run(lock=v3)

        self.assertEqual(120, len(v3.slots))
        self.assertEqual(600, v3.maximum_paid_model_calls)
        self.assertEqual("15.00", v3.maximum_campaign_cost_cny)
        self.assertEqual(v2.identity, v3.parent_stage_a_lock_identity)
        self.assertEqual(V3_BUDGETED_RUNNER_IDENTITY, v3.runner_identity)
        self.assertEqual(V3_LIVE_ENTRY_IDENTITY, v3.live_entry_identity)
        self.assertNotEqual(v2.identity, v3.identity)
        self.assertNotEqual(v2.schedule_identity, v3.schedule_identity)
        self.assertEqual(
            [
                (
                    slot.sequence,
                    slot.slot_id,
                    slot.case_id,
                    slot.loop_policy_id,
                    slot.repetition,
                    slot.maximum_model_exchanges,
                    slot.context_policy_identity,
                )
                for slot in v2.slots
            ],
            [
                (
                    slot.sequence,
                    slot.slot_id,
                    slot.case_id,
                    slot.loop_policy_id,
                    slot.repetition,
                    slot.maximum_model_exchanges,
                    slot.context_policy_identity,
                )
                for slot in v3.slots
            ],
        )
        self.assertTrue(
            all(left.translation_identity != right.translation_identity for left, right in zip(v2.slots, v3.slots))
        )
        self.assertEqual(120, dry_run["planned_slots"])
        self.assertEqual(0, dry_run["formal_runs_started"])
        self.assertEqual(0, dry_run["live_model_calls"])
        self.assertEqual(0, dry_run["balance_queries"])
        self.assertEqual("0", dry_run["cost_cny"])
        self.assertIsNone(dry_run["causal_result"])
        self.assertEqual(
            locked_deepseek_v3_model_profile().identity,
            dry_run["model_profile_identity"],
        )

    def test_v3_lineage_and_retained_fixture_files_are_hash_bound(self) -> None:
        lock = load_deepseek_live_eval_v3_lock()
        document = json.loads(V3_LOCK_PATH.read_text(encoding="utf-8"))
        lineage = document["lineage"]

        self.assertEqual(
            "1b4e978de901c48901c7429ea39fc696463c441a5cd346922631290e9e868520",
            lineage["accepted_v2"]["terminal_evidence_sha256"],
        )
        self.assertEqual(
            "b4ed702ea7caa16ccdcd038a8703d5970e17aa35eac6e2d578632d2fbb5558aa",
            lineage["provider_learning"]["artifact_sha256"],
        )
        self.assertEqual(
            "e7da6099c4628054db2afcac40c2fb36307f11db12df17d67726e787fbd691f2",
            document["v3_fixture_manifest_sha256"],
        )
        case = load_behavioral_eval_manifest().case("SA-01")
        bindings = tuple(
            DeepSeekToolBinding(
                runtime_tool=definition.action_tool,
                provider_parameters=definition.parameters,
            )
            for definition in case.tools
        )
        expected_translation = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_v3_model_profile(), tool_bindings=bindings
        ).identity
        selected_slot = next(slot for slot in lock.slots if slot.case_id == case.case_id)
        self.assertEqual(expected_translation, selected_slot.translation_identity)

    def test_v2_files_and_identities_remain_byte_stable(self) -> None:
        self.assertEqual(
            "1e225f5d1d053e4df8811b560fbb723563918ab15e3afdf6b67abf60d9491695",
            hashlib.sha256(V2_LOCK_PATH.read_bytes()).hexdigest(),
        )
        self.assertEqual(
            "07ff9635eacbfbaac883f88d248286165ef515edbf2d268d99e05b5ce2b04cd3",
            hashlib.sha256(
                (ROOT / "scripts" / "run_deepseek_live_behavioral_eval.py").read_bytes()
            ).hexdigest(),
        )
        v2 = load_deepseek_live_eval_lock()
        self.assertEqual(
            "sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25",
            v2.identity,
        )
        self.assertEqual(
            "sha256:ba5c11e1ca3a968970d4a04df0b228115d4daac952a6511f133229dee79d2284",
            v2.schedule_identity,
        )
        self.assertEqual(
            "sha256:9bcb9f358dc6f106f93d455c4961ace1131715bf11ed2410686ab7c11cd015f8",
            locked_deepseek_model_profile().identity,
        )

    def test_v3_lock_rejects_semantic_drift_even_with_recomputed_content_hash(self) -> None:
        document = json.loads(V3_LOCK_PATH.read_text(encoding="utf-8"))
        document["provider"]["wire_tool_choice_key"] = "auto"
        material = dict(document)
        material.pop("content_hash")
        document["content_hash"] = identity_sha256(material)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tampered-v3.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "identity drift"):
                load_deepseek_live_eval_v3_lock(path)

    def test_v3_preview_is_byte_deterministic_and_makes_zero_external_calls(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.json"
            second = Path(directory) / "second.json"
            environment = {"PYTHONPATH": str(ROOT)}
            outputs = []
            for target in (first, second):
                completed = subprocess.run(
                    [sys.executable, str(V3_ENTRY), "--output", str(target)],
                    cwd=ROOT,
                    env=environment,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                outputs.append(completed.stdout)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertIn("formal_runs_started=0", outputs[0])
            self.assertIn("balance_queries=0", outputs[0])
            self.assertIn("live_model_calls=0", outputs[0])
            self.assertIn("cost=CNY 0", outputs[0])

    def test_v3_entry_rejects_v2_acknowledgement_before_credential_or_network_boundary(self) -> None:
        old_acknowledgement = required_live_acknowledgement(
            load_deepseek_live_eval_lock()
        )
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "must-not-exist"
            environment = {
                "PYTHONPATH": str(ROOT),
                "DEEPSEEK_API_KEY": "must-not-be-read",
            }
            completed = subprocess.run(
                [
                    sys.executable,
                    str(V3_ENTRY),
                    "--output",
                    str(target),
                    "--live",
                    "--acknowledgement",
                    old_acknowledgement,
                ],
                cwd=ROOT,
                env=environment,
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(2, completed.returncode)
        self.assertIn("exact v3 lock/runner/entry acknowledgement", completed.stderr)
        self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
