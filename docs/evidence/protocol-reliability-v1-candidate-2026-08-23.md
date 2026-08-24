# Protocol Reliability v1 | Working Agent candidate Evidence

Status: complete 240-slot Working Agent candidate; pending a new independent Regulator review. This document cannot register a Verified Project Fact or resume fact.

## Frozen identity and provenance

- Experiment: `protocol-reliability-v1`.
- Config: [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json), `sha256:7d2caf39b332179a160817f7201a4b09654998fab1e3ec5e3d3c1b42a1b6acf7`.
- Context corpus: [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json), `sha256:299b76046f34496af3ed47d5d059c0e656fb8334c4914d34cb5e630a511a3919`.
- Source ReAct matrix: config `sha256:1803342999f4eb934aea5b1943e1def6797a649c72eef45b869c6f89f4250c29`; raw manifest `sha256:7a3a153f888f602187e500ac2a693f786d0a5852391f736920354b41d998596a`.
- Raw result root: `.runs/protocol-reliability-v1/` (ignored local Evidence retained in place).
- Raw result manifest: `sha256:4a268ecea3e8f852d5d571bb7d9a7f6a1d03ea92681d9bb20b10311ab1c21814`.
- Deterministic summary: `.runs/protocol-reliability-v1-summary-with-call-coverage.json`, SHA-256 `c36894362f4f0b92c6f9df9b6e9e96ae439d6fda561c1f0a3b998b1a3d519d31`.
- Measurement window: 2026-08-23 09:41:14–09:51:36 UTC (17:41:14–17:51:36 Asia/Shanghai).
- Provider identity: 329 decoded responses returned model `deepseek-v4-flash` and fingerprint `a26a7955944dc5c60445bff77fac9c8e`; one repair transport error has no returned model/fingerprint.
- Provider calls: 240 original plus 90 repair calls; 240/240 attempt artifacts complete, with 240 original and 89 repair response bodies.
- Credential scan: no supplied DeepSeek key match in the raw root or corrected summary.

## Corpus reconstruction

`scripts/freeze_protocol_reliability_contexts.py --verify` reproduced the committed corpus exactly from all 30 retained ReAct MVP Traces:

- 16 challenge contexts are every unique terminal protocol-failure pre-call history after canonical de-duplication by variant plus provider-visible messages;
- eight controls cover Act-only/ReAct × call 1, calls 2–5, calls 6–15, and calls 16+;
- every context retains source attempt IDs, source Trace hashes, call depth, cohort, variant, full messages, and its own context hash.

The replay performed no bash call, Docker action, repository edit, or task evaluation.

## Effective L0–L3 results

Each scheme has 120 attempts. J0/J1 share every JSON original call; S0/S1 share every Strict original call. Repair-enabled schemes use the repair assessment after an eligible failure and retain the original assessment separately.

| Scheme | Calls charged | L0 | L1 | L2 | L3 canonical | L3 Wilson 95% |
|---|---:|---:|---:|---:|---:|---:|
| J0 JSON, no repair | 120 | 120/120 | 77/120 | 57/120 | 57/120 (47.5%) | 38.8–56.4% |
| J1 JSON, one repair | 183 | 119/120 | 119/120 | 104/120 | 104/120 (86.7%) | 79.4–91.6% |
| S0 Strict, no repair | 120 | 120/120 | 94/120 | 93/120 | 93/120 (77.5%) | 69.2–84.1% |
| S1 Strict, one repair | 147 | 120/120 | 120/120 | 120/120 | 120/120 (100%) | 96.9–100% |

All 240 original calls reached L0. J1's 119/120 effective L0 reflects one repair transport error after an original invalid JSON response; the runner did not retry it.

## Cohort and blocking-factor results

| Scheme | Challenge L3 | Control L3 | Act-only L3 | ReAct L3 |
|---|---:|---:|---:|---:|
| J0 | 17/80 (21.3%) | 40/40 (100%) | 36/55 (65.5%) | 21/65 (32.3%) |
| J1 | 64/80 (80.0%) | 40/40 (100%) | 55/55 (100%) | 49/65 (75.4%) |
| S0 | 67/80 (83.8%) | 26/40 (65.0%) | 51/55 (92.7%) | 42/65 (64.6%) |
| S1 | 80/80 (100%) | 40/40 (100%) | 55/55 (100%) | 65/65 (100%) |

The transport effect is not uniform across cohorts. S0 exceeds J0 overall and on challenge contexts, while J0 exceeds S0 on controls. The fixed corpus is correlated and stratified for failure inspection, not sampled to estimate a provider-wide population rate.

## Earliest failures and repair

| Scheme | Mutually exclusive effective earliest failures |
|---|---|
| J0 | 43 `l1.invalid_json`; 20 `l2.react_thought` |
| J1 | 15 `l2.react_thought`; one `l0.transport_error` |
| S0 | 26 `l1.invalid_arguments_json`; one `l2.bash_arguments` |
| S1 | none in 120 fixed attempts |

