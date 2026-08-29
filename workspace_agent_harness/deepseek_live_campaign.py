"""Frozen Stage A plan for the DeepSeek Behavioral Eval v0 campaign."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
import time
from types import MappingProxyType
from typing import Mapping, Never, Protocol, cast
import urllib.error
import urllib.request

from .behavioral_eval import MANIFEST_PATH, BehavioralManifest, load_behavioral_eval_manifest
from .context_projection import (
    CanonicalJsonTokenEstimator,
    ContextPolicy,
    InMemoryArtifactStore,
    SemanticContextProjector,
    action_tool_set_identity,
)
from .deepseek_live import (
    DEEPSEEK_LIVE_SYSTEM_PROMPT,
    DEEPSEEK_LIVE_TRANSLATION_VERSION,
    DeepSeekLiveTranslationAdapter,
    DeepSeekToolBinding,
    locked_deepseek_model_profile,
)
from .translation import canonical_json_bytes, identity_sha256
from .translation import ActionTool
from .evented import ExchangeUsage


LOCK_SCHEMA = "workspace-agent-harness/deepseek-live-behavioral-eval-lock/v2"
LOCK_PATH = (
    Path(__file__).with_name("benchmark_configs")
    / "deepseek-live-behavioral-eval-v0.json"
)
PARENT_STAGE_A_LOCK_IDENTITY = (
    "sha256:ea23dceaa9b8131a54399e7eda5f8cdd8bf968816e0d4efd2668884753dd52fa"
)
BUDGETED_RUNNER_VERSION = "budgeted-serial-campaign-runner/v1"
BUDGETED_RUNNER_IDENTITY = identity_sha256(
    {
        "version": BUDGETED_RUNNER_VERSION,
        "ordering": "frozen-slot-sequence-serial",
        "exchange_control": "intent-then-single-authorization-then-settlement",
        "runtime": "behavioral-eval-campaign-over-evented-agent-loop",
        "reconstruction": "retained-artifacts-only",
    }
)
LIVE_ENTRY_VERSION = "deepseek-live-behavioral-eval-entry/v1"
LIVE_ENTRY_IDENTITY = identity_sha256(
    {
        "version": LIVE_ENTRY_VERSION,
        "runner_identity": BUDGETED_RUNNER_IDENTITY,
        "default": "zero-call-preview",
        "live_gate": "exact-lock-and-runner-acknowledgement",
    }
)
EXPECTED_LOCK_IDENTITY = (
    "sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25"
)
OBSERVATION_FEEDBACK_POLICY_ID = "observation-feedback-v0"
ACT_ONCE_POLICY_ID = "act-once-v0"
_POLICIES = (OBSERVATION_FEEDBACK_POLICY_ID, ACT_ONCE_POLICY_ID)
_TRANSLATION_FIXTURE_MANIFEST = (
    Path(__file__).parents[1] / "tests" / "fixtures" / "translation" / "manifest.json"
)


@dataclass(frozen=True)
class LiveEvalSlot:
    sequence: int
    slot_id: str
    case_id: str
    case_identity: str
    tool_set_id: str
    loop_policy_id: str
    repetition: int
    maximum_model_exchanges: int
    translation_identity: str
    context_policy_identity: str

    def identity_material(self) -> dict[str, object]:
        return {
            "sequence": self.sequence,
            "slot_id": self.slot_id,
            "case_id": self.case_id,
            "case_identity": self.case_identity,
            "tool_set_id": self.tool_set_id,
            "loop_policy_id": self.loop_policy_id,
            "repetition": self.repetition,
            "maximum_model_exchanges": self.maximum_model_exchanges,
            "translation_identity": self.translation_identity,
            "context_policy_identity": self.context_policy_identity,
        }

    @property
    def identity(self) -> str:
        return identity_sha256(self.identity_material())


@dataclass(frozen=True)
class DeepSeekLiveEvalLock:
    identity: str
    source_path: Path
    parent_stage_a_lock_identity: str
    runner_identity: str
    live_entry_identity: str
    suite_id: str
    manifest_identity: str
    repetitions: int
    maximum_paid_model_calls: int
    maximum_campaign_cost_cny: str
    budget: Mapping[str, object]
    pricing_snapshot: Mapping[str, object]
    stop_rules: tuple[str, ...]
    historical_translation_fixture_manifest_sha256: str
    slots: tuple[LiveEvalSlot, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "budget", MappingProxyType(dict(self.budget)))
        object.__setattr__(
            self,
            "pricing_snapshot",
            MappingProxyType(dict(self.pricing_snapshot)),
        )

    @property
    def schedule_identity(self) -> str:
        return identity_sha256([slot.identity_material() for slot in self.slots])


class BudgetStop(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class BalanceReceipt:
    is_available: bool
    cny_total: Decimal | None
    response_identity: str

    def __post_init__(self) -> None:
        if not isinstance(self.is_available, bool):
            raise ValueError("balance availability must be boolean")
        if not isinstance(self.response_identity, str) or not self.response_identity:
            raise ValueError("balance response identity must be non-empty")
        if self.is_available != (self.cny_total is not None):
            raise ValueError("available balance receipt must contain exactly one CNY total")
        if self.cny_total is not None and self.cny_total < 0:
            raise ValueError("CNY balance cannot be negative")

    @classmethod
    def available_cny(cls, total: str, response_identity: str) -> "BalanceReceipt":
        try:
            parsed = Decimal(total)
        except InvalidOperation as error:
            raise ValueError("CNY balance must be decimal text") from error
        return cls(True, parsed, response_identity)

    @classmethod
    def unavailable(cls, response_identity: str) -> "BalanceReceipt":
        return cls(False, None, response_identity)

    def identity_material(self) -> dict[str, object]:
        return {
            "is_available": self.is_available,
            "currency": "CNY",
            "total_balance": (
                None if self.cny_total is None else format(self.cny_total, "f")
            ),
            "response_identity": self.response_identity,
        }


class BalanceClient(Protocol):
    def query_balance(self) -> BalanceReceipt: ...


@dataclass(frozen=True)
class RetainedBalanceResponse:
    status_code: int
    body: bytes
    duration_ms: int | None = None

    @property
    def identity(self) -> str:
        return "sha256:" + hashlib.sha256(self.body).hexdigest()


class BalanceResponseStore(Protocol):
    def record(self, response: RetainedBalanceResponse) -> None: ...


class FileDeepSeekBalanceStore:
    """Append-only exact balance-response retention without credentials."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=False)
        self._count = 0

    def record(self, response: RetainedBalanceResponse) -> None:
        self._count += 1
        response_root = self.root / f"balance-{self._count:03d}"
        response_root.mkdir(exist_ok=False)
        (response_root / "response.body").write_bytes(response.body)
        (response_root / "receipt.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/deepseek-balance-receipt/v1",
                    "response_identity": response.identity,
                    "http_status": response.status_code,
                    "duration_ms": response.duration_ms,
                }
            )
            + b"\n"
        )


