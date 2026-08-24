# Protocol Reliability v1.2: 16K Maximum-Token Extension

Status: Human-authorized post-v1.1 extension, frozen after v1.1 completed and before any 16K call; 25/25 calls completed as Working Agent candidate Evidence. It is intentionally a separate experiment identity rather than a retroactive v1.1 arm.

## Decision question

> When the same five prior Strict/ReAct length-hit Contexts receive a 16,384-token output ceiling, do the malformed generations naturally close after 8K, or continue as runaway output toward the new ceiling?

The executable lock is [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json), with content hash `sha256:ec482621415d795e5ff26badbde7b0dbead1e524dd0f96543730784dc9f3074f`.

## Frozen lineage and matrix

The config locks both the original protocol-reliability-v1 raw source and the completed v1.1 summary plus raw-artifact manifest. The v1.1 baseline cannot be regenerated or replaced after observing 16K results.

| Axis | Frozen value |
|---|---|
| Contexts | the same five verified v1 length-hit ReAct contexts |
| Transport | Strict Function Calling Beta |
| Requested maximum completion Tokens | 16,384 |
| Repetitions | five per Context |
| Repair | disabled |
| Raw calls | 25 |
| Execution | deterministic order, concurrency one, no retry |

An equivalence test compares the 8K and 16K payloads after removing `max_tokens`; every other request field must be identical. The raw response body is retained losslessly.

## Interpretation boundary

- **Late natural close:** materially fewer cap hits and materially more bounded L3 actions than the locked 8K baseline.
- **Runaway persists:** continued cap hits and repeated DSML/invoke markers without a material L3 gain.
- **Mixed:** Context-dependent effects or substitution of length failures with other L1–L3 failures.

The 16K arm was requested after seeing v1.1 progress and is reported as an extension, not a preregistered v1.1 condition. It measures dated provider-by-protocol behavior only. It is not evidence of task quality, provider-wide reliability, a SWE-bench score, a Verified Project Fact, or a resume fact.

The completed result is recorded in [`../evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md`](../evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md) and remains pending independent Regulator review.
