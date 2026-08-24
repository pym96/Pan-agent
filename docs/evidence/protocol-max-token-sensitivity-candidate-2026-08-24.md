# Protocol Maximum-Token Sensitivity | Working Agent candidate Evidence

Status: complete 75-slot v1.1 matrix plus complete 25-slot Human-requested 16K extension; pending a new independent Regulator review. This document cannot register a Verified Project Fact or resume fact.

## Question and causal boundary

Protocol-reliability-v1 requested `max_tokens=2048`. Of its 26 Strict original invalid-arguments failures, 21 returned exactly 2,048 completion Tokens with `finish_reason=length`. This sensitivity check asks whether those responses were merely normal actions cut slightly too early, or malformed generations that continued toward successively higher ceilings.

The experimental variable is the requested maximum completion Tokens. The Harness does not truncate or compress a successful HTTP response after receipt: every returned response body is retained losslessly and its SHA-256 is bound into the attempt.

## Frozen identity and provenance

### v1.1 preregistered sensitivity

- Config: [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.1-max-token-sensitivity.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.1-max-token-sensitivity.json), `sha256:1ee9454c34765b4c274eaee897d3884e71bad8dccaf2093fd8db41ef2de21850`.
- Matrix: the five real ReAct contexts that exactly cover all 21 parent Strict `length@2048` failures × 2,048/4,096/8,192 × five repetitions; Strict Function Calling only; no repair; 75 calls.
- Raw root: `.runs/protocol-reliability-v1.1-max-token-sensitivity/`.
- Raw manifest: `sha256:042ea1f38c17f75140e76b6b3fa0c5e7fec2b21702313ba2eed11d0fce1558aa`.
- Summary: `.runs/protocol-reliability-v1.1-max-token-sensitivity-summary.json`, SHA-256 `d1f1e0dee9f3b3c1320ff88a2226ec52165de85f517f7ffd5a1ffdc3b557aaef`.
- Window: 2026-08-24 02:11:31–02:32:07 UTC (10:11:31–10:32:07 Asia/Shanghai).

### v1.2 post-v1.1 16K extension

- Config: [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json), `sha256:ec482621415d795e5ff26badbde7b0dbead1e524dd0f96543730784dc9f3074f`.
- Matrix: the same five contexts × 16,384 × five repetitions; Strict only; no repair; 25 calls.
- Lineage lock: the config binds the completed v1.1 summary and raw-manifest hashes above. The 16K arm is a separately identified Human-requested extension, not retroactively presented as preregistered v1.1.
- Raw root: `.runs/protocol-reliability-v1.2-max-token-16k-extension/`.
- Raw manifest: `sha256:b4379278ed4b46bfe638f97d2183cb92d855a4046ec1ee03511cae1da90d633b`.
- Summary: `.runs/protocol-reliability-v1.2-max-token-16k-extension-summary.json`, SHA-256 `ab1b10233c2dc66040a811035b4c88ec5779d623dd91a2b93dd0ce0f87694ec7`.
- Window: 2026-08-24 02:35:58–03:03:11 UTC (10:35:58–11:03:11 Asia/Shanghai).

All 99 decoded responses across both versions returned `deepseek-v4-flash` with fingerprint `a26a7955944dc5c60445bff77fac9c8e`. One 16K call ended at L0 with retained `transport_error_type=RuntimeError`, no response body, usage, model, or fingerprint. The artifact does not retain the underlying reason string, so its cause remains unknown and is not filled in as a timeout.

## Four-ceiling results

Each arm has 25 fixed slots. L0–L3 rates are unconditional; missing usage stays unknown.

| Requested ceiling | L0 | L1 | L2 | L3 canonical | L3 Wilson 95% | Exact cap hits | Known completion Tokens | Mean over known calls | DSML-bearing responses |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2,048 | 25/25 | 5/25 | 2/25 | 2/25 (8%) | 2.2–25.0% | 19/25 | 39,651 (25/25) | 1,586 | 19/25 |
| 4,096 | 25/25 | 9/25 | 4/25 | 4/25 (16%) | 6.4–34.7% | 16/25 | 66,651 (25/25) | 2,666 | 15/25 |
| 8,192 | 25/25 | 5/25 | 4/25 | 4/25 (16%) | 6.4–34.7% | 20/25 | 164,455 (25/25) | 6,578 | 20/25 |
| 16,384 | 24/25 | 7/25 | 5/25 | 5/25 (20%) | 8.9–39.1% | 15/25 | 246,815 (24/25) | 10,284 | 15/25 |

