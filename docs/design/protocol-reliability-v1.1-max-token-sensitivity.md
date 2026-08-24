# Protocol Reliability v1.1: Maximum-Token Sensitivity

Status: Human-authorized frozen sensitivity design; 75/75 calls completed as Working Agent candidate Evidence. No result is recorded as a Verified Project Fact without independent Regulator review.

## Decision question

> Were the 21 Strict/ReAct failures ending with `finish_reason=length` in protocol-reliability-v1 primarily caused by the experiment's requested 2,048-token output cap, or was that cap limiting an already runaway malformed generation?

This is a narrow sensitivity check, not a rerun of the full protocol experiment. It changes only the requested maximum completion-token value.

## Frozen source and selection

The executable lock is [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.1-max-token-sensitivity.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.1-max-token-sensitivity.json), with content hash `sha256:1ee9454c34765b4c274eaee897d3884e71bad8dccaf2093fd8db41ef2de21850`.

Before any provider call, the runner verifies the parent v1 config, context corpus, corrected summary, and raw-artifact manifest hashes. It then proves that the selected five ReAct contexts exactly cover all 21 parent Strict original responses that simultaneously:

- ended with `finish_reason=length`;
- consumed exactly 2,048 completion Tokens;
- failed to decode valid function arguments.

No context is selected from a handwritten or synthetic distribution.

## Frozen matrix

| Axis | Values |
|---|---|
| Contexts | the five verified parent length-hit ReAct contexts |
| Transport | Strict Function Calling Beta only |
| Requested maximum completion Tokens | 2,048; 4,096; 8,192 |
| Repetitions | five per context and arm |
| Repair | disabled |
| Raw calls | 5 × 3 × 5 = 75 |
| Execution | deterministic order, concurrency one, no provider retry |

The model, endpoint, historical messages, system prompt, function schemas, thinking setting, temperature, streaming setting, and timeout remain inherited from v1. A payload equivalence test removes `max_tokens` and requires the three arms to be identical.

## Measurements

Each arm reports unconditional L0–L3 validity with exact numerators, denominators, and Wilson 95% intervals; earliest failure; `finish_reason`; completion-token usage; exact cap hits; argument character length; and counts of DSML, end-of-thinking, and invoke markers. Results are also split by context and retain dated model, endpoint, and non-empty `system_fingerprint` identity.

Marker counts are diagnostics, not hidden-thought interpretation. The raw provider body is retained losslessly; the Harness does not shorten or compress it after receipt.

## Frozen interpretation rule

- **Cap confound supported:** higher arms materially reduce `length` endings and raise L3 without persistent runaway markers.
- **Runaway limiter supported:** higher arms preserve or extend length/DSML/runaway behavior instead of producing bounded L3 actions.
- **Mixed:** effects differ by context, or fewer length endings trade off against other L1–L3 failures.

This result can only qualify the v1 transport interpretation. It does not measure action correctness, task success, provider-wide reliability, Harness reuse, or SWE-bench performance. Generated artifacts live under ignored `.runs/protocol-reliability-v1.1-max-token-sensitivity/` and require independent Regulator review before promotion.

The completed result and its separately identified 16K extension are recorded in [`../evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md`](../evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md).
