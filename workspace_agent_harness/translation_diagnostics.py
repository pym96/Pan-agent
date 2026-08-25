from __future__ import annotations

from dataclasses import dataclass

from .deepseek_translation import (
    PROMPT_VERSION,
    DeepSeekTranslationAdapter,
    diagnostic_system_prompt,
)
from .translation import (
    ActionTool,
    CanonicalConversation,
    HistoryCarrier,
    ModelProfile,
    ReasoningCarrier,
    TranslationConfig,
    identity_sha256,
)


@dataclass(frozen=True)
class TranslationDiagnosticPlan:
    model_profile: ModelProfile
    conversation: CanonicalConversation
    tools: tuple[ActionTool, ...]
    repetitions: int

    def __post_init__(self) -> None:
        if self.repetitions <= 0:
            raise ValueError("diagnostic repetitions must be positive")


def build_translation_dry_run(plan: TranslationDiagnosticPlan) -> dict[str, object]:
    """Enumerate the frozen 2x2 factors without invoking a provider transport."""

    tool_set_id = identity_sha256(
        [tool.identity_material() for tool in plan.tools]
    )
    repetition_plan_id = identity_sha256(
        {
            "repetitions": plan.repetitions,
            "execution_order": "cell-order-then-ascending-repetition",
        }
    )
    cells: list[dict[str, object]] = []
    for history in (
        HistoryCarrier.LEGACY_JSON_TEXT,
        HistoryCarrier.NATIVE_TOOL_CALLS,
    ):
        for reasoning in (
            ReasoningCarrier.THOUGHT_IN_ARGUMENTS,
            ReasoningCarrier.COMMAND_ONLY,
        ):
            config = TranslationConfig(
                model_profile=plan.model_profile,
                history_carrier=history,
                reasoning_carrier=reasoning,
                system_prompt=diagnostic_system_prompt(reasoning),
                prompt_version=PROMPT_VERSION,
            )
            request = DeepSeekTranslationAdapter(config).encode_request(
                plan.conversation,
                plan.tools,
            )
            cells.append(
                {
                    "cell_id": f"{history.value}__{reasoning.value}",
                    "history_carrier": history.value,
                    "reasoning_carrier": reasoning.value,
                    "model_profile_id": request.model_profile_id,
                    "context_id": request.conversation_id,
                    "tool_set_id": tool_set_id,
                    "repetition_plan_id": repetition_plan_id,
                    "translation_config_id": request.translation_config_id,
                    "request_payload_sha256": request.payload_sha256,
                }
            )
    return {
        "schema": "workspace-agent-harness/translation-diagnostic-dry-run/v1",
        "live_calls": 0,
        "causal_result": None,
        "interpretation": "Enumeration only; no provider or task outcome was measured.",
        "fixed": {
            "provider": plan.model_profile.provider,
            "model": plan.model_profile.model,
            "endpoint": plan.model_profile.endpoint,
            "model_profile_id": plan.model_profile.identity,
            "model_profile": plan.model_profile.identity_material(),
            "context_id": plan.conversation.identity,
            "tool_set_id": tool_set_id,
            "sampling": {"temperature": plan.model_profile.temperature},
            "thinking": plan.model_profile.thinking,
            "repetitions": plan.repetitions,
            "repetition_plan_id": repetition_plan_id,
        },
        "factor_order": ["history_carrier", "reasoning_carrier"],
        "cells": cells,
    }


__all__ = ["TranslationDiagnosticPlan", "build_translation_dry_run"]