class DeepSeekHttpBalanceClient:
    """Official balance HTTP Adapter; construction performs no I/O."""

    endpoint = "https://api.deepseek.com/user/balance"

    def __init__(
        self,
        *,
        api_key: str,
        timeout_seconds: float = 30.0,
        urlopen=None,
        monotonic_ns=time.monotonic_ns,
        response_store: BalanceResponseStore | None = None,
    ) -> None:
        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError("DeepSeek API key cannot be empty")
        if timeout_seconds <= 0:
            raise ValueError("DeepSeek balance timeout must be positive")
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._urlopen = urlopen or urllib.request.urlopen
        self._monotonic_ns = monotonic_ns
        self._response_store = response_store

    def query_balance(self) -> BalanceReceipt:
        request = urllib.request.Request(
            self.endpoint,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Accept": "application/json",
                "User-Agent": "workspace-agent-harness/deepseek-live-v0",
            },
            method="GET",
        )
        started = self._monotonic_ns()
        try:
            with self._urlopen(request, timeout=self._timeout_seconds) as response:
                body = response.read()
                status = getattr(response, "status", None)
                if not isinstance(status, int):
                    status = response.getcode()
        except urllib.error.HTTPError as error:
            status = error.code
            body = error.read()
        except urllib.error.URLError as error:
            reason = type(error.reason).__name__
            raise BudgetStop(f"balance_transport_unavailable:{reason}") from None
        except (TimeoutError, OSError) as error:
            raise BudgetStop(
                f"balance_transport_unavailable:{type(error).__name__}"
            ) from None
        retained = RetainedBalanceResponse(
            status_code=status,
            body=body,
            duration_ms=max(0, (self._monotonic_ns() - started) // 1_000_000),
        )
        if self._response_store is not None:
            self._response_store.record(retained)
        return _parse_balance_response(retained)


def _parse_balance_response(response: RetainedBalanceResponse) -> BalanceReceipt:
    if response.status_code != 200:
        raise BudgetStop(f"balance_http_status:{response.status_code}")
    try:
        decoded = json.loads(response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise BudgetStop("balance_response_not_utf8_json") from None
    if not isinstance(decoded, dict) or not isinstance(decoded.get("is_available"), bool):
        raise BudgetStop("balance_response_malformed")
    if decoded["is_available"] is False:
        return BalanceReceipt.unavailable(response.identity)
    balance_infos = decoded.get("balance_infos")
    if not isinstance(balance_infos, list):
        raise BudgetStop("balance_response_malformed")
    cny_infos = [
        item
        for item in balance_infos
        if isinstance(item, dict) and item.get("currency") == "CNY"
    ]
    if len(cny_infos) != 1 or not isinstance(cny_infos[0].get("total_balance"), str):
        raise BudgetStop("balance_cny_entry_invalid")
    try:
        return BalanceReceipt.available_cny(
            cny_infos[0]["total_balance"],
            response.identity,
        )
    except ValueError:
        raise BudgetStop("balance_cny_entry_invalid") from None


class CampaignBudgetMeter:
    """Own call, Token, returned-identity, and CNY stop rules."""

    def __init__(
        self,
        *,
        lock: DeepSeekLiveEvalLock,
        balance_client: BalanceClient,
    ) -> None:
        self._lock = lock
        self._balance_client = balance_client
        self._initial_balance: Decimal | None = None
        self._current_balance: Decimal | None = None
        self._receipts: list[BalanceReceipt] = []
        self._model_calls = 0
        self._input_tokens = 0
        self._output_tokens = 0
        self._total_tokens = 0
        self._maximum_usage_cost_cny = Decimal("0")
        self._active_slot: LiveEvalSlot | None = None
        self._next_slot_sequence = 0
        self._slot_calls = 0
        self._pending_call = False
        self._returned_model: str | None = None
        self._system_fingerprint: str | None = None
        self._stop_code: str | None = None

    @property
    def model_calls(self) -> int:
        return self._model_calls

    @property
    def spent_cny(self) -> Decimal:
        if self._initial_balance is None or self._current_balance is None:
            return Decimal("0")
        return self._initial_balance - self._current_balance

    @property
    def receipts(self) -> tuple[BalanceReceipt, ...]:
        return tuple(self._receipts)

    @property
    def stop_code(self) -> str | None:
        return self._stop_code

    @property
    def token_totals(self) -> tuple[int, int, int]:
        return (self._input_tokens, self._output_tokens, self._total_tokens)

    def preflight(self) -> BalanceReceipt:
        if self._initial_balance is not None or self._receipts:
            raise BudgetStop("balance_preflight_already_completed")
        receipt = self._balance_client.query_balance()
        self._receipts.append(receipt)
        maximum = Decimal(self._lock.maximum_campaign_cost_cny)
        if (
            not receipt.is_available
            or receipt.cny_total is None
            or receipt.cny_total <= 0
            or receipt.cny_total > maximum
        ):
            self._fail("initial_balance_outside_authorization")
        self._initial_balance = receipt.cny_total
        self._current_balance = receipt.cny_total
        return receipt

    def begin_slot(self, slot: LiveEvalSlot) -> None:
        self._ensure_running()
        if self._initial_balance is None:
            raise BudgetStop("balance_preflight_missing")
        if self._active_slot is not None:
            raise BudgetStop("prior_slot_not_settled")
        if (
            slot.sequence != self._next_slot_sequence
            or self._lock.slots[slot.sequence] != slot
        ):
            self._fail("deterministic_slot_order_drift")
        self._active_slot = slot
        self._slot_calls = 0

    def authorize_model_call(self) -> int:
        self._ensure_running()
        if self._active_slot is None:
            raise BudgetStop("active_slot_missing")
        if self._pending_call:
            raise BudgetStop("prior_model_call_unsettled")
        if self._model_calls >= self._lock.maximum_paid_model_calls:
            self._fail("paid_model_call_ceiling_reached")
        if self._slot_calls >= self._active_slot.maximum_model_exchanges:
            self._fail("slot_model_call_ceiling_reached")
        if self.spent_cny >= Decimal(self._lock.maximum_campaign_cost_cny):
            self._fail("campaign_cost_ceiling_reached")
        if self._current_balance is None or self._current_balance <= 0:
            self._fail("balance_exhausted")
        self._model_calls += 1
        self._slot_calls += 1
        self._pending_call = True
        return self._model_calls

    def record_model_call(
        self,
        *,
        usage: ExchangeUsage,
        returned_model: str | None,
        system_fingerprint: str | None,
    ) -> BalanceReceipt:
        if not self._pending_call:
            raise BudgetStop("no_authorized_model_call_to_record")
        receipt = self._balance_client.query_balance()
        self._receipts.append(receipt)
        self._pending_call = False
        if not receipt.is_available or receipt.cny_total is None:
            self._fail("balance_unavailable")
        assert self._initial_balance is not None
        if receipt.cny_total > self._initial_balance:
            self._fail("balance_concurrent_use_or_top_up_drift")
        self._current_balance = receipt.cny_total
        if any(
            value is None
            for value in (usage.input_tokens, usage.output_tokens, usage.total_tokens)
        ):
            self._fail("model_usage_missing")
        assert usage.input_tokens is not None
        assert usage.output_tokens is not None
        assert usage.total_tokens is not None
        if usage.input_tokens + usage.output_tokens != usage.total_tokens:
            self._fail("model_usage_inconsistent")
        budget = self._lock.budget
        maximum_input = budget["maximum_input_tokens_per_call"]
        maximum_output = budget["maximum_output_tokens_per_call"]
        maximum_context = budget["maximum_context_tokens_per_call"]
        campaign_input = budget["campaign_input_token_ceiling"]
        campaign_output = budget["campaign_output_token_ceiling"]
        campaign_combined = budget["campaign_combined_token_ceiling"]
        assert isinstance(maximum_input, int)
        assert isinstance(maximum_output, int)
        assert isinstance(maximum_context, int)
        assert isinstance(campaign_input, int)
        assert isinstance(campaign_output, int)
        assert isinstance(campaign_combined, int)
        if (
            usage.input_tokens > maximum_input
            or usage.output_tokens > maximum_output
            or usage.total_tokens > maximum_context
        ):
            self._fail("model_call_token_ceiling_exceeded")
        self._maximum_usage_cost_cny += _worst_case_peak_cost_cny(
            lock=self._lock,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
        )
        if self.spent_cny > self._maximum_usage_cost_cny + Decimal("0.01"):
            self._fail("balance_concurrent_use_or_pricing_drift")
        self._input_tokens += usage.input_tokens
        self._output_tokens += usage.output_tokens
        self._total_tokens += usage.total_tokens
        if (
            self._input_tokens > campaign_input
            or self._output_tokens > campaign_output
            or self._total_tokens > campaign_combined
        ):
            self._fail("campaign_token_ceiling_exceeded")
        self._record_identity("returned_model", returned_model)
        self._record_identity("system_fingerprint", system_fingerprint)
        return receipt

    def record_not_dispatched(self) -> None:
        """Release one authorization proven not to have crossed Provider dispatch."""

        if not self._pending_call:
            raise BudgetStop("no_authorized_model_call_to_cancel")
        self._pending_call = False
        self._model_calls -= 1
        self._slot_calls -= 1

    def settle_uncertain_dispatch(self) -> BalanceReceipt:
        """Retain the mandatory balance receipt, then stop on unknowable usage."""

        if not self._pending_call:
            raise BudgetStop("no_authorized_model_call_to_record")
        receipt = self._balance_client.query_balance()
        self._receipts.append(receipt)
        self._pending_call = False
        if not receipt.is_available or receipt.cny_total is None:
            self._fail("balance_unavailable")
        assert self._initial_balance is not None
        if receipt.cny_total > self._initial_balance:
            self._fail("balance_concurrent_use_or_top_up_drift")
        self._current_balance = receipt.cny_total
        self._fail("provider_dispatch_uncertain")

    def settle_slot(self) -> None:
        self._ensure_running()
        if self._active_slot is None or self._pending_call:
            raise BudgetStop("slot_cannot_settle_with_active_call")
        self._active_slot = None
        self._next_slot_sequence += 1
        self._slot_calls = 0

    def _record_identity(self, label: str, value: str | None) -> None:
        if value is None:
            return
        current = getattr(self, f"_{label}")
        if current is None:
            setattr(self, f"_{label}", value)
        elif current != value:
            self._fail(f"{label}_drift")

    def _ensure_running(self) -> None:
        if self._stop_code is not None:
            raise BudgetStop(self._stop_code)

    def _fail(self, code: str) -> Never:
        self._stop_code = code
        raise BudgetStop(code)


@dataclass(frozen=True)
class SlotInventoryRecord:
    sequence: int
    slot_id: str
    slot_identity: str
    state: str
    event_log_ref: str | None
    failure_category: str | None
    stop_code: str | None


class FileLiveCampaignStore:
    """Append-only slot settlement Adapter; the lock remains the denominator."""

    def __init__(self, *, root: Path, lock: DeepSeekLiveEvalLock) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=False)
        self._lock = lock
        self._active_slot: LiveEvalSlot | None = None
        self._active_exchange_count = 0
        (self.root / "campaign-lock.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-campaign-anchor/v2",
                    "lock_identity": lock.identity,
                    "parent_stage_a_lock_identity": (
                        lock.parent_stage_a_lock_identity
                    ),
                    "runner_identity": lock.runner_identity,
                    "live_entry_identity": lock.live_entry_identity,
                    "schedule_identity": lock.schedule_identity,
                    "planned_slots": len(lock.slots),
                }
            )
            + b"\n"
        )
        (self.root / "slots").mkdir(exist_ok=False)

    def record_balance_preflight(self, receipt: BalanceReceipt) -> None:
        (self.root / "budget-preflight.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-budget-preflight/v1",
                    "lock_identity": self._lock.identity,
                    "receipt": receipt.identity_material(),
                }
            )
            + b"\n"
        )

    def begin_slot(self, slot: LiveEvalSlot) -> Path:
        if self._active_slot is not None:
            raise ValueError("a campaign slot is already active")
        if self._lock.slots[slot.sequence] != slot:
            raise ValueError("slot is not from the frozen campaign lock")
        slot_root = self.root / "slots" / slot.slot_id
        slot_root.mkdir(exist_ok=False)
        (slot_root / "slot.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-slot-plan/v1",
                    "lock_identity": self._lock.identity,
                    "slot_identity": slot.identity,
                    **slot.identity_material(),
                }
            )
            + b"\n"
        )
        self._active_slot = slot
        self._active_exchange_count = 0
        return slot_root

    def record_exchange_intent(
        self,
        slot: LiveEvalSlot,
        *,
        prepared_turn_identity: str,
    ) -> int:
        """Durably retain one immediate pre-exchange intent before authorization."""

        if self._active_slot != slot:
            raise ValueError("exchange intent requires the active campaign slot")
        if not isinstance(prepared_turn_identity, str) or not prepared_turn_identity:
            raise ValueError("prepared turn identity must be non-empty")
        self._active_exchange_count += 1
        ordinal = self._active_exchange_count
        exchanges_root = self.root / "slots" / slot.slot_id / "exchanges"
        exchanges_root.mkdir(exist_ok=ordinal != 1)
        exchange_root = exchanges_root / f"exchange-{ordinal:03d}"
        exchange_root.mkdir(exist_ok=False)
        (exchange_root / "intent.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-exchange-intent/v1",
                    "lock_identity": self._lock.identity,
                    "slot_identity": slot.identity,
                    "ordinal": ordinal,
                    "prepared_turn_identity": prepared_turn_identity,
                }
            )
            + b"\n"
        )
        return ordinal

    def record_exchange_authorization(
        self,
        slot: LiveEvalSlot,
        *,
        ordinal: int,
        authorization_number: int,
    ) -> None:
        if self._active_slot != slot:
            raise ValueError("exchange authorization requires the active campaign slot")
        exchange_root = self._exchange_root(slot, ordinal)
        (exchange_root / "authorization.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-exchange-authorization/v1",
                    "lock_identity": self._lock.identity,
                    "slot_identity": slot.identity,
                    "ordinal": ordinal,
                    "authorization_number": authorization_number,
                }
            )
            + b"\n"
        )

    def record_exchange_settlement(
        self,
        slot: LiveEvalSlot,
        *,
        ordinal: int,
        outcome: str,
        evidence: Mapping[str, object],
        balance_receipt: BalanceReceipt | None,
        stop_code: str | None,
    ) -> None:
        if self._active_slot != slot:
            raise ValueError("exchange settlement requires the active campaign slot")
        if outcome not in {"settled", "failed", "not-dispatched", "uncertain"}:
            raise ValueError("unknown exchange settlement outcome")
        exchange_root = self._exchange_root(slot, ordinal)
        (exchange_root / "settlement.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-exchange-settlement/v1",
                    "lock_identity": self._lock.identity,
                    "slot_identity": slot.identity,
                    "ordinal": ordinal,
                    "outcome": outcome,
                    "evidence": dict(evidence),
                    "balance_receipt": (
                        None
                        if balance_receipt is None
                        else balance_receipt.identity_material()
                    ),
                    "stop_code": stop_code,
                }
            )
            + b"\n"
        )

    def settle_slot(
        self,
        slot: LiveEvalSlot,
        *,
        state: str,
        event_log_ref: str,
        failure_category: str | None,
    ) -> None:
        if self._active_slot != slot:
            raise ValueError("only the active campaign slot may settle")
        if state not in {"completed", "failed"}:
            raise ValueError("executed slot state must be completed or failed")
        if not isinstance(event_log_ref, str) or not event_log_ref:
            raise ValueError("settled slot requires an Event Log reference")
        if state == "completed" and failure_category is not None:
            raise ValueError("completed slot cannot contain a failure category")
        if state == "failed" and (
            not isinstance(failure_category, str) or not failure_category
        ):
            raise ValueError("failed slot requires a failure category")
        slot_root = self.root / "slots" / slot.slot_id
        (slot_root / "attempt.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-slot-attempt/v1",
                    "lock_identity": self._lock.identity,
                    "slot_identity": slot.identity,
                    "slot_id": slot.slot_id,
                    "state": state,
                    "event_log_ref": event_log_ref,
                    "failure_category": failure_category,
                }
            )
            + b"\n"
        )
        self._active_slot = None
        self._active_exchange_count = 0

    def _exchange_root(self, slot: LiveEvalSlot, ordinal: int) -> Path:
        if (
            isinstance(ordinal, bool)
            or not isinstance(ordinal, int)
            or not 1 <= ordinal <= self._active_exchange_count
        ):
            raise ValueError("exchange ordinal is outside the active slot")
        root = (
            self.root
            / "slots"
            / slot.slot_id
            / "exchanges"
            / f"exchange-{ordinal:03d}"
        )
        if not root.is_dir():
            raise ValueError("exchange intent is not durably retained")
        return root

    def record_stop(self, *, after_sequence: int, code: str) -> None:
        if (
            self._active_slot is not None
            and self._active_slot.sequence != after_sequence
        ):
            raise ValueError("campaign stop cannot skip an unsettled active slot")
        if (
            isinstance(after_sequence, bool)
            or not isinstance(after_sequence, int)
            or not -1 <= after_sequence < len(self._lock.slots)
        ):
            raise ValueError("campaign stop sequence is outside the lock")
        if not isinstance(code, str) or not code:
            raise ValueError("campaign stop code must be non-empty")
        (self.root / "campaign-stop.json").write_bytes(
            canonical_json_bytes(
                {
                    "schema": "workspace-agent-harness/live-campaign-stop/v1",
                    "lock_identity": self._lock.identity,
                    "after_sequence": after_sequence,
                    "code": code,
                }
            )
            + b"\n"
        )


