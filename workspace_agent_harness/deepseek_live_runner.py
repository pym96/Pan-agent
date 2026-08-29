"""One budgeted serial execution path for the frozen DeepSeek campaign."""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from threading import Event
from typing import Callable, cast

from .behavioral_eval import (
    BehavioralCase,
    BehavioralEvalCampaign,
    EvaluatorVerdict,
    load_behavioral_eval_manifest,
)
from .deepseek_live_campaign import (
    BUDGETED_RUNNER_IDENTITY,
    BUDGETED_RUNNER_VERSION,
    BalanceClient,
    BudgetStop,
    CampaignBudgetMeter,
    DeepSeekLiveEvalLock,
    FileLiveCampaignStore,
    LiveEvalSlot,
    LIVE_ENTRY_IDENTITY,
    LIVE_ENTRY_VERSION,
    SlotInventoryRecord,
    deepseek_live_context_projector,
    reconstruct_slot_inventory,
)
from .evented import (
    ExchangeFailed,
    ExchangeEvidence,
    ExchangeResult,
    ExchangeSettled,
    ModelGateway,
    ModelExchangeException,
    PreparedModelTurn,
    ProviderFailure,
    ProviderFailureKind,
    ProviderDispatchState,
)
from .translation import canonical_json_bytes


RUNNER_VERSION = BUDGETED_RUNNER_VERSION
RUNNER_IDENTITY = BUDGETED_RUNNER_IDENTITY


GatewayFactory = Callable[[BehavioralCase, Path], ModelGateway]
CampaignStoreFactory = Callable[[Path, DeepSeekLiveEvalLock], FileLiveCampaignStore]


def required_live_acknowledgement(lock: DeepSeekLiveEvalLock) -> str:
    return f"execute-live:{lock.identity}:{RUNNER_IDENTITY}:{LIVE_ENTRY_IDENTITY}"


@dataclass(frozen=True)
class LiveCampaignReport:
    lock_identity: str
    schedule_identity: str
    runner_identity: str
    live_entry_identity: str
    planned_slots: int
    executed_slots: int
    skipped_slots: int
    missing_slots: int
    provider_exchanges: int
    authorized_exchanges: int
    balance_receipts: int
    usage_known_exchanges: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    observed_cost_cny: str | None
    task_passed: int
    task_failed: int
    runtime_failures: int
    campaign_stop_code: str | None
    inventory: tuple[SlotInventoryRecord, ...]

    def as_dict(self) -> dict[str, object]:
        return {
            "schema": "workspace-agent-harness/live-campaign-report/v1",
            "lock_identity": self.lock_identity,
            "schedule_identity": self.schedule_identity,
            "runner_identity": self.runner_identity,
            "live_entry_identity": self.live_entry_identity,
            "denominator": {
                "planned": self.planned_slots,
                "executed": self.executed_slots,
                "skipped_by_stop_rule": self.skipped_slots,
                "missing": self.missing_slots,
            },
            "provider_exchanges": self.provider_exchanges,
            "authorized_exchanges": self.authorized_exchanges,
            "budget_settlement": {
                "balance_receipts": self.balance_receipts,
                "usage_known_exchanges": self.usage_known_exchanges,
                "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens,
                "total_tokens": self.total_tokens,
                "observed_cost_cny": self.observed_cost_cny,
            },
            "task_outcomes": {
                "passed": self.task_passed,
                "failed": self.task_failed,
            },
            "runtime_failures": self.runtime_failures,
            "campaign_stop_code": self.campaign_stop_code,
            "inventory": [
                {
                    "sequence": record.sequence,
                    "slot_id": record.slot_id,
                    "slot_identity": record.slot_identity,
                    "state": record.state,
                    "event_log_ref": record.event_log_ref,
                    "failure_category": record.failure_category,
                    "stop_code": record.stop_code,
                }
                for record in self.inventory
            ],
        }

    def canonical_json(self) -> str:
        return canonical_json_bytes(self.as_dict()).decode("utf-8") + "\n"


