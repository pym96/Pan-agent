#!/usr/bin/env python3
"""Enumerate the typed Translation Adapter 2x2 without provider calls."""

from __future__ import annotations

import json

from workspace_agent_harness.translation import (
    AssistantToolCall,
    CanonicalConversation,
    CanonicalToolCall,
    ModelProfile,
    ProviderControlledOutput,
    ToolResultMessage,
    UserMessage,
    bash_finish_tools,
)
from workspace_agent_harness.translation_diagnostics import (
    TranslationDiagnosticPlan,
    build_translation_dry_run,
)


def main() -> int:
    conversation = CanonicalConversation(
        (
            UserMessage("Inspect the isolated repository and repair the issue."),
            AssistantToolCall(
                CanonicalToolCall("call_fixture_1", "bash", {"command": "pwd"}),
                reasoning="Inspect the working directory first.",
            ),
            ToolResultMessage(
                call_id="call_fixture_1",
                tool_name="bash",
                content="/testbed\n",
            ),
        )
    )
    profile = ModelProfile(
        provider="DeepSeek",
        model="deepseek-v4-flash",
        endpoint="https://api.deepseek.com/beta/chat/completions",
        max_output_tokens=ProviderControlledOutput(
            "dry-run-only; paid matrix must freeze its own explicit ceiling"
        ),
        temperature=0,
        thinking="disabled",
    )
    dry_run = build_translation_dry_run(
        TranslationDiagnosticPlan(
            model_profile=profile,
            conversation=conversation,
            tools=bash_finish_tools(),
            repetitions=5,
        )
    )
    print(json.dumps(dry_run, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