def reconstruct_slot_inventory(
    *,
    lock: DeepSeekLiveEvalLock,
    root: Path,
) -> tuple[SlotInventoryRecord, ...]:
    """Rebuild all denominator states without Gateway or tool access."""

    campaign_root = Path(root)
    anchor = _read_json_object(campaign_root / "campaign-lock.json")
    if anchor != {
        "schema": "workspace-agent-harness/live-campaign-anchor/v2",
        "lock_identity": lock.identity,
        "parent_stage_a_lock_identity": lock.parent_stage_a_lock_identity,
        "runner_identity": lock.runner_identity,
        "live_entry_identity": lock.live_entry_identity,
        "schedule_identity": lock.schedule_identity,
        "planned_slots": len(lock.slots),
    }:
        raise ValueError("live campaign anchor identity drift")
    stop_path = campaign_root / "campaign-stop.json"
    stop_after: int | None = None
    stop_code: str | None = None
    if stop_path.exists():
        stop = _read_json_object(stop_path)
        if (
            stop.get("schema") != "workspace-agent-harness/live-campaign-stop/v1"
            or stop.get("lock_identity") != lock.identity
            or isinstance(stop.get("after_sequence"), bool)
            or not isinstance(stop.get("after_sequence"), int)
            or not isinstance(stop.get("code"), str)
        ):
            raise ValueError("live campaign stop identity drift")
        stop_after = cast(int, stop["after_sequence"])
        stop_code = cast(str, stop["code"])
    records: list[SlotInventoryRecord] = []
    for slot in lock.slots:
        state: str
        event_log_ref: str | None
        failure_category: str | None
        record_stop_code: str | None
        attempt_path = campaign_root / "slots" / slot.slot_id / "attempt.json"
        if attempt_path.exists():
            attempt = _read_json_object(attempt_path)
            if (
                attempt.get("schema") != "workspace-agent-harness/live-slot-attempt/v1"
                or attempt.get("lock_identity") != lock.identity
                or attempt.get("slot_identity") != slot.identity
                or attempt.get("slot_id") != slot.slot_id
                or attempt.get("state") not in {"completed", "failed"}
                or not isinstance(attempt.get("event_log_ref"), str)
            ):
                raise ValueError(f"live slot attempt identity drift: {slot.slot_id}")
            state = cast(str, attempt["state"])
            event_log_ref = cast(str, attempt["event_log_ref"])
            failure_category = cast(str | None, attempt.get("failure_category"))
            if state == "completed" and failure_category is not None:
                raise ValueError(f"completed slot contains failure: {slot.slot_id}")
            if state == "failed" and not isinstance(failure_category, str):
                raise ValueError(f"failed slot lacks attribution: {slot.slot_id}")
            record_stop_code = None
        elif stop_after is not None and slot.sequence > stop_after:
            state = "skipped-by-stop-rule"
            event_log_ref = None
            failure_category = None
            record_stop_code = stop_code
        else:
            state = "missing"
            event_log_ref = None
            failure_category = None
            record_stop_code = None
        records.append(
            SlotInventoryRecord(
                sequence=slot.sequence,
                slot_id=slot.slot_id,
                slot_identity=slot.identity,
                state=state,
                event_log_ref=event_log_ref,
                failure_category=failure_category,
                stop_code=record_stop_code,
            )
        )
    return tuple(records)


