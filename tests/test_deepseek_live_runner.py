from __future__ import annotations

from dataclasses import replace
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Event
import unittest

from workspace_agent_harness.behavioral_eval import (
    BehavioralCase,
    ReferenceBehaviorGateway,
)
from workspace_agent_harness.deepseek_live_campaign import (
    BalanceReceipt,
    BudgetStop,
    CampaignBudgetMeter,
    FileLiveCampaignStore,
    build_zero_call_dry_run,
    load_deepseek_live_eval_lock,
)
from workspace_agent_harness.deepseek_live_runner import (
    BudgetedSerialCampaignRunner,
    LIVE_ENTRY_IDENTITY,
    RUNNER_IDENTITY,
    reconstruct_live_campaign_report,
    required_live_acknowledgement,
)
from workspace_agent_harness.evented import (
    CandidateToolCall,
    ExchangeEvidence,
    ExchangeFailed,
    ExchangeSettled,
    ExchangeUsage,
    ModelExchangeException,
    PreparedModelTurn,
    ProviderDispatchState,
    ProviderFailure,
    ProviderFailureKind,
)


class DeepSeekLiveRunnerTest(unittest.TestCase):
    def test_reconstruction_rejects_exchange_ledger_identity_drift(self) -> None:
        lock = load_deepseek_live_eval_lock()
        with TemporaryDirectory() as directory:
            root = Path(directory) / "campaign"
            BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=root,
                balance_client=_StableBalanceClient(),
                gateway_factory=_DispatchExceptionGatewayFactory(
                    ProviderDispatchState.RESPONSE_RECEIVED
                ),
            ).run(acknowledgement=required_live_acknowledgement(lock))
            authorization_path = (
                root
                / "slots"
                / lock.slots[0].slot_id
                / "exchanges"
                / "exchange-001"
                / "authorization.json"
            )
            authorization = json.loads(authorization_path.read_text(encoding="utf-8"))
            authorization["authorization_number"] = 0
            authorization_path.write_text(
                json.dumps(authorization),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "authorization identity drift"):
                reconstruct_live_campaign_report(lock=lock, root=root)

    def test_provider_auth_and_balance_failures_stop_immediately_after_settlement(self) -> None:
        lock = load_deepseek_live_eval_lock()
        expected = {
            ProviderFailureKind.AUTHENTICATION: "provider_authentication_failure",
            ProviderFailureKind.AUTHORIZATION: "provider_authorization_failure",
            ProviderFailureKind.BALANCE: "provider_balance_failure",
        }
        for kind, expected_stop in expected.items():
            with self.subTest(kind=kind), TemporaryDirectory() as directory:
                balance = _StableBalanceClient()
                gateways = _ProviderFailureGatewayFactory(kind)
                report = BudgetedSerialCampaignRunner(
                    lock=lock,
                    artifacts_root=Path(directory) / "campaign",
                    balance_client=balance,
                    gateway_factory=gateways,
                ).run(acknowledgement=required_live_acknowledgement(lock))
                self.assertEqual(expected_stop, report.campaign_stop_code)
                self.assertEqual(2, balance.queries)
                self.assertEqual(1, gateways.provider_calls)
                self.assertEqual(119, report.skipped_slots)

    def test_slot_settlement_failure_retains_missing_current_and_skips_later_slots(self) -> None:
        lock = load_deepseek_live_eval_lock()
        balance = _StableBalanceClient()
        gateways = _UsageReferenceGatewayFactory()
        with TemporaryDirectory() as directory:
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
                campaign_store_factory=lambda root, selected: _FailingAttemptStore(
                    root=root,
                    lock=selected,
                ),
            ).run(acknowledgement=required_live_acknowledgement(lock))

        self.assertEqual("slot_settlement_persistence_failed", report.campaign_stop_code)
        self.assertEqual(0, report.executed_slots)
        self.assertEqual(1, report.missing_slots)
        self.assertEqual(119, report.skipped_slots)
        self.assertGreater(gateways.provider_calls, 0)

    def test_runner_stays_below_600_and_meter_rejects_authorization_601(self) -> None:
        lock = load_deepseek_live_eval_lock()
        balance = _StableBalanceClient()
        gateways = _FiveCallGatewayFactory()
        with TemporaryDirectory() as directory:
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
            ).run(acknowledgement=required_live_acknowledgement(lock))

        self.assertEqual(420, report.provider_exchanges)
        self.assertEqual(420, report.authorized_exchanges)
        self.assertEqual(420, gateways.provider_calls)
        self.assertEqual(421, balance.queries)
        self.assertEqual(120, report.executed_slots)
        self.assertEqual(0, report.skipped_slots)
        self.assertIsNone(report.campaign_stop_code)

        meter_balance = _StableBalanceClient()
        meter = CampaignBudgetMeter(lock=lock, balance_client=meter_balance)
        meter.preflight()
        for slot in lock.slots:
            meter.begin_slot(slot)
            for _ in range(slot.maximum_model_exchanges):
                meter.authorize_model_call()
                meter.record_model_call(
                    usage=ExchangeUsage(
                        input_tokens=10,
                        output_tokens=5,
                        total_tokens=15,
                    ),
                    returned_model="DeepSeek-V4-Flash-0731",
                    system_fingerprint="fake-stable-fingerprint",
                )
            if slot.sequence == len(lock.slots) - 1:
                with self.assertRaisesRegex(
                    BudgetStop,
                    "paid_model_call_ceiling_reached",
                ):
                    meter.authorize_model_call()
            else:
                meter.settle_slot()
        self.assertEqual(600, meter.model_calls)

    def test_three_consecutive_pre_candidate_transport_failures_stop_campaign(self) -> None:
        lock = load_deepseek_live_eval_lock()
        balance = _StableBalanceClient()
        gateways = _TransportFailureGatewayFactory()
        with TemporaryDirectory() as directory:
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
            ).run(acknowledgement=required_live_acknowledgement(lock))

        self.assertEqual(
            "three_consecutive_pre_candidate_provider_transport_failures",
            report.campaign_stop_code,
        )
        self.assertEqual(3, report.provider_exchanges)
        self.assertEqual(3, report.executed_slots)
        self.assertEqual(117, report.skipped_slots)
        self.assertEqual(3, report.runtime_failures)
        self.assertEqual(0, report.task_failed)

    def test_returned_fingerprint_drift_stops_after_the_second_settled_exchange(self) -> None:
        lock = load_deepseek_live_eval_lock()
        balance = _StableBalanceClient()
        gateways = _FingerprintDriftGatewayFactory()
        with TemporaryDirectory() as directory:
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
            ).run(acknowledgement=required_live_acknowledgement(lock))

        self.assertEqual("system_fingerprint_drift", report.campaign_stop_code)
        self.assertEqual(2, report.provider_exchanges)
        self.assertEqual(2, report.authorized_exchanges)
        self.assertEqual(3, balance.queries)
        self.assertEqual(1, report.executed_slots)
        self.assertEqual(119, report.skipped_slots)

    def test_cancellation_before_or_after_dispatch_never_starts_a_later_slot(self) -> None:
        lock = load_deepseek_live_eval_lock()
        pre_cancelled = Event()
        pre_cancelled.set()
        with TemporaryDirectory() as directory:
            balance = _StableBalanceClient()
            gateways = _UsageReferenceGatewayFactory()
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "pre-cancelled",
                balance_client=balance,
                gateway_factory=gateways,
                cancel_signal=pre_cancelled,
            ).run(acknowledgement=required_live_acknowledgement(lock))
            self.assertEqual("campaign_cancelled", report.campaign_stop_code)
            self.assertEqual(0, balance.queries)
            self.assertEqual(0, gateways.provider_calls)
            self.assertEqual(120, report.skipped_slots)

        with TemporaryDirectory() as directory:
            balance = _StableBalanceClient()
            gateways = _CancellingGatewayFactory()
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "after-response",
                balance_client=balance,
                gateway_factory=gateways,
            ).run(acknowledgement=required_live_acknowledgement(lock))
            self.assertEqual("campaign_cancelled", report.campaign_stop_code)
            self.assertEqual(2, balance.queries)
            self.assertEqual(1, gateways.provider_calls)
            self.assertEqual(1, report.executed_slots)
            self.assertEqual(119, report.skipped_slots)

    def test_usage_balance_and_settlement_failures_stop_before_a_second_exchange(self) -> None:
        lock = load_deepseek_live_eval_lock()
        scenarios = (
            (
                "missing-usage",
                _StableBalanceClient(),
                _MissingUsageGatewayFactory(),
                None,
                "model_usage_missing",
            ),
            (
                "balance-failure",
                _FailingPostExchangeBalanceClient(),
                _UsageReferenceGatewayFactory(),
                None,
                "balance_settlement_failed:OSError",
            ),
            (
                "settlement-persistence",
                _StableBalanceClient(),
                _UsageReferenceGatewayFactory(),
                lambda root, selected: _FailingSettlementStore(
                    root=root,
                    lock=selected,
                ),
                "exchange_settlement_persistence_failed",
            ),
        )
        for label, balance, gateways, store_factory, expected_stop in scenarios:
            with self.subTest(label=label), TemporaryDirectory() as directory:
                report = BudgetedSerialCampaignRunner(
                    lock=lock,
                    artifacts_root=Path(directory) / "campaign",
                    balance_client=balance,
                    gateway_factory=gateways,
                    campaign_store_factory=store_factory,
                ).run(acknowledgement=required_live_acknowledgement(lock))

                self.assertEqual(expected_stop, report.campaign_stop_code)
                self.assertEqual(1, report.authorized_exchanges)
                self.assertEqual(1, report.provider_exchanges)
                self.assertEqual(1, gateways.provider_calls)
                self.assertEqual(1, report.executed_slots)
                self.assertEqual(119, report.skipped_slots)

    def test_intent_persistence_failure_stops_before_authorization_or_dispatch(self) -> None:
        lock = load_deepseek_live_eval_lock()
        balance = _StableBalanceClient()
        gateways = _UsageReferenceGatewayFactory()
        with TemporaryDirectory() as directory:
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
                campaign_store_factory=lambda root, selected: _FailingIntentStore(
                    root=root,
                    lock=selected,
                ),
            ).run(acknowledgement=required_live_acknowledgement(lock))

        self.assertEqual("exchange_intent_persistence_failed", report.campaign_stop_code)
        self.assertEqual(1, balance.queries)
        self.assertEqual(0, gateways.provider_calls)
        self.assertEqual(0, report.authorized_exchanges)
        self.assertEqual(0, report.provider_exchanges)
        self.assertEqual(1, report.executed_slots)
        self.assertEqual(119, report.skipped_slots)

        with TemporaryDirectory() as directory:
            balance = _StableBalanceClient()
            gateways = _UsageReferenceGatewayFactory()
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
                campaign_store_factory=lambda root, selected: _FailingAuthorizationStore(
                    root=root,
                    lock=selected,
                ),
            ).run(acknowledgement=required_live_acknowledgement(lock))
        self.assertEqual(
            "exchange_authorization_persistence_failed",
            report.campaign_stop_code,
        )
        self.assertEqual(0, report.authorized_exchanges)
        self.assertEqual(0, report.provider_exchanges)
        self.assertEqual(0, gateways.provider_calls)

    def test_dispatch_state_controls_post_attempt_balance_settlement(self) -> None:
        lock = load_deepseek_live_eval_lock()
        scenarios = (
            (
                ProviderDispatchState.NOT_DISPATCHED,
                "provider_not_dispatched",
                1,
                0,
            ),
            (
                ProviderDispatchState.UNCERTAIN,
                "provider_dispatch_uncertain",
                2,
                1,
            ),
            (
                ProviderDispatchState.RESPONSE_RECEIVED,
                "provider_response_processing_failed",
                2,
                1,
            ),
        )
        for state, expected_stop, expected_balance_queries, expected_calls in scenarios:
            with self.subTest(state=state), TemporaryDirectory() as directory:
                balance = _StableBalanceClient()
                gateways = _DispatchExceptionGatewayFactory(state)
                report = BudgetedSerialCampaignRunner(
                    lock=lock,
                    artifacts_root=Path(directory) / "campaign",
                    balance_client=balance,
                    gateway_factory=gateways,
                ).run(acknowledgement=required_live_acknowledgement(lock))

                self.assertEqual(expected_stop, report.campaign_stop_code)
                self.assertEqual(expected_balance_queries, balance.queries)
                self.assertEqual(expected_calls, report.provider_exchanges)
                self.assertEqual(expected_calls, gateways.dispatched_calls)
                self.assertEqual(1, report.executed_slots)
                self.assertEqual(119, report.skipped_slots)
                self.assertEqual(0, report.missing_slots)

    def test_preflight_balance_stop_skips_the_full_denominator_without_provider(self) -> None:
        lock = load_deepseek_live_eval_lock()
        balance = _SequenceBalanceClient(
            (BalanceReceipt.unavailable("fake-unavailable"),)
        )
        gateways = _UsageReferenceGatewayFactory()
        with TemporaryDirectory() as directory:
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=balance,
                gateway_factory=gateways,
            ).run(acknowledgement=required_live_acknowledgement(lock))

        self.assertEqual("initial_balance_outside_authorization", report.campaign_stop_code)
        self.assertEqual(0, report.executed_slots)
        self.assertEqual(120, report.skipped_slots)
        self.assertEqual(0, report.missing_slots)
        self.assertEqual(1, balance.queries)
        self.assertEqual(0, gateways.provider_calls)

        with TemporaryDirectory() as directory:
            failed_balance = _FailingInitialBalanceClient()
            report = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=Path(directory) / "campaign",
                balance_client=failed_balance,
                gateway_factory=gateways,
            ).run(acknowledgement=required_live_acknowledgement(lock))
        self.assertEqual("balance_preflight_failed:OSError", report.campaign_stop_code)
        self.assertEqual(120, report.skipped_slots)
        self.assertEqual(1, failed_balance.queries)
        self.assertEqual(0, gateways.provider_calls)

    def test_live_entry_defaults_to_byte_stable_zero_call_preview(self) -> None:
        lock = load_deepseek_live_eval_lock()
        expected = build_zero_call_dry_run(lock=lock)
        environment = dict(os.environ)
        environment["DEEPSEEK_API_KEY"] = "must-not-be-read-stage-a-r"
        environment["PYTHONPATH"] = "."
        script = Path(__file__).parents[1] / "scripts" / "run_deepseek_live_behavioral_eval.py"

        with TemporaryDirectory() as directory:
            first = Path(directory) / "first.json"
            second = Path(directory) / "second.json"
            for output in (first, second):
                completed = subprocess.run(
                    (sys.executable, str(script), "--output", str(output)),
                    cwd=Path(__file__).parents[1],
                    env=environment,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(0, completed.returncode, completed.stderr)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(expected, json.loads(first.read_text(encoding="utf-8")))
            self.assertNotIn("must-not-be-read-stage-a-r", first.read_text())

            refused_root = Path(directory) / "refused-live"
            refused = subprocess.run(
                (
                    sys.executable,
                    str(script),
                    "--live",
                    "--output",
                    str(refused_root),
                ),
                cwd=Path(__file__).parents[1],
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertNotEqual(0, refused.returncode)
            self.assertFalse(refused_root.exists())
            self.assertNotIn("must-not-be-read-stage-a-r", refused.stderr)

    def test_repaired_lock_binds_the_only_runner_and_preserves_stage_a_lineage(self) -> None:
        lock = load_deepseek_live_eval_lock()

        self.assertEqual(
            "sha256:ea23dceaa9b8131a54399e7eda5f8cdd8bf968816e0d4efd2668884753dd52fa",
            lock.parent_stage_a_lock_identity,
        )
        self.assertEqual(RUNNER_IDENTITY, lock.runner_identity)
        self.assertEqual(LIVE_ENTRY_IDENTITY, lock.live_entry_identity)
        self.assertEqual(120, len(lock.slots))
        self.assertEqual(600, lock.maximum_paid_model_calls)
        self.assertEqual("15.00", lock.maximum_campaign_cost_cny)

    def test_missing_ack_and_duplicate_identity_do_zero_external_calls(self) -> None:
        lock = load_deepseek_live_eval_lock()
        with TemporaryDirectory() as directory:
            root = Path(directory) / "campaign"
            balance = _StableBalanceClient()
            gateways = _UsageReferenceGatewayFactory()
            runner = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=root,
                balance_client=balance,
                gateway_factory=gateways,
            )

            with self.assertRaisesRegex(PermissionError, "exact live campaign"):
                runner.run(acknowledgement="")
            self.assertFalse(root.exists())
            self.assertEqual(0, balance.queries)
            self.assertEqual(0, gateways.provider_calls)

            root.mkdir()
            (root / "occupied").write_text("identity already used", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                runner.run(acknowledgement=required_live_acknowledgement(lock))
            self.assertEqual(0, balance.queries)
            self.assertEqual(0, gateways.provider_calls)

    def test_production_runner_executes_locked_denominator_through_real_loop(self) -> None:
        lock = load_deepseek_live_eval_lock()
        balance = _StableBalanceClient()
        gateways = _UsageReferenceGatewayFactory()

        with TemporaryDirectory() as directory:
            root = Path(directory) / "campaign"
            runner = BudgetedSerialCampaignRunner(
                lock=lock,
                artifacts_root=root,
                balance_client=balance,
                gateway_factory=gateways,
            )
            self.assertEqual(0, balance.queries)
            self.assertEqual(0, gateways.provider_calls)

            report = runner.run(
                acknowledgement=required_live_acknowledgement(lock),
            )
            rebuilt = reconstruct_live_campaign_report(lock=lock, root=root)

            self.assertEqual(120, report.planned_slots)
            self.assertEqual(120, report.executed_slots)
            self.assertEqual(0, report.skipped_slots)
            self.assertEqual(0, report.missing_slots)
            self.assertGreater(gateways.provider_calls, 0)
            self.assertLessEqual(gateways.provider_calls, 600)
            self.assertEqual(gateways.provider_calls, report.provider_exchanges)
            self.assertEqual(gateways.provider_calls + 1, balance.queries)
            self.assertEqual(balance.queries, report.balance_receipts)
            self.assertEqual(gateways.provider_calls, report.usage_known_exchanges)
            self.assertEqual("0.00", report.observed_cost_cny)
            self.assertEqual(report.canonical_json(), rebuilt.canonical_json())
            self.assertTrue(
                all(
                    (root / record.event_log_ref).is_file()
                    for record in report.inventory
                    if record.event_log_ref is not None
                )
            )
            first_exchange = (
                root
                / "slots"
                / lock.slots[0].slot_id
                / "exchanges"
                / "exchange-001"
            )
            self.assertTrue((first_exchange / "intent.json").is_file())
            self.assertTrue((first_exchange / "authorization.json").is_file())
            self.assertTrue((first_exchange / "settlement.json").is_file())


class _StableBalanceClient:
    def __init__(self) -> None:
        self.queries = 0

    def query_balance(self) -> BalanceReceipt:
        self.queries += 1
        return BalanceReceipt.available_cny("10.00", f"fake-balance-{self.queries}")


class _SequenceBalanceClient:
    def __init__(self, receipts: tuple[BalanceReceipt, ...]) -> None:
        self._receipts = receipts
        self.queries = 0

    def query_balance(self) -> BalanceReceipt:
        receipt = self._receipts[self.queries]
        self.queries += 1
        return receipt


class _FailingPostExchangeBalanceClient:
    def __init__(self) -> None:
        self.queries = 0

    def query_balance(self) -> BalanceReceipt:
        self.queries += 1
        if self.queries == 1:
            return BalanceReceipt.available_cny("10.00", "fake-initial")
        raise OSError("deterministic balance failure")


class _FailingInitialBalanceClient:
    def __init__(self) -> None:
        self.queries = 0

    def query_balance(self) -> BalanceReceipt:
        self.queries += 1
        raise OSError("deterministic initial balance failure")


class _UsageReferenceGateway:
    def __init__(self, case_id: str, owner: "_UsageReferenceGatewayFactory") -> None:
        self._reference = ReferenceBehaviorGateway(case_id)
        self._owner = owner

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        self._owner.provider_calls += 1
        result = self._reference.exchange(prepared_turn, cancel_signal)
        assert isinstance(result, ExchangeSettled)
        return replace(
            result,
            evidence=replace(
                result.evidence,
                usage=ExchangeUsage(
                    input_tokens=10,
                    output_tokens=5,
                    total_tokens=15,
                ),
                requested_model="deepseek-v4-flash",
                returned_model="DeepSeek-V4-Flash-0731",
                system_fingerprint="fake-stable-fingerprint",
            ),
        )


class _UsageReferenceGatewayFactory:
    def __init__(self) -> None:
        self.provider_calls = 0

    def __call__(self, case: BehavioralCase, slot_root: Path):
        self.assert_secret_free_path(slot_root)
        return _UsageReferenceGateway(case.case_id, self)

    @staticmethod
    def assert_secret_free_path(slot_root: Path) -> None:
        if not slot_root.name.startswith("dsv0-"):
            raise AssertionError("runner supplied an unexpected slot root")


class _FingerprintDriftGateway(_UsageReferenceGateway):
    def __init__(self, case_id: str, owner: "_FingerprintDriftGatewayFactory") -> None:
        super().__init__(case_id, owner)
        self._exchange_index = 0

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        result = super().exchange(prepared_turn, cancel_signal)
        self._exchange_index += 1
        return replace(
            result,
            evidence=replace(
                result.evidence,
                system_fingerprint=f"fake-fingerprint-{self._exchange_index}",
            ),
        )


class _FingerprintDriftGatewayFactory(_UsageReferenceGatewayFactory):
    def __call__(self, case: BehavioralCase, slot_root: Path):
        return _FingerprintDriftGateway(case.case_id, self)


class _MissingUsageGateway:
    def __init__(self, owner: "_MissingUsageGatewayFactory") -> None:
        self._owner = owner

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        self._owner.provider_calls += 1
        return ExchangeFailed(
            exchange_id="fake-missing-usage",
            failure=ProviderFailure(
                kind=ProviderFailureKind.TRANSPORT,
                code="fake_transport",
                message="deterministic missing usage",
            ),
            evidence=ExchangeEvidence(
                response_identity="fake-missing-usage",
                dispatch_state=ProviderDispatchState.UNCERTAIN,
            ),
        )


class _MissingUsageGatewayFactory:
    def __init__(self) -> None:
        self.provider_calls = 0

    def __call__(self, case: BehavioralCase, slot_root: Path):
        return _MissingUsageGateway(self)


class _ProviderFailureGateway:
    def __init__(
        self,
        kind: ProviderFailureKind,
        owner: "_ProviderFailureGatewayFactory",
    ) -> None:
        self._kind = kind
        self._owner = owner

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        self._owner.provider_calls += 1
        return ExchangeFailed(
            exchange_id=f"fake-{self._kind.value}",
            failure=ProviderFailure(
                kind=self._kind,
                code=f"fake_{self._kind.value}",
                message="deterministic immediate Provider stop",
            ),
            evidence=ExchangeEvidence(
                response_identity=f"fake-{self._kind.value}",
                dispatch_state=ProviderDispatchState.RESPONSE_RECEIVED,
            ),
        )


class _ProviderFailureGatewayFactory:
    def __init__(self, kind: ProviderFailureKind) -> None:
        self._kind = kind
        self.provider_calls = 0

    def __call__(self, case: BehavioralCase, slot_root: Path):
        return _ProviderFailureGateway(self._kind, self)


class _TransportFailureGateway:
    def __init__(self, owner: "_TransportFailureGatewayFactory") -> None:
        self._owner = owner

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        self._owner.provider_calls += 1
        return ExchangeFailed(
            exchange_id=f"fake-transport-{self._owner.provider_calls}",
            failure=ProviderFailure(
                kind=ProviderFailureKind.TRANSPORT,
                code="fake_transport",
                message="deterministic retained transport failure",
            ),
            evidence=ExchangeEvidence(
                response_identity=f"fake-transport-{self._owner.provider_calls}",
                usage=ExchangeUsage(input_tokens=10, output_tokens=5, total_tokens=15),
                requested_model="deepseek-v4-flash",
                returned_model="DeepSeek-V4-Flash-0731",
                system_fingerprint="fake-stable-fingerprint",
                dispatch_state=ProviderDispatchState.RESPONSE_RECEIVED,
            ),
        )


class _TransportFailureGatewayFactory:
    def __init__(self) -> None:
        self.provider_calls = 0

    def __call__(self, case: BehavioralCase, slot_root: Path):
        return _TransportFailureGateway(self)


class _FiveCallGateway:
    def __init__(self, case_id: str, owner: "_FiveCallGatewayFactory") -> None:
        self._case_id = case_id
        self._owner = owner
        self._calls = 0

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        self._calls += 1
        self._owner.provider_calls += 1
        evidence = ExchangeEvidence(
            response_identity=f"fake-five-{self._case_id}-{self._calls}",
            usage=ExchangeUsage(input_tokens=10, output_tokens=5, total_tokens=15),
            requested_model="deepseek-v4-flash",
            returned_model="DeepSeek-V4-Flash-0731",
            system_fingerprint="fake-stable-fingerprint",
            dispatch_state=ProviderDispatchState.RESPONSE_RECEIVED,
        )
        if self._calls == 1:
            return ExchangeFailed(
                exchange_id=f"fake-overflow-{self._case_id}",
                failure=ProviderFailure(
                    kind=ProviderFailureKind.CONTEXT_OVERFLOW,
                    code="context_overflow",
                    message="deterministic first-attempt overflow",
                ),
                evidence=evidence,
            )
        tool_name, arguments = ReferenceBehaviorGateway._SCRIPTS[self._case_id][0]
        return ExchangeSettled(
            exchange_id=f"fake-five-{self._case_id}-{self._calls}",
            candidate=CandidateToolCall(
                call_id=f"fake-five-call-{self._case_id}-{self._calls}",
                tool_name=tool_name,
                arguments={
                    "input": json.dumps(
                        dict(arguments),
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                },
            ),
            evidence=evidence,
        )


class _FiveCallGatewayFactory:
    def __init__(self) -> None:
        self.provider_calls = 0

    def __call__(self, case: BehavioralCase, slot_root: Path):
        return _FiveCallGateway(case.case_id, self)


class _CancellingGateway(_UsageReferenceGateway):
    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        result = super().exchange(prepared_turn, cancel_signal)
        cancel_signal.set()
        return result


class _CancellingGatewayFactory(_UsageReferenceGatewayFactory):
    def __call__(self, case: BehavioralCase, slot_root: Path):
        return _CancellingGateway(case.case_id, self)


class _DispatchExceptionGateway:
    def __init__(
        self,
        state: ProviderDispatchState,
        owner: "_DispatchExceptionGatewayFactory",
    ) -> None:
        self._state = state
        self._owner = owner

    def exchange(self, prepared_turn: PreparedModelTurn, cancel_signal: Event):
        if self._state is not ProviderDispatchState.NOT_DISPATCHED:
            self._owner.dispatched_calls += 1
        usage = (
            ExchangeUsage(input_tokens=10, output_tokens=5, total_tokens=15)
            if self._state is ProviderDispatchState.RESPONSE_RECEIVED
            else ExchangeUsage()
        )
        raise ModelExchangeException(
            "deterministic fake dispatch exception",
            dispatch_state=self._state,
            evidence=ExchangeEvidence(
                response_identity="fake-dispatch-exception",
                usage=usage,
                requested_model="deepseek-v4-flash",
                returned_model=(
                    "DeepSeek-V4-Flash-0731"
                    if self._state is ProviderDispatchState.RESPONSE_RECEIVED
                    else None
                ),
                system_fingerprint=(
                    "fake-stable-fingerprint"
                    if self._state is ProviderDispatchState.RESPONSE_RECEIVED
                    else None
                ),
                dispatch_state=self._state,
            ),
        )


class _DispatchExceptionGatewayFactory:
    def __init__(self, state: ProviderDispatchState) -> None:
        self._state = state
        self.dispatched_calls = 0

    def __call__(self, case: BehavioralCase, slot_root: Path):
        return _DispatchExceptionGateway(self._state, self)


class _FailingIntentStore(FileLiveCampaignStore):
    def record_exchange_intent(self, slot, *, prepared_turn_identity: str) -> int:
        raise OSError("deterministic intent persistence failure")


class _FailingAuthorizationStore(FileLiveCampaignStore):
    def record_exchange_authorization(self, *args, **kwargs) -> None:
        raise OSError("deterministic authorization persistence failure")


class _FailingSettlementStore(FileLiveCampaignStore):
    def record_exchange_settlement(self, *args, **kwargs) -> None:
        raise OSError("deterministic settlement persistence failure")


class _FailingAttemptStore(FileLiveCampaignStore):
    def settle_slot(self, *args, **kwargs) -> None:
        raise OSError("deterministic slot settlement failure")


if __name__ == "__main__":
    unittest.main()
