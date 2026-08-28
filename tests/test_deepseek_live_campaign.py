from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from workspace_agent_harness.behavioral_eval import (
    BehavioralEvalCampaign,
    EvaluatorVerdict,
    load_behavioral_eval_manifest,
)
from workspace_agent_harness.deepseek_live_campaign import (
    ACT_ONCE_POLICY_ID,
    BalanceReceipt,
    BudgetStop,
    CampaignBudgetMeter,
    DeepSeekHttpBalanceClient,
    FileDeepSeekBalanceStore,
    FileLiveCampaignStore,
    OBSERVATION_FEEDBACK_POLICY_ID,
    build_zero_call_dry_run,
    deepseek_live_context_policy,
    deepseek_live_context_policy_identity,
    load_deepseek_live_eval_lock,
    reconstruct_slot_inventory,
)
from workspace_agent_harness.evented import ExchangeUsage
from workspace_agent_harness.evented import EventedRunStatus, load_run_event_log


ROOT = Path(__file__).parents[1]


class DeepSeekLiveCampaignLockTest(unittest.TestCase):
    def test_frozen_lock_builds_exact_paired_120_slot_zero_call_plan(self) -> None:
        manifest_path = (
            ROOT
            / "workspace_agent_harness"
            / "benchmark_configs"
            / "agent-loop-behavioral-eval-v0.json"
        )
        fixture_manifest = ROOT / "tests" / "fixtures" / "translation" / "manifest.json"
        manifest_before = manifest_path.read_bytes()
        fixtures_before = fixture_manifest.read_bytes()

        lock = load_deepseek_live_eval_lock()
        dry_run = build_zero_call_dry_run(lock=lock)

        self.assertEqual(120, len(lock.slots))
        self.assertEqual(120, dry_run["planned_slots"])
        self.assertEqual(0, dry_run["live_model_calls"])
        self.assertEqual(600, dry_run["maximum_paid_model_calls"])
        self.assertEqual(
            {
                "input_tokens": 369_600_000,
                "output_tokens": 230_400_000,
                "combined_tokens": 600_000_000,
            },
            dry_run["formal_token_envelope"],
        )
        self.assertEqual("15.00", dry_run["maximum_campaign_cost_cny"])
        self.assertEqual(
            {ACT_ONCE_POLICY_ID: 60, OBSERVATION_FEEDBACK_POLICY_ID: 60},
            dry_run["slots_per_arm"],
        )
        self.assertEqual(
            tuple(case.case_id for case in load_behavioral_eval_manifest().cases),
            tuple(dict.fromkeys(slot.case_id for slot in lock.slots)),
        )
        for offset in range(0, len(lock.slots), 2):
            left, right = lock.slots[offset : offset + 2]
            self.assertEqual((left.case_id, left.repetition), (right.case_id, right.repetition))
            self.assertEqual(
                {ACT_ONCE_POLICY_ID, OBSERVATION_FEEDBACK_POLICY_ID},
                {left.loop_policy_id, right.loop_policy_id},
            )
            expected_first = (
                ACT_ONCE_POLICY_ID
                if int(
                    hashlib.sha256(
                        (
                            f"{lock.suite_id}\0{left.case_id}\0{left.repetition}"
                        ).encode()
                    ).hexdigest(),
                    16,
                )
                & 1
                == 0
                else OBSERVATION_FEEDBACK_POLICY_ID
            )
            self.assertEqual(expected_first, left.loop_policy_id)
        self.assertEqual(manifest_before, manifest_path.read_bytes())
        self.assertEqual(fixtures_before, fixture_manifest.read_bytes())
        self.assertEqual(
            "90f8bae80e5f4afa4fa7fb5a077709437c2f9c8b15791a1ae072a6c3864ff5a6",
            dry_run["behavioral_manifest_file_sha256"],
        )
        self.assertEqual(
            "795780729dfe38c07ca9b26d987331087076406b590474b0ac7c5a87df204133",
            dry_run["historical_translation_fixture_manifest_sha256"],
        )
        case = load_behavioral_eval_manifest().case("DO-02")
        policy = deepseek_live_context_policy(
            tuple(definition.action_tool for definition in case.tools)
        )
        self.assertEqual(1_000_000, policy.verified_context_window)
        self.assertEqual(384_000, policy.requested_output_room)
        self.assertEqual(
            deepseek_live_context_policy_identity(
                tuple(definition.action_tool for definition in case.tools)
            ),
            next(slot.context_policy_identity for slot in lock.slots if slot.case_id == "DO-02"),
        )

    def test_lock_rejects_byte_drift_even_if_internal_hash_is_recomputed(self) -> None:
        source = (
            ROOT
            / "workspace_agent_harness"
            / "benchmark_configs"
            / "deepseek-live-behavioral-eval-v0.json"
        )
        document = json.loads(source.read_text(encoding="utf-8"))
        document["budget"]["maximum_paid_model_calls"] = 599
        material = dict(document)
        material.pop("content_hash")
        document["content_hash"] = "sha256:" + hashlib.sha256(
            json.dumps(
                material,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
        ).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "drift.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "identity drift"):
                load_deepseek_live_eval_lock(path)

    def test_budget_meter_requires_bounded_balance_and_post_call_receipts(self) -> None:
        lock = load_deepseek_live_eval_lock()
        excessive = _BalanceClient((BalanceReceipt.available_cny("15.01", "initial-high"),))
        excessive_meter = CampaignBudgetMeter(lock=lock, balance_client=excessive)
        with self.assertRaisesRegex(BudgetStop, "initial_balance_outside_authorization"):
            excessive_meter.preflight()
        self.assertEqual(0, excessive_meter.model_calls)

        balance_client = _BalanceClient(
            (
                BalanceReceipt.available_cny("10.00", "initial"),
                BalanceReceipt.available_cny("9.999", "after-1"),
                BalanceReceipt.unavailable("after-2-unavailable"),
            )
        )
        meter = CampaignBudgetMeter(lock=lock, balance_client=balance_client)
        meter.preflight()
        meter.begin_slot(lock.slots[0])
        meter.authorize_model_call()
        meter.record_model_call(
            usage=ExchangeUsage(input_tokens=100, output_tokens=20, total_tokens=120),
            returned_model="DeepSeek-V4-Flash-0731",
            system_fingerprint="fp-one",
        )
        self.assertEqual(1, meter.model_calls)
        self.assertEqual(Decimal("0.001"), meter.spent_cny)
        meter.authorize_model_call()
        with self.assertRaisesRegex(BudgetStop, "balance_unavailable"):
            meter.record_model_call(
                usage=ExchangeUsage(input_tokens=100, output_tokens=20, total_tokens=120),
                returned_model="DeepSeek-V4-Flash-0731",
                system_fingerprint="fp-one",
            )
        self.assertEqual(2, meter.model_calls)
        with self.assertRaises(BudgetStop):
            meter.authorize_model_call()
        self.assertEqual(3, balance_client.queries)

        concurrent = _BalanceClient(
            (
                BalanceReceipt.available_cny("10.00", "concurrent-initial"),
                BalanceReceipt.available_cny("9.50", "concurrent-after"),
            )
        )
        concurrent_meter = CampaignBudgetMeter(lock=lock, balance_client=concurrent)
        concurrent_meter.preflight()
        concurrent_meter.begin_slot(lock.slots[0])
        concurrent_meter.authorize_model_call()
        with self.assertRaisesRegex(
            BudgetStop,
            "balance_concurrent_use_or_pricing_drift",
        ):
            concurrent_meter.record_model_call(
                usage=ExchangeUsage(input_tokens=100, output_tokens=20, total_tokens=120),
                returned_model="DeepSeek-V4-Flash-0731",
                system_fingerprint="fp-one",
            )

    def test_balance_http_adapter_parses_exact_cny_receipt_without_network(self) -> None:
        body = json.dumps(
            {
                "is_available": True,
                "balance_infos": [
                    {
                        "currency": "CNY",
                        "total_balance": "10.25",
                        "granted_balance": "0.25",
                        "topped_up_balance": "10.00",
                    }
                ],
            },
            sort_keys=True,
        ).encode()
        opener = _FakeBalanceUrlOpen(body)
        credential = "stage-b-only-secret"
        with tempfile.TemporaryDirectory() as directory:
            store_root = Path(directory) / "balance-responses"
            client = DeepSeekHttpBalanceClient(
                api_key=credential,
                urlopen=opener,
                response_store=FileDeepSeekBalanceStore(store_root),
            )

            self.assertEqual(0, opener.calls)
            receipt = client.query_balance()
            retained_body = (
                store_root / "balance-001" / "response.body"
            ).read_bytes()

        self.assertEqual(1, opener.calls)
        self.assertEqual(body, retained_body)
        self.assertEqual(Decimal("10.25"), receipt.cny_total)
        self.assertEqual("sha256:" + hashlib.sha256(body).hexdigest(), receipt.response_identity)
        self.assertEqual(
            f"Bearer {credential}",
            opener.request.get_header("Authorization"),
        )
        self.assertNotIn(credential, json.dumps(receipt.identity_material()))

    def test_budget_meter_counts_input_once_and_stops_on_identity_drift(self) -> None:
        lock = load_deepseek_live_eval_lock()
        client = _BalanceClient(
            (
                BalanceReceipt.available_cny("10.00", "initial"),
                BalanceReceipt.available_cny("9.9999", "after-1"),
                BalanceReceipt.available_cny("9.9998", "after-2"),
            )
        )
        meter = CampaignBudgetMeter(lock=lock, balance_client=client)
        meter.preflight()
        meter.begin_slot(lock.slots[0])
        meter.authorize_model_call()
        meter.record_model_call(
            usage=ExchangeUsage(input_tokens=100, output_tokens=20, total_tokens=120),
            returned_model="DeepSeek-V4-Flash-0731",
            system_fingerprint="fp-one",
        )
        self.assertEqual((100, 20, 120), meter.token_totals)

        meter.authorize_model_call()
        with self.assertRaisesRegex(BudgetStop, "returned_model_drift"):
            meter.record_model_call(
                usage=ExchangeUsage(input_tokens=50, output_tokens=10, total_tokens=60),
                returned_model="DeepSeek-V4-Flash-0801",
                system_fingerprint="fp-one",
            )

    def test_budget_meter_stops_on_per_call_token_ceiling(self) -> None:
        lock = load_deepseek_live_eval_lock()
        client = _BalanceClient(
            (
                BalanceReceipt.available_cny("10.00", "initial"),
                BalanceReceipt.available_cny("9.99", "after-1"),
            )
        )
        meter = CampaignBudgetMeter(lock=lock, balance_client=client)
        meter.preflight()
        meter.begin_slot(lock.slots[0])
        meter.authorize_model_call()

        with self.assertRaisesRegex(BudgetStop, "model_call_token_ceiling_exceeded"):
            meter.record_model_call(
                usage=ExchangeUsage(
                    input_tokens=616_001,
                    output_tokens=1,
                    total_tokens=616_002,
                ),
                returned_model="DeepSeek-V4-Flash-0731",
                system_fingerprint="fp-one",
            )

    def test_act_once_retains_first_tool_result_then_stops_without_feedback_call(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = BehavioralEvalCampaign(
                manifest=load_behavioral_eval_manifest(),
                artifacts_root=root,
                loop_policy_id=ACT_ONCE_POLICY_ID,
            ).run(case_ids=("IA-01",))
            events = load_run_event_log(root / report.cases[0].event_log_ref)

        result = report.cases[0]
        self.assertEqual(EventedRunStatus.LOOP_POLICY_STOP, result.runtime_status)
        self.assertEqual(1, result.model_calls)
        self.assertEqual(("inspect_beacon",), result.tool_sequence)
        self.assertEqual(EvaluatorVerdict.FAILED, result.evaluator_verdict)
        self.assertEqual(ACT_ONCE_POLICY_ID, events[0].payload["loop_policy_id"])

    def test_reconstruction_keeps_completed_failed_skipped_and_missing_slots(self) -> None:
        lock = load_deepseek_live_eval_lock()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "campaign"
            store = FileLiveCampaignStore(root=root, lock=lock)
            store.begin_slot(lock.slots[0])
            store.settle_slot(
                lock.slots[0],
                state="completed",
                event_log_ref="runs/first.jsonl",
                failure_category=None,
            )
            store.begin_slot(lock.slots[1])
            store.settle_slot(
                lock.slots[1],
                state="failed",
                event_log_ref="runs/second.jsonl",
                failure_category="protocol.failure",
            )

            before_stop = reconstruct_slot_inventory(lock=lock, root=root)
            self.assertEqual("completed", before_stop[0].state)
            self.assertEqual("failed", before_stop[1].state)
            self.assertEqual("missing", before_stop[2].state)

            store.record_stop(after_sequence=1, code="balance_unavailable")
            after_stop = reconstruct_slot_inventory(lock=lock, root=root)
            self.assertEqual("completed", after_stop[0].state)
            self.assertEqual("failed", after_stop[1].state)
            self.assertTrue(
                all(
                    record.state == "skipped-by-stop-rule"
                    for record in after_stop[2:]
                )
            )
            self.assertEqual(120, len(after_stop))

    def test_zero_call_cli_writes_once_without_using_a_present_credential(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "dry-run.json"
            environment = dict(os.environ)
            environment["DEEPSEEK_API_KEY"] = "must-not-be-read-or-retained"
            environment["PYTHONPATH"] = "."
            command = (
                sys.executable,
                str(ROOT / "scripts" / "dry_run_deepseek_live_behavioral_eval.py"),
                "--output",
                str(output),
            )
            completed = subprocess.run(
                command,
                cwd=ROOT,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(0, completed.returncode, completed.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(120, document["planned_slots"])
            self.assertEqual(0, document["live_model_calls"])
            self.assertEqual(0, document["balance_queries"])
            self.assertNotIn("must-not-be-read-or-retained", output.read_text())

            refused = subprocess.run(
                command,
                cwd=ROOT,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(0, refused.returncode)


class _BalanceClient:
    def __init__(self, receipts: tuple[BalanceReceipt, ...]) -> None:
        self._receipts = receipts
        self.queries = 0

    def query_balance(self) -> BalanceReceipt:
        receipt = self._receipts[self.queries]
        self.queries += 1
        return receipt


class _FakeBalanceHttpResponse:
    status = 200

    def __init__(self, body: bytes) -> None:
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self) -> bytes:
        return self._body


class _FakeBalanceUrlOpen:
    def __init__(self, body: bytes) -> None:
        self._body = body
        self.calls = 0
        self.request = None

    def __call__(self, request, *, timeout):
        self.calls += 1
        self.request = request
        return _FakeBalanceHttpResponse(self._body)


if __name__ == "__main__":
    unittest.main()