def load_deepseek_live_eval_lock(path: Path | None = None) -> DeepSeekLiveEvalLock:
    selected = LOCK_PATH if path is None else Path(path)
    raw_bytes = selected.read_bytes()
    try:
        raw = json.loads(raw_bytes)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("DeepSeek live lock is not UTF-8 JSON") from error
    if not isinstance(raw, dict) or raw.get("schema") != LOCK_SCHEMA:
        raise ValueError("unsupported DeepSeek live lock schema")
    claimed = raw.get("content_hash")
    material = dict(raw)
    material.pop("content_hash", None)
    computed = identity_sha256(material)
    if claimed != computed or computed != EXPECTED_LOCK_IDENTITY:
        raise ValueError("DeepSeek live lock identity drift")
    if raw.get("stage") != "stage-a-r-zero-paid-calls":
        raise ValueError("DeepSeek live lock Stage A-R identity drift")
    execution = _mapping(raw, "execution")
    if dict(execution) != {
        "parent_stage_a_lock_identity": PARENT_STAGE_A_LOCK_IDENTITY,
        "runner_version": BUDGETED_RUNNER_VERSION,
        "runner_identity": BUDGETED_RUNNER_IDENTITY,
        "live_entry_version": LIVE_ENTRY_VERSION,
        "live_entry_identity": LIVE_ENTRY_IDENTITY,
        "serial_order": "exact-frozen-slot-sequence",
        "maximum_retries": 0,
    }:
        raise ValueError("DeepSeek live runner identity drift")

    manifest = load_behavioral_eval_manifest()
    suite = _mapping(raw, "behavioral_suite")
    provider = _mapping(raw, "provider")
    translation = _mapping(raw, "translation")
    budget = _mapping(raw, "budget")
    pricing = _mapping(raw, "pricing_snapshot")
    _validate_provider(provider)
    _validate_translation(translation)
    _validate_suite(suite, manifest)
    _validate_budget(budget)
    _validate_pricing(pricing)
    expected_manifest_sha = _sha256(MANIFEST_PATH)
    if suite.get("manifest_file_sha256") != expected_manifest_sha:
        raise ValueError("Behavioral Eval manifest file identity drift")
    fixture_sha = _sha256(_TRANSLATION_FIXTURE_MANIFEST)
    if raw.get("historical_translation_fixture_manifest_sha256") != fixture_sha:
        raise ValueError("historical Translation fixture manifest identity drift")
    stop_rules = raw.get("stop_rules")
    if not isinstance(stop_rules, list) or len(stop_rules) != 10 or not all(
        isinstance(rule, str) and rule for rule in stop_rules
    ):
        raise ValueError("DeepSeek live stop rules drift")
    slots = _build_slots(manifest, repetitions=5)
    if len(slots) != 120:
        raise AssertionError("frozen Stage A schedule must contain 120 slots")
    return DeepSeekLiveEvalLock(
        identity=computed,
        source_path=selected,
        parent_stage_a_lock_identity=PARENT_STAGE_A_LOCK_IDENTITY,
        runner_identity=BUDGETED_RUNNER_IDENTITY,
        live_entry_identity=LIVE_ENTRY_IDENTITY,
        suite_id=manifest.suite_id,
        manifest_identity=manifest.identity,
        repetitions=5,
        maximum_paid_model_calls=600,
        maximum_campaign_cost_cny="15.00",
        budget=budget,
        pricing_snapshot=pricing,
        stop_rules=tuple(stop_rules),
        historical_translation_fixture_manifest_sha256=fixture_sha,
        slots=slots,
    )