class _BudgetedGateway:
    def __init__(
        self,
        *,
        downstream: ModelGateway,
        meter: CampaignBudgetMeter,
        store: FileLiveCampaignStore,
        slot: LiveEvalSlot,
    ) -> None:
        self._downstream = downstream
        self._meter = meter
        self._store = store
        self._slot = slot
        self.stop_code: str | None = None
        self.last_failure_kind: ProviderFailureKind | None = None

    def exchange(
        self,
        prepared_turn: PreparedModelTurn,
        cancel_signal: Event,
    ) -> ExchangeResult:
        try:
            ordinal = self._store.record_exchange_intent(
                self._slot,
                prepared_turn_identity=prepared_turn.identity,
            )
        except Exception:
            self.stop_code = "exchange_intent_persistence_failed"
            return self._control_failure(self.stop_code)
        try:
            authorization = self._meter.authorize_model_call()
        except BudgetStop as error:
            self.stop_code = error.code
            return self._control_failure(error.code)
        try:
            self._store.record_exchange_authorization(
                self._slot,
                ordinal=ordinal,
                authorization_number=authorization,
            )
        except Exception:
            self._meter.record_not_dispatched()
            self.stop_code = "exchange_authorization_persistence_failed"
            return self._control_failure(self.stop_code)
        try:
            result = self._downstream.exchange(prepared_turn, cancel_signal)
        except ModelExchangeException as error:
            return self._settle_exception(error, ordinal=ordinal)
        except Exception as error:
            return self._settle_exception(
                ModelExchangeException(
                    f"unclassified Gateway exception: {type(error).__name__}",
                    dispatch_state=ProviderDispatchState.UNCERTAIN,
                    evidence=ExchangeEvidence(
                        response_identity="unreported",
                        dispatch_state=ProviderDispatchState.UNCERTAIN,
                    ),
                ),
                ordinal=ordinal,
            )
        return self._settle_result(result, ordinal=ordinal)

    def _control_failure(
        self,
        code: str,
        *,
        evidence: ExchangeEvidence | None = None,
    ) -> ExchangeFailed:
        return ExchangeFailed(
            exchange_id=f"runner-control:{self._slot.slot_id}:{code}",
            failure=ProviderFailure(
                kind=ProviderFailureKind.BUDGET,
                code=code,
                message=f"campaign control stopped exchange: {code}",
            ),
            evidence=evidence or ExchangeEvidence(response_identity="unreported"),
        )

    def _settle_result(
        self,
        result: ExchangeResult,
        *,
        ordinal: int,
    ) -> ExchangeResult:
        if isinstance(result, ExchangeFailed):
            self.last_failure_kind = result.failure.kind
        receipt = None
        try:
            receipt = self._meter.record_model_call(
                usage=result.evidence.usage,
                returned_model=result.evidence.returned_model,
                system_fingerprint=result.evidence.system_fingerprint,
            )
        except BudgetStop as error:
            self.stop_code = error.code
            if self._meter.receipts:
                receipt = self._meter.receipts[-1]
        except Exception as error:
            self.stop_code = f"balance_settlement_failed:{type(error).__name__}"
        if isinstance(result, ExchangeFailed) and self.stop_code in {
            None,
            "model_usage_missing",
        }:
            immediate_provider_stops = {
                ProviderFailureKind.AUTHENTICATION: (
                    "provider_authentication_failure"
                ),
                ProviderFailureKind.AUTHORIZATION: (
                    "provider_authorization_failure"
                ),
                ProviderFailureKind.BALANCE: "provider_balance_failure",
            }
            provider_stop = immediate_provider_stops.get(result.failure.kind)
            if provider_stop is not None:
                self.stop_code = provider_stop
        try:
            self._store.record_exchange_settlement(
                self._slot,
                ordinal=ordinal,
                outcome="settled" if isinstance(result, ExchangeSettled) else "failed",
                evidence=_exchange_evidence(result),
                balance_receipt=receipt,
                stop_code=self.stop_code,
            )
        except Exception:
            self.stop_code = "exchange_settlement_persistence_failed"
        if self.stop_code is None:
            return result
        return ExchangeFailed(
            exchange_id=result.exchange_id,
            failure=ProviderFailure(
                kind=ProviderFailureKind.BUDGET,
                code=self.stop_code,
                message=f"campaign stopped after retained exchange: {self.stop_code}",
            ),
            evidence=result.evidence,
        )

    def _settle_exception(
        self,
        error: ModelExchangeException,
        *,
        ordinal: int,
    ) -> ExchangeResult:
        receipt = None
        if error.dispatch_state is ProviderDispatchState.NOT_DISPATCHED:
            self._meter.record_not_dispatched()
            self.stop_code = "provider_not_dispatched"
            outcome = "not-dispatched"
        elif error.dispatch_state is ProviderDispatchState.UNCERTAIN:
            try:
                self._meter.settle_uncertain_dispatch()
            except BudgetStop as stop:
                self.stop_code = stop.code
                if self._meter.receipts:
                    receipt = self._meter.receipts[-1]
            except Exception as balance_error:
                self.stop_code = (
                    f"balance_settlement_failed:{type(balance_error).__name__}"
                )
            outcome = "uncertain"
        else:
            try:
                receipt = self._meter.record_model_call(
                    usage=error.evidence.usage,
                    returned_model=error.evidence.returned_model,
                    system_fingerprint=error.evidence.system_fingerprint,
                )
                self.stop_code = "provider_response_processing_failed"
            except BudgetStop as stop:
                self.stop_code = stop.code
                if self._meter.receipts:
                    receipt = self._meter.receipts[-1]
            except Exception as balance_error:
                self.stop_code = (
                    f"balance_settlement_failed:{type(balance_error).__name__}"
                )
            outcome = "failed"
        try:
            self._store.record_exchange_settlement(
                self._slot,
                ordinal=ordinal,
                outcome=outcome,
                evidence={
                    "exception_type": type(error).__name__,
                    "dispatch_state": error.dispatch_state.value,
                    **error.evidence.as_event_payload(),
                },
                balance_receipt=receipt,
                stop_code=self.stop_code,
            )
        except Exception:
            self.stop_code = "exchange_settlement_persistence_failed"
        assert self.stop_code is not None
        return ExchangeFailed(
            exchange_id=f"runner-exception:{self._slot.slot_id}:{ordinal}",
            failure=ProviderFailure(
                kind=ProviderFailureKind.BUDGET,
                code=self.stop_code,
                message=f"campaign stopped after Gateway exception: {self.stop_code}",
            ),
            evidence=error.evidence,
        )