Earliest failures were:

- 2K: 20 `l1.invalid_arguments_json`, three `l2.bash_arguments`;
- 4K: 16 `l1.invalid_arguments_json`, five `l2.bash_arguments`;
- 8K: 20 `l1.invalid_arguments_json`, one `l2.bash_arguments`;
- 16K: one `l0.transport_error`, 17 `l1.invalid_arguments_json`, two `l2.bash_arguments`.

The maximum retained function-argument string grew from 8,232 characters at 2K to 16,432 at 4K, 32,868 at 8K, and 66,437 at 16K. Repeated DSML/invoke markers remained co-located with every cap-hit population: 19, 15, 20, and 15 responses respectively. Marker counts are diagnostics of repeated returned text, not decryption or interpretation of a hidden model state.

## Context split

Cells show `L3 successes / cap hits` out of five repetitions.

| Context | 2K | 4K | 8K | 16K |
|---|---:|---:|---:|---:|
| `c07` | 1 / 4 | 2 / 3 | 1 / 4 | 0 / 5 |
| `c09` | 0 / 2 | 0 / 0 | 1 / 3 | 1 / 1 |
| `c12` | 1 / 4 | 0 / 5 | 1 / 4 | 1 / 3 |
| `c22` | 0 / 5 | 1 / 4 | 0 / 5 | 3 / 2 |
| `c23` | 0 / 4 | 1 / 4 | 1 / 4 | 0 / 4 |

The provider was non-deterministic at temperature zero: the same fixed Context and ceiling could produce either a short action or a response that ran exactly to the ceiling. Raising the ceiling had heterogeneous Context effects rather than a monotonic reliability effect.

## Candidate conclusion

The v1 2,048 setting is a genuine request-side ceiling and therefore a confound if `finish_reason=length` is interpreted as pure protocol noncompliance. The sensitivity result rejects the simpler remedy that Strict merely needed a larger default output budget:

1. raising the ceiling from 2K to 4K doubled the budget but increased L3 only from 2/25 to 4/25 on this failure-enriched subset;
2. 8K did not improve over 4K and produced 2.47× the known completion Tokens;
3. 16K improved only to 5/25 while 15 responses still generated exactly 16,384 Tokens, and its 95% L3 interval overlaps every lower arm;
4. results diverged by Context, including worse 16K outcomes on `c07` and `c23` and better outcomes on `c22`.

The frozen decision classification is therefore **runaway persists, with Context-dependent branching**. This supports keeping a bounded action-output ceiling and using explicit validation plus bounded repair rather than making 16K the default protocol fix. It does not establish that 2,048 is globally optimal; lower ceilings, alternate schemas, prompt changes, or a different provider/model require separately frozen experiments.

The v1 headline must be qualified accordingly: S0's 93/120 (77.5%) is the result of Strict Function Calling **under the bundled 2,048-token request configuration**, not an unconfounded estimate of transport alone. S1's 120/120 remains a bounded observation that included one short repair after each eligible Strict failure and its additional Token/call cost.

## Verification evidence and open Gate

- Source preflight reproduced 120 parent Strict slots and exactly 21 selected `length@2048` failures across the frozen five contexts.
- Eight focused tests passed, including exact 75/25 matrices, 8K-versus-16K payload equivalence apart from `max_tokens`, source summary/manifest locks, response hash tamper rejection, and credential exclusion.
- Both matrices completed their exact denominators; deterministic summarizers re-read request/response hashes, recomputed diagnostics, and rejected missing or drifted attempt identities.
- Python compilation and Git whitespace checks passed before the 16K calls.

The remaining Gate is a separate Regulator session/process inspecting primary artifacts, independently reproducing both summaries, adding negative tests, and accepting or rejecting these ordinary candidate-Evidence claims. No VPF, factual-ledger, or resume update is authorized here.

## Claim boundary

This is a dated sensitivity measurement over five deliberately failure-enriched real contexts. It measures provider × model × endpoint × protocol × ceiling behavior. It is not a population estimate, provider-wide reliability, action correctness, task success, SWE-bench result, general Harness reuse proof, Verified Project Fact, or resume fact.