def build_zero_call_dry_run(*, lock: DeepSeekLiveEvalLock) -> dict[str, object]:
    """Enumerate the complete frozen denominator without any I/O Adapter."""

    counts = {
        policy: sum(slot.loop_policy_id == policy for slot in lock.slots)
        for policy in _POLICIES
    }
    budget = lock.budget
    return {
        "schema": "workspace-agent-harness/deepseek-live-zero-call-dry-run/v2",
        "stage": "stage-a-r-zero-paid-calls",
        "lock_identity": lock.identity,
        "parent_stage_a_lock_identity": lock.parent_stage_a_lock_identity,
        "runner_identity": lock.runner_identity,
        "live_entry_identity": lock.live_entry_identity,
        "suite_id": lock.suite_id,
        "suite_identity": lock.manifest_identity,
        "behavioral_manifest_file_sha256": _sha256(MANIFEST_PATH),
        "historical_translation_fixture_manifest_sha256": (
            lock.historical_translation_fixture_manifest_sha256
        ),
        "model_profile_identity": locked_deepseek_model_profile().identity,
        "schedule_identity": lock.schedule_identity,
        "pricing_snapshot_identity": identity_sha256(lock.pricing_snapshot),
        "planned_slots": len(lock.slots),
        "slots_per_arm": counts,
        "maximum_paid_model_calls": lock.maximum_paid_model_calls,
        "formal_token_envelope": {
            "input_tokens": budget["campaign_input_token_ceiling"],
            "output_tokens": budget["campaign_output_token_ceiling"],
            "combined_tokens": budget["campaign_combined_token_ceiling"],
        },
        "maximum_campaign_cost_cny": lock.maximum_campaign_cost_cny,
        "stop_rules": list(lock.stop_rules),
        "slots": [
            {**slot.identity_material(), "slot_identity": slot.identity}
            for slot in lock.slots
        ],
        "live_model_calls": 0,
        "balance_queries": 0,
        "causal_result": None,
    }


