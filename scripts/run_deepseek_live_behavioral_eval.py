#!/usr/bin/env python3
"""Preview by default; execute only after an exact repaired-lock acknowledgement."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from workspace_agent_harness.behavioral_eval import BehavioralCase
from workspace_agent_harness.deepseek_live import (
    DeepSeekHttpTransport,
    DeepSeekLiveTranslationAdapter,
    DeepSeekModelGateway,
    DeepSeekToolBinding,
    FileDeepSeekExchangeStore,
    locked_deepseek_model_profile,
)
from workspace_agent_harness.deepseek_live_campaign import (
    DeepSeekHttpBalanceClient,
    FileDeepSeekBalanceStore,
    RetainedBalanceResponse,
    build_zero_call_dry_run,
    load_deepseek_live_eval_lock,
)
from workspace_agent_harness.deepseek_live_runner import (
    BudgetedSerialCampaignRunner,
    required_live_acknowledgement,
)


class _LazyBalanceStore:
    """Delay creation until the acknowledged runner has claimed its root."""

    def __init__(self, root: Path) -> None:
        self._root = root
        self._delegate: FileDeepSeekBalanceStore | None = None

    def record(self, response: RetainedBalanceResponse) -> None:
        if self._delegate is None:
            self._delegate = FileDeepSeekBalanceStore(self._root)
        self._delegate.record(response)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Preview the repaired 120-slot campaign with zero calls by default; "
            "live execution requires the exact printed identity acknowledgement."
        )
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="New preview JSON path, or new campaign directory with --live.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Enter the acknowledged production runner; never used for preview.",
    )
    parser.add_argument(
        "--acknowledgement",
        help="Exact execute-live identity string required with --live.",
    )
    arguments = parser.parse_args(argv)
    lock = load_deepseek_live_eval_lock()

    if not arguments.live:
        document = build_zero_call_dry_run(lock=lock)
        body = json.dumps(
            document,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ) + "\n"
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        with arguments.output.open("x", encoding="utf-8") as stream:
            stream.write(body)
        print(f"output={arguments.output}")
        print(f"sha256={hashlib.sha256(body.encode('utf-8')).hexdigest()}")
        print(f"required_live_acknowledgement={required_live_acknowledgement(lock)}")
        print("planned_slots=120")
        print("balance_queries=0")
        print("live_model_calls=0")
        print("cost=CNY 0")
        return 0

    required = required_live_acknowledgement(lock)
    if arguments.acknowledgement != required:
        parser.error("--live requires the exact repaired-lock acknowledgement")

    # This credential boundary is unreachable from preview, help, invalid arguments,
    # missing acknowledgement, import, or runner construction.
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not isinstance(api_key, str) or not api_key.strip():
        parser.error("DEEPSEEK_API_KEY is required after live acknowledgement")

    balance_client = DeepSeekHttpBalanceClient(
        api_key=api_key,
        response_store=_LazyBalanceStore(arguments.output / "balance-responses"),
    )

    def gateway_factory(case: BehavioralCase, slot_root: Path) -> DeepSeekModelGateway:
        bindings = tuple(
            DeepSeekToolBinding(
                runtime_tool=definition.action_tool,
                provider_parameters=definition.parameters,
            )
            for definition in case.tools
        )
        return DeepSeekModelGateway(
            adapter=DeepSeekLiveTranslationAdapter(
                profile=locked_deepseek_model_profile(),
                tool_bindings=bindings,
            ),
            transport=DeepSeekHttpTransport(api_key=api_key),
            exchange_store=FileDeepSeekExchangeStore(
                slot_root / "provider-exchanges"
            ),
        )

    report = BudgetedSerialCampaignRunner(
        lock=lock,
        artifacts_root=arguments.output,
        balance_client=balance_client,
        gateway_factory=gateway_factory,
    ).run(acknowledgement=arguments.acknowledgement)
    print(report.canonical_json(), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
