# ADR-0012: Freeze provider-protocol reliability before coding ACI treatments

- Status: Accepted
- Date: 2026-08-23
- Decision owner: human accepted all seven protocol-reliability design answers and authorized execution after the sixth independent ReAct MVP review
- Depends on: ADR-0011

## Context

The frozen ReAct MVP produced 26 response-contract failures among 30 planned slots: 16 provider contents were not valid JSON and 10 ReAct responses lacked the required visible `thought`. Those failures make an Act-only/ReAct task comparison difficult to interpret because model intent often did not cross the provider-to-Harness boundary as a canonical action.

The next experiment must isolate this boundary without rerunning software tasks, modifying repositories, or selecting a coding-specific ACI based on protocol-contaminated Bad Cases.

## Decision

Freeze `protocol-reliability-v1` as an offline fixed-context replay experiment:

1. derive 24 contexts from the real 30-slot Trace corpus: all 16 unique terminal protocol-failure pre-call contexts plus eight deterministic valid controls covering Act-only/ReAct and call-depth bands 1, 2–5, 6–15, and 16+;
2. compare JSON-object transport with DeepSeek Strict Function Calling Beta while retaining the original Act-only/ReAct variant as a blocking factor;
3. derive four schemes from shared original calls: J0 and S0 have no repair; J1 and S1 may add exactly one protocol-feedback call after an L1–L3 response failure;
4. retain raw original validity separately from post-repair validity and charge repair-enabled schemes for both calls;
5. repeat each context/transport pair five times and report exact counts, Wilson 95% intervals, challenge/control cohorts, variants, usage coverage, and mutually exclusive earliest failures;
6. retain UTC time window, requested/returned model, endpoint, and provider `system_fingerprint`; stop after recording the first different non-empty fingerprint within one transport;
7. keep append-only raw request/response artifacts and refuse config/corpus drift, retries, slot substitution, and artifact overwrite.

Strict Function Calling places the ReAct `thought` inside each strict function's arguments. `bash` and `finish` are separate functions and are canonicalized back to the existing action document. The Beta and normal endpoints remain distinct recorded transport identities.

## Consequences

- The experiment can identify whether invalid action transfer is dominated by carrier syntax, action schema, canonicalization, or provider availability.
- One repair may improve effective reliability, but its extra calls and Tokens remain visible.
- Strict Function Calling changes the provider transport and function schema; it does not establish task-quality improvement.
- The frozen contexts are correlated replay units from a five-case smoke. Wilson intervals describe observed call proportions and do not make them a population benchmark.
- Provider behavior may drift after the recorded time window, so the result belongs in the Learning Wiki and candidate Evidence only.

## Non-goals

- executing bash or evaluating a repository patch;
- comparing ReAct task success with Act-only task success;
- selecting or claiming a SWE-agent-style ACI improvement;
- producing a persistent benchmark, SWE-bench score, Verified Project Fact, or resume fact;
- proving the whole Harness is reusable.

## Acceptance evidence required

An independent Regulator must reject conformance unless:

1. the corpus regenerates exactly from the retained source Traces and contains the frozen 16+8 denominator;
2. JSON and Strict requests share the same frozen historical messages and differ only in frozen protocol instructions and transport machinery;
3. Strict schemas are server-compatible, require all properties, reject additional properties, and place ReAct thought exactly as declared;
4. L0–L3 and earliest-failure codes are deterministic and mutually exclusive;
5. repair is limited to one L1–L3 response failure, never retries L0, and includes both calls in cost;
6. fingerprints, time window, raw bodies, hashes, and missing usage are retained without credentials;
7. the deterministic summary enumerates all 240 original slots from the lock and rejects artifact tampering;
8. result language preserves the experiment's provider/time-window/task-quality boundaries.

## Detailed design

- [`../design/protocol-reliability-v1.md`](../design/protocol-reliability-v1.md)
- [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json)
- [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json)