class BudgetedSerialCampaignRunner:
    """Own serial traversal, exchange authorization, settlement, and stop state."""

    def __init__(
        self,
        *,
        lock: DeepSeekLiveEvalLock,
        artifacts_root: Path,
        balance_client: BalanceClient,
        gateway_factory: GatewayFactory,
        cancel_signal: Event | None = None,
        campaign_store_factory: CampaignStoreFactory | None = None,
    ) -> None:
        self._lock = lock
        self._root = Path(artifacts_root)
        self._balance_client = balance_client
        self._gateway_factory = gateway_factory
        self._cancel_signal = cancel_signal or Event()
        self._campaign_store_factory = campaign_store_factory or (
            lambda root, selected: FileLiveCampaignStore(root=root, lock=selected)
        )

    def run(self, *, acknowledgement: str) -> LiveCampaignReport:
        if acknowledgement != required_live_acknowledgement(self._lock):
            raise PermissionError("exact live campaign identity acknowledgement required")
        store = self._campaign_store_factory(self._root, self._lock)
        if self._cancel_signal.is_set():
            store.record_stop(after_sequence=-1, code="campaign_cancelled")
            return reconstruct_live_campaign_report(lock=self._lock, root=self._root)
        meter = CampaignBudgetMeter(lock=self._lock, balance_client=self._balance_client)
        try:
            preflight_receipt = meter.preflight()
        except BudgetStop as error:
            if meter.receipts:
                try:
                    store.record_balance_preflight(meter.receipts[0])
                except Exception:
                    error = BudgetStop("balance_preflight_persistence_failed")
            store.record_stop(after_sequence=-1, code=error.code)
            return reconstruct_live_campaign_report(lock=self._lock, root=self._root)
        except Exception as error:
            store.record_stop(
                after_sequence=-1,
                code=f"balance_preflight_failed:{type(error).__name__}",
            )
            return reconstruct_live_campaign_report(lock=self._lock, root=self._root)
        try:
            store.record_balance_preflight(preflight_receipt)
        except Exception:
            store.record_stop(
                after_sequence=-1,
                code="balance_preflight_persistence_failed",
            )
            return reconstruct_live_campaign_report(lock=self._lock, root=self._root)

        manifest = load_behavioral_eval_manifest()
        consecutive_transport_failures = 0
        for slot in self._lock.slots:
            meter.begin_slot(slot)
            slot_root = store.begin_slot(slot)
            case = manifest.case(slot.case_id)
            gateway = _BudgetedGateway(
                downstream=self._gateway_factory(case, slot_root),
                meter=meter,
                store=store,
                slot=slot,
            )

            def selected_gateway_factory(selected: BehavioralCase) -> ModelGateway:
                if selected.case_id != slot.case_id:
                    raise ValueError("Behavioral campaign selected an unlocked case")
                return gateway

            report = BehavioralEvalCampaign(
                manifest=manifest,
                artifacts_root=slot_root / "runtime",
                gateway_factory=selected_gateway_factory,
                loop_policy_id=slot.loop_policy_id,
                context_projector_factory=deepseek_live_context_projector,
                cancel_signal=self._cancel_signal,
            ).run(case_ids=(slot.case_id,))
            result = report.cases[0]
            event_log_ref = (
                slot_root / "runtime" / result.event_log_ref
            ).relative_to(self._root).as_posix()
            normal_terminal = result.runtime_status in {
                "completed",
                "abstained",
                "loop_policy_stop",
            }
            try:
                store.settle_slot(
                    slot,
                    state="completed" if normal_terminal else "failed",
                    event_log_ref=event_log_ref,
                    failure_category=(
                        None
                        if normal_terminal
                        else result.failure_category or "runtime.failure"
                    ),
                )
            except Exception:
                store.record_stop(
                    after_sequence=slot.sequence,
                    code="slot_settlement_persistence_failed",
                )
                break
            stop_code = gateway.stop_code
            if result.runtime_status == "cancelled":
                stop_code = "campaign_cancelled"
            if gateway.last_failure_kind is ProviderFailureKind.TRANSPORT:
                consecutive_transport_failures += 1
            else:
                consecutive_transport_failures = 0
            if consecutive_transport_failures >= 3:
                stop_code = (
                    "three_consecutive_pre_candidate_provider_transport_failures"
                )
            if stop_code is not None:
                store.record_stop(after_sequence=slot.sequence, code=stop_code)
                break
            meter.settle_slot()

        return reconstruct_live_campaign_report(lock=self._lock, root=self._root)


