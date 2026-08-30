from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event
import unittest

from workspace_agent_harness.deepseek_live_campaign import (
    load_deepseek_live_eval_lock,
    load_deepseek_live_eval_v3_lock,
)
from workspace_agent_harness.deepseek_live_runner import (
    BudgetedSerialCampaignRunner,
    required_live_acknowledgement,
)


class DeepSeekLiveV3RunnerTest(unittest.TestCase):
    def test_v3_acknowledgement_is_exact_and_rejects_every_v2_identity(self) -> None:
        v2 = load_deepseek_live_eval_lock()
        v3 = load_deepseek_live_eval_v3_lock()
        v2_ack = required_live_acknowledgement(v2)
        v3_ack = required_live_acknowledgement(v3)

        self.assertNotEqual(v2_ack, v3_ack)
        self.assertEqual(
            f"execute-live:{v3.identity}:{v3.runner_identity}:{v3.live_entry_identity}",
            v3_ack,
        )
        balance = _FailOnUseBalance()
        gateways = _FailOnUseGatewayFactory()
        with TemporaryDirectory() as directory:
            runner = BudgetedSerialCampaignRunner(
                lock=v3,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
            )
            with self.assertRaisesRegex(PermissionError, "exact live campaign"):
                runner.run(acknowledgement=v2_ack)
        self.assertEqual(0, balance.calls)
        self.assertEqual(0, gateways.calls)

    def test_cancelled_v3_runner_retains_identity_without_balance_or_provider_use(self) -> None:
        lock = load_deepseek_live_eval_v3_lock()
        signal = Event()
        signal.set()
        balance = _FailOnUseBalance()
        gateways = _FailOnUseGatewayFactory()
        with TemporaryDirectory() as directory:
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
                cancel_signal=signal,
            ).run(acknowledgement=required_live_acknowledgement(lock))

        self.assertEqual(lock.identity, report.lock_identity)
        self.assertEqual(lock.schedule_identity, report.schedule_identity)
        self.assertEqual(lock.runner_identity, report.runner_identity)
        self.assertEqual(lock.live_entry_identity, report.live_entry_identity)
        self.assertEqual("campaign_cancelled", report.campaign_stop_code)
        self.assertEqual(0, report.provider_exchanges)
        self.assertEqual(0, report.authorized_exchanges)
        self.assertEqual(0, report.executed_slots)
        self.assertEqual(120, report.skipped_slots)
        self.assertEqual(0, balance.calls)
        self.assertEqual(0, gateways.calls)


class _FailOnUseBalance:
    def __init__(self) -> None:
        self.calls = 0

    def query(self):
        self.calls += 1
        raise AssertionError("zero-call v3 test attempted a balance query")


class _FailOnUseGatewayFactory:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, case, slot_root):
        self.calls += 1
        raise AssertionError("zero-call v3 test attempted Provider construction")


if __name__ == "__main__":
    unittest.main()