def _build_slots(
    manifest: BehavioralManifest,
    *,
    repetitions: int,
) -> tuple[LiveEvalSlot, ...]:
    slots: list[LiveEvalSlot] = []
    for case in manifest.cases:
        bindings = tuple(
            DeepSeekToolBinding(
                runtime_tool=definition.action_tool,
                provider_parameters=definition.parameters,
            )
            for definition in case.tools
        )
        translation_identity = DeepSeekLiveTranslationAdapter(
            profile=locked_deepseek_model_profile(),
            tool_bindings=bindings,
        ).identity
        context_policy_identity = deepseek_live_context_policy_identity(
            tuple(binding.runtime_tool for binding in bindings)
        )
        for repetition in range(1, repetitions + 1):
            digest = hashlib.sha256(
                f"{manifest.suite_id}\0{case.case_id}\0{repetition}".encode("utf-8")
            ).digest()
            order = (
                (ACT_ONCE_POLICY_ID, OBSERVATION_FEEDBACK_POLICY_ID)
                if digest[-1] & 1 == 0
                else (OBSERVATION_FEEDBACK_POLICY_ID, ACT_ONCE_POLICY_ID)
            )
            for policy in order:
                sequence = len(slots)
                slots.append(
                    LiveEvalSlot(
                        sequence=sequence,
                        slot_id=(
                            f"dsv0-{case.case_id.lower()}-r{repetition}-"
                            f"{'act' if policy == ACT_ONCE_POLICY_ID else 'feedback'}"
                        ),
                        case_id=case.case_id,
                        case_identity=case.identity,
                        tool_set_id=case.tool_set_id,
                        loop_policy_id=policy,
                        repetition=repetition,
                        maximum_model_exchanges=5,
                        translation_identity=translation_identity,
                        context_policy_identity=context_policy_identity,
                    )
                )
    return tuple(slots)