def reconstruct_live_campaign_report(
    *,
    lock: DeepSeekLiveEvalLock,
    root: Path,
) -> LiveCampaignReport:
    """Reconstruct outcomes from retained files without any external Adapter."""

    campaign_root = Path(root)
    inventory = reconstruct_slot_inventory(lock=lock, root=campaign_root)
    provider_exchanges = 0
    authorized_exchanges = 0
    balance_receipts = 0
    usage_known_exchanges = 0
    input_tokens = 0
    output_tokens = 0
    total_tokens = 0
    initial_balance: Decimal | None = None
    latest_balance: Decimal | None = None
    observed_cost_known = True
    preflight_path = campaign_root / "budget-preflight.json"
    if preflight_path.is_file():
        preflight = _read_object(preflight_path)
        receipt = preflight.get("receipt")
        if (
            preflight.get("schema")
            != "workspace-agent-harness/live-budget-preflight/v1"
            or preflight.get("lock_identity") != lock.identity
            or not isinstance(receipt, dict)
        ):
            raise ValueError("live budget preflight identity drift")
        balance_receipts += 1
        initial_balance = _receipt_cny(receipt)
        latest_balance = initial_balance
    task_passed = 0
    task_failed = 0
    runtime_failures = 0
    expected_authorization_number = 1
    for record in inventory:
        slot_root = campaign_root / "slots" / record.slot_id
        exchanges_root = slot_root / "exchanges"
        if exchanges_root.is_dir():
            slot = lock.slots[record.sequence]
            (
                authorization_numbers,
                not_dispatched,
                ledger_receipts,
                ledger_usage,
            ) = _validate_exchange_ledger(
                lock=lock,
                slot=slot,
                exchanges_root=exchanges_root,
            )
            expected_numbers = tuple(
                range(
                    expected_authorization_number,
                    expected_authorization_number + len(authorization_numbers),
                )
            )
            if authorization_numbers != expected_numbers:
                raise ValueError(
                    f"live exchange authorization identity drift: {record.slot_id}"
                )
            expected_authorization_number += len(authorization_numbers)
            slot_authorizations = len(authorization_numbers)
            authorized_exchanges += slot_authorizations
            provider_exchanges += slot_authorizations - not_dispatched
            balance_receipts += len(ledger_receipts)
            if len(ledger_receipts) < slot_authorizations - not_dispatched:
                observed_cost_known = False
            for retained_receipt in ledger_receipts:
                parsed_balance = _receipt_cny(retained_receipt)
                if parsed_balance is None:
                    observed_cost_known = False
                else:
                    latest_balance = parsed_balance
            for usage in ledger_usage:
                if all(isinstance(value, int) for value in usage):
                    known_input, known_output, known_total = usage
                    assert isinstance(known_input, int)
                    assert isinstance(known_output, int)
                    assert isinstance(known_total, int)
                    usage_known_exchanges += 1
                    input_tokens += known_input
                    output_tokens += known_output
                    total_tokens += known_total
        report_path = slot_root / "runtime" / "report.json"
        if not report_path.is_file():
            continue
        report = _read_object(report_path)
        cases = report.get("cases")
        if not isinstance(cases, list) or len(cases) != 1 or not isinstance(cases[0], dict):
            raise ValueError(f"retained slot report is malformed: {record.slot_id}")
        verdict = cases[0].get("evaluator_verdict")
        failure_category = cases[0].get("failure_category")
        if verdict == EvaluatorVerdict.PASSED.value:
            task_passed += 1
        elif failure_category == "task.failure":
            task_failed += 1
        else:
            runtime_failures += 1
    stop_path = campaign_root / "campaign-stop.json"
    stop_code = None
    if stop_path.is_file():
        stop = _read_object(stop_path)
        value = stop.get("code")
        if not isinstance(value, str) or not value:
            raise ValueError("retained campaign stop is malformed")
        stop_code = value
    state_counts = {
        state: sum(record.state == state for record in inventory)
        for state in ("completed", "failed", "skipped-by-stop-rule", "missing")
    }
    observed_cost_cny = None
    if (
        observed_cost_known
        and initial_balance is not None
        and latest_balance is not None
    ):
        observed_cost_cny = format(initial_balance - latest_balance, "f")
    return LiveCampaignReport(
        lock_identity=lock.identity,
        schedule_identity=lock.schedule_identity,
        runner_identity=RUNNER_IDENTITY,
        live_entry_identity=LIVE_ENTRY_IDENTITY,
        planned_slots=len(inventory),
        executed_slots=state_counts["completed"] + state_counts["failed"],
        skipped_slots=state_counts["skipped-by-stop-rule"],
        missing_slots=state_counts["missing"],
        provider_exchanges=provider_exchanges,
        authorized_exchanges=authorized_exchanges,
        balance_receipts=balance_receipts,
        usage_known_exchanges=usage_known_exchanges,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        observed_cost_cny=observed_cost_cny,
        task_passed=task_passed,
        task_failed=task_failed,
        runtime_failures=runtime_failures,
        campaign_stop_code=stop_code,
        inventory=inventory,
    )