- JSON repair was attempted 63 times and recovered 47 to L3: 74.6%, Wilson 95% 62.7–83.7%.
- Strict repair was attempted 27 times and recovered all 27 to L3: 100%, Wilson 95% 87.5–100%.
- Of the 26 Strict invalid-arguments failures, 21 returned `finish_reason=length` and five returned `finish_reason=tool_calls` with malformed argument text. The one Strict L2 failure returned an unexpected `type` function argument despite `additionalProperties: false` in the retained request.
- These observations show that the local Translation Layer must still validate Strict outputs. They do not establish whether the remaining nonconformance originates in provider Beta behavior, model generation, or another server-side implementation detail.

## Usage accounting

| Scheme | Known total Tokens | Usage coverage |
|---|---:|---:|
| J0 | 514,924 | 120/120 charged calls |
| J1 | at least 773,317 | 182/183 charged calls; 119/120 attempt totals complete |
| S0 | 602,134 | 120/120 charged calls |
| S1 | 777,722 | 147/147 charged calls |

Known incremental repair Tokens are 258,393 for J1 and 175,588 for S1. J1's exact total is unknown because the retained repair transport error returned no usage. Missing usage is not filled with zero.

## Measurement correction retained

The first deterministic summary, `.runs/protocol-reliability-v1-summary.json` with SHA-256 `dcd636876008598d149fcebe139bf9d000a0be8850781bed68589aa60908621b`, correctly reported reliability but excluded the known original Tokens for the one J1 attempt whose repair usage was missing. It remains retained.

The summary implementation was corrected to derive usage from raw charged calls and report known-call coverage plus known Token lower bounds. No attempt, request, response, assessment, denominator, or reliability outcome changed. The corrected summary named above is the candidate Evidence entry.

## Candidate interpretation

Within this fixed corpus and ten-minute provider window:

1. transport choice materially changed the probability that a response crossed the Translation Layer, but neither original transport was perfectly reliable;
2. one explicit protocol-feedback call recovered many failures and had measurable call/Token cost;
3. visible ReAct remained harder for JSON transport because missing `thought` survived 15 repairs;
4. Strict Function Calling removed the missing-thought failure mode in these calls, but still produced truncated/malformed arguments and one schema violation before repair;
5. a 120/120 S1 result is a bounded observation with a 96.9% Wilson lower bound, not a guarantee or persistent provider benchmark.

## Post-run maximum-token qualification | 2026-08-24

The completed [maximum-token sensitivity candidate Evidence](protocol-max-token-sensitivity-candidate-2026-08-24.md) corrects the causal scope of item 1 above. S0's 93/120 result used a bundled 2,048-token request ceiling, and 21 of its failures ended exactly at that ceiling; it must not be described as an unconfounded transport-only effect.

Across the five affected real ReAct contexts, no-repair L3 was 2/25 at 2K, 4/25 at 4K, 4/25 at 8K, and 5/25 in a separately identified post-v1.1 16K extension. Exact cap hits were 19, 16, 20, and 15. Fifteen 16K responses still ran exactly to 16,384 Tokens, while known completion use rose to 246,815 Tokens across 24 usage-bearing calls. The qualification is therefore two-sided: 2,048 physically truncated those responses, but raising the ceiling did not monotonically restore protocol validity and often only extended malformed repeated arguments.

The durable v1 claim is about provider × transport × prompt/schema × requested ceiling during the recorded window. The sensitivity supports retaining a bounded ceiling plus validation and bounded repair rather than adopting 16K as the default fix. Both result sets remain Working Agent candidate Evidence pending independent review.

## Verification evidence and open Gate

Before provider calls:

- full repository suite: 85/85 passed;
- corpus regeneration: exact hash match;
- 240-slot dry-run: exact config/corpus identities and deterministic order;
- Python compilation and Git whitespace checks: passed;
- MyPy was unavailable in the active Python environment and therefore produced no type-check Evidence.

After the summary accounting correction and directory-index updates:

- full repository suite: 86/86 passed;
- corpus regeneration: exact hash match at `sha256:299b76046f34496af3ed47d5d059c0e656fb8334c4914d34cb5e630a511a3919`;
- corrected summary regenerated byte-for-byte at SHA-256 `c36894362f4f0b92c6f9df9b6e9e96ae439d6fda561c1f0a3b998b1a3d519d31`;
- Python compilation, Git whitespace checks, supplied-key scan, and the root acceptance gate passed.

A separate Regulator session/process must now inspect primary artifacts, reproduce the summary independently, test config/corpus/artifact tampering, inspect Strict request/response samples, and accept or reject the ordinary candidate-Evidence claims. No VPF, factual-ledger, or resume update is authorized here.

## Claim boundary

This is a dated provider × model × endpoint × protocol measurement over 24 fixed real contexts. It is not task-solving quality, action correctness, a SWE-bench result, a persistent benchmark, a general Harness reusability proof, a Verified Project Fact, or a resume fact.