def deepseek_live_context_policy(tools: tuple[ActionTool, ...]) -> ContextPolicy:
    profile = locked_deepseek_model_profile()
    return ContextPolicy(
        verified_context_window=profile.context_window_tokens,
        requested_output_room=profile.max_output_tokens,
        protocol_tool_overhead_tokens=512,
        overhead_estimator_id="deepseek-live-translation-overhead/v1",
        overhead_source=(
            "DeepSeek stable Chat Completions native tools; frozen Stage A estimate"
        ),
        overhead_confidence="medium",
        overhead_tool_set_identity=action_tool_set_identity(tools),
        system_policy_identity="behavioral-eval-system-policy/v1",
        context_window_source=profile.capability_source,
        context_window_confidence="high",
    )


def deepseek_live_context_policy_identity(tools: tuple[ActionTool, ...]) -> str:
    policy = deepseek_live_context_policy(tools)
    estimator = CanonicalJsonTokenEstimator()
    return identity_sha256(
        {
            "policy": policy.identity_material(),
            "input_estimator_identity": estimator.identity,
            "input_estimator_source": estimator.source,
            "input_estimator_confidence": estimator.confidence,
        }
    )


def deepseek_live_context_projector(
    tools: tuple[ActionTool, ...],
) -> SemanticContextProjector:
    return SemanticContextProjector(
        policy=deepseek_live_context_policy(tools),
        estimator=CanonicalJsonTokenEstimator(),
        artifact_store=InMemoryArtifactStore(),
    )


def _worst_case_peak_cost_cny(
    *,
    lock: DeepSeekLiveEvalLock,
    input_tokens: int,
    output_tokens: int,
) -> Decimal:
    peak = lock.pricing_snapshot.get("peak")
    if not isinstance(peak, Mapping):
        raise BudgetStop("pricing_snapshot_malformed")
    input_rate = peak.get("cache_miss_input")
    output_rate = peak.get("output")
    if not isinstance(input_rate, str) or not isinstance(output_rate, str):
        raise BudgetStop("pricing_snapshot_malformed")
    try:
        return (
            Decimal(input_tokens) * Decimal(input_rate)
            + Decimal(output_tokens) * Decimal(output_rate)
        ) / Decimal(1_000_000)
    except InvalidOperation:
        raise BudgetStop("pricing_snapshot_malformed") from None