def _validate_exchange_ledger(
    *,
    lock: DeepSeekLiveEvalLock,
    slot: LiveEvalSlot,
    exchanges_root: Path,
) -> tuple[
    tuple[int, ...],
    int,
    tuple[dict[str, object], ...],
    tuple[tuple[object, object, object], ...],
]:
    exchange_roots = tuple(sorted(exchanges_root.glob("exchange-*")))
    expected_names = tuple(
        f"exchange-{ordinal:03d}" for ordinal in range(1, len(exchange_roots) + 1)
    )
    if tuple(root.name for root in exchange_roots) != expected_names or any(
        not root.is_dir() for root in exchange_roots
    ):
        raise ValueError(f"live exchange sequence drift: {slot.slot_id}")
    authorization_numbers: list[int] = []
    not_dispatched = 0
    receipts: list[dict[str, object]] = []
    usages: list[tuple[object, object, object]] = []
    for ordinal, exchange_root in enumerate(exchange_roots, start=1):
        intent = _read_object(exchange_root / "intent.json")
        if (
            intent.get("schema")
            != "workspace-agent-harness/live-exchange-intent/v1"
            or intent.get("lock_identity") != lock.identity
            or intent.get("slot_identity") != slot.identity
            or intent.get("ordinal") != ordinal
            or not isinstance(intent.get("prepared_turn_identity"), str)
        ):
            raise ValueError(f"live exchange intent identity drift: {slot.slot_id}")
        authorization_path = exchange_root / "authorization.json"
        authorization_present = authorization_path.is_file()
        if authorization_present:
            authorization = _read_object(authorization_path)
            number = authorization.get("authorization_number")
            if (
                authorization.get("schema")
                != "workspace-agent-harness/live-exchange-authorization/v1"
                or authorization.get("lock_identity") != lock.identity
                or authorization.get("slot_identity") != slot.identity
                or authorization.get("ordinal") != ordinal
                or isinstance(number, bool)
                or not isinstance(number, int)
                or not 1 <= number <= lock.maximum_paid_model_calls
            ):
                raise ValueError(
                    f"live exchange authorization identity drift: {slot.slot_id}"
                )
            authorization_numbers.append(number)
        settlement_path = exchange_root / "settlement.json"
        if not settlement_path.is_file():
            continue
        settlement = _read_object(settlement_path)
        outcome = settlement.get("outcome")
        if (
            not authorization_present
            or settlement.get("schema")
            != "workspace-agent-harness/live-exchange-settlement/v1"
            or settlement.get("lock_identity") != lock.identity
            or settlement.get("slot_identity") != slot.identity
            or settlement.get("ordinal") != ordinal
            or outcome
            not in {"settled", "failed", "not-dispatched", "uncertain"}
            or not isinstance(settlement.get("evidence"), dict)
            or not (
                settlement.get("stop_code") is None
                or isinstance(settlement.get("stop_code"), str)
            )
        ):
            raise ValueError(
                f"live exchange settlement identity drift: {slot.slot_id}"
            )
        balance_receipt = settlement.get("balance_receipt")
        if balance_receipt is not None and (
            not isinstance(balance_receipt, dict)
            or not isinstance(balance_receipt.get("response_identity"), str)
        ):
            raise ValueError(
                f"live exchange balance receipt drift: {slot.slot_id}"
            )
        if isinstance(balance_receipt, dict):
            receipts.append(balance_receipt)
        evidence = settlement["evidence"]
        assert isinstance(evidence, dict)
        usage = evidence.get("usage")
        if isinstance(usage, dict):
            values = (
                usage.get("input_tokens"),
                usage.get("output_tokens"),
                usage.get("total_tokens"),
            )
            if any(
                value is not None
                and (
                    isinstance(value, bool)
                    or not isinstance(value, int)
                    or value < 0
                )
                for value in values
            ):
                raise ValueError(f"live exchange usage drift: {slot.slot_id}")
            if all(isinstance(value, int) for value in values):
                known_values = cast(tuple[int, int, int], values)
                if known_values[0] + known_values[1] != known_values[2]:
                    raise ValueError(f"live exchange usage drift: {slot.slot_id}")
            usages.append(
                values
            )
        if outcome == "not-dispatched":
            not_dispatched += 1
    return tuple(authorization_numbers), not_dispatched, tuple(receipts), tuple(usages)


def _receipt_cny(receipt: dict[str, object]) -> Decimal | None:
    if receipt.get("currency") != "CNY":
        raise ValueError("live balance receipt currency drift")
    available = receipt.get("is_available")
    if not isinstance(available, bool):
        raise ValueError("live balance receipt availability drift")
    total = receipt.get("total_balance")
    if total is None:
        if available:
            raise ValueError("live balance receipt availability drift")
        return None
    if not available or not isinstance(total, str):
        raise ValueError("live balance receipt total drift")
    try:
        return Decimal(total)
    except InvalidOperation as error:
        raise ValueError("live balance receipt total drift") from error


def _exchange_evidence(result: ExchangeResult) -> dict[str, object]:
    return {
        "exchange_id": result.exchange_id,
        "result": "settled" if isinstance(result, ExchangeSettled) else "failed",
        "failure_kind": (
            result.failure.kind.value if isinstance(result, ExchangeFailed) else None
        ),
        "failure_code": result.failure.code if isinstance(result, ExchangeFailed) else None,
        **result.evidence.as_event_payload(),
    }


def _read_object(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read retained runner artifact: {path.name}") from error
    if not isinstance(value, dict):
        raise ValueError(f"retained runner artifact is not an object: {path.name}")
    return cast(dict[str, object], value)


__all__ = [
    "BudgetedSerialCampaignRunner",
    "LIVE_ENTRY_IDENTITY",
    "LIVE_ENTRY_VERSION",
    "LiveCampaignReport",
    "RUNNER_IDENTITY",
    "RUNNER_VERSION",
    "reconstruct_live_campaign_report",
    "required_live_acknowledgement",
]