def _validate_provider(provider: Mapping[str, object]) -> None:
    profile = locked_deepseek_model_profile()
    expected = {
        "name": profile.provider,
        "requested_model": profile.requested_model,
        "endpoint": profile.endpoint,
        "wire": "openai-compatible-chat-completions",
        "stream": False,
        "thinking": profile.thinking,
        "reasoning_effort": profile.reasoning_effort,
        "sampling_parameters": "omitted-in-thinking-mode",
        "tool_choice": "required",
        "provider_strict": False,
        "context_window_tokens": profile.context_window_tokens,
        "maximum_output_tokens": profile.max_output_tokens,
        "capability_observed_on": profile.capability_observed_on,
        "capability_source": profile.capability_source,
    }
    if dict(provider) != expected:
        raise ValueError("DeepSeek Provider profile identity drift")


def _validate_translation(translation: Mapping[str, object]) -> None:
    if translation.get("version") != DEEPSEEK_LIVE_TRANSLATION_VERSION:
        raise ValueError("DeepSeek Translation version drift")
    if translation.get("system_prompt_sha256") != identity_sha256(
        DEEPSEEK_LIVE_SYSTEM_PROMPT
    ):
        raise ValueError("DeepSeek Translation system prompt drift")
    if translation.get("history_carrier") != "native-tool-calls":
        raise ValueError("DeepSeek Translation history carrier drift")
    if translation.get("reasoning_carrier") != "reasoning_content-restricted":
        raise ValueError("DeepSeek Translation reasoning carrier drift")
    if translation.get("executable_argument_carrier") != "command-only":
        raise ValueError("DeepSeek Translation executable carrier drift")
    if translation.get("maximum_actions_per_turn") != 1:
        raise ValueError("DeepSeek Translation action count drift")
    if translation.get("terminal_tools") != ["complete", "abstain"]:
        raise ValueError("DeepSeek terminal tool drift")
    if translation.get("abstention_reason_codes") != [
        "insufficient_evidence",
        "authority_denied",
    ]:
        raise ValueError("DeepSeek abstention reason drift")


def _validate_suite(suite: Mapping[str, object], manifest: BehavioralManifest) -> None:
    if suite.get("suite_id") != manifest.suite_id:
        raise ValueError("Behavioral Eval suite ID drift")
    if suite.get("manifest_identity") != manifest.identity:
        raise ValueError("Behavioral Eval manifest identity drift")
    if suite.get("case_order") != [case.case_id for case in manifest.cases]:
        raise ValueError("Behavioral Eval case order drift")
    if suite.get("loop_policy_ids") != list(_POLICIES):
        raise ValueError("Behavioral Eval Loop Policy arms drift")
    expected = {
        "repetitions": 5,
        "maximum_model_exchanges_per_run": 5,
        "maximum_tool_steps_per_run": 4,
        "protocol_repairs": 0,
        "context_overflow_recoveries": 1,
        "system_policy_identity": "behavioral-eval-system-policy/v1",
    }
    for key, value in expected.items():
        if suite.get(key) != value:
            raise ValueError(f"Behavioral Eval {key} drift")


def _validate_budget(budget: Mapping[str, object]) -> None:
    expected = {
        "planned_runs": 120,
        "maximum_paid_model_calls": 600,
        "maximum_campaign_cost_cny": "15.00",
        "maximum_context_tokens_per_call": 1_000_000,
        "maximum_input_tokens_per_call": 616_000,
        "maximum_output_tokens_per_call": 384_000,
        "campaign_input_token_ceiling": 369_600_000,
        "campaign_output_token_ceiling": 230_400_000,
        "campaign_combined_token_ceiling": 600_000_000,
        "balance_endpoint": "https://api.deepseek.com/user/balance",
        "balance_currency": "CNY",
        "initial_balance_rule": "positive-and-no-greater-than-CNY-15.00",
        "balance_query_policy": "before-first-and-after-every-paid-exchange",
        "concurrent_balance_use": "forbidden",
    }
    if dict(budget) != expected:
        raise ValueError("DeepSeek campaign budget identity drift")


def _validate_pricing(pricing: Mapping[str, object]) -> None:
    if pricing.get("observed_on") != "2026-08-28":
        raise ValueError("DeepSeek pricing observation date drift")
    if pricing.get("source") != "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/":
        raise ValueError("DeepSeek pricing source drift")
    if pricing.get("execution_preference") != "off-peak-Beijing-time":
        raise ValueError("DeepSeek execution-window preference drift")


def _mapping(value: Mapping[str, object], key: str) -> Mapping[str, object]:
    selected = value.get(key)
    if not isinstance(selected, Mapping):
        raise ValueError(f"DeepSeek live lock {key} must be an object")
    return selected


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _read_json_object(path: Path) -> dict[str, object]:
    try:
        decoded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read retained campaign artifact: {path.name}") from error
    if not isinstance(decoded, dict):
        raise ValueError(f"retained campaign artifact must be an object: {path.name}")
    return decoded


__all__ = [
    "ACT_ONCE_POLICY_ID",
    "BUDGETED_RUNNER_IDENTITY",
    "BUDGETED_RUNNER_VERSION",
    "BalanceReceipt",
    "BudgetStop",
    "CampaignBudgetMeter",
    "DeepSeekLiveEvalLock",
    "FileLiveCampaignStore",
    "LiveEvalSlot",
    "LIVE_ENTRY_IDENTITY",
    "LIVE_ENTRY_VERSION",
    "OBSERVATION_FEEDBACK_POLICY_ID",
    "PARENT_STAGE_A_LOCK_IDENTITY",
    "build_zero_call_dry_run",
    "deepseek_live_context_policy",
    "deepseek_live_context_policy_identity",
    "deepseek_live_context_projector",
    "load_deepseek_live_eval_lock",
    "reconstruct_slot_inventory",
]
