# Protocol Reliability v1

Status: Human-accepted frozen design; the 240-slot matrix is complete as Working Agent candidate Evidence and is pending a new independent review. No result in this document is a project fact or benchmark score.

## Decision question

> For 24 fixed real Agent contexts, how reliably does one DeepSeek model produce a canonical bash/finish action through JSON-object versus Strict Function Calling transport, before and after at most one protocol repair?

The experiment replays provider input only. It neither executes an action nor observes task correctness. Its purpose is to calibrate the Translation Layer before interpreting later ReAct or SWE-agent-style ACI experiments.

## Frozen context corpus

The corpus lock is [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json), with content hash `sha256:299b76046f34496af3ed47d5d059c0e656fb8334c4914d34cb5e630a511a3919`.

The extractor reads all 30 retained `react-mvp-5` Trace files and reconstructs the exact provider-visible message history before every model call. For each successful call it advances the history using the recorded assistant action and `Observation from bash` message. For a terminal provider-contract failure, the final pre-call history is recoverable even though the old Adapter did not retain the invalid response itself.

The 24 contexts are:

- challenge: all 16 unique terminal protocol-failure pre-call histories after exact canonical de-duplication by variant plus messages;
- control: one valid history selected per Act-only/ReAct × four call-depth bands using a frozen SHA-256 selection seed;
- depth bands: call 1, calls 2–5, calls 6–15, and calls 16+.

Every context retains its source attempt IDs, Trace hashes, source call depths, variant, cohort, messages, and context hash. `scripts/freeze_protocol_reliability_contexts.py --verify` regenerates and byte-compares the committed corpus when the ignored source Traces are available.

## Transport and scheme matrix

The executable config is [`../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json`](../../workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json), with content hash `sha256:7d2caf39b332179a160817f7201a4b09654998fab1e3ec5e3d3c1b42a1b6acf7`.

| Scheme | Transport | Effective response |
|---|---|---|
| J0 | JSON-object | original call |
| J1 | JSON-object | original if valid; otherwise one repair call |
| S0 | Strict Function Calling Beta | original call |
| S1 | Strict Function Calling Beta | original if valid; otherwise one repair call |

J0/J1 share one original call, as do S0/S1. The raw denominator is therefore 24 contexts × 2 transports × 5 repetitions = 240 original calls, with at most 240 additional repair calls.

Both transports use `deepseek-v4-flash`, thinking disabled, temperature zero, 2,048 maximum completion Tokens, no streaming, and the same frozen historical messages. JSON uses the normal Chat Completions endpoint and `response_format={"type":"json_object"}`. Strict uses `/beta/chat/completions`, two required strict functions, and `tool_choice="required"`.

The Strict functions are:

- `bash(command[, thought])`;
- `finish(output[, thought])`.

For ReAct, `thought` is a required non-empty function argument of at most 1,000 characters. Act-only forbids it. The Translation Layer converts either function into the existing canonical JSON action.

## Repair

Repair is eligible only when a decoded provider response fails L1, L2, or L3. The repair message includes the earliest validator code and the preceding provider message, instructs the model to re-emit the same intended next action, and forbids advancing the task or assuming a new observation.

Transport errors, non-2xx HTTP responses, authentication/balance/rate-limit failures, and response-decode failures stop at L0 and receive no repair. There is no automatic retry. A repair-enabled scheme reports the original call plus repair call usage; missing usage stays unknown.

## Measurement ladder

The unconditional ladder is cumulative:

1. L0: a decoded successful provider response object is available;
2. L1: the carrier is syntactically usable — JSON content or one native function-call envelope with JSON arguments;
3. L2: the variant-specific action document schema is valid;
4. L3: the action canonicalizes to executable non-empty bash or finish.

Every failed attempt receives one earliest-failure code. Reports include unconditional level rates, adjacent conditional rates, exact numerators/denominators, Wilson 95% intervals, challenge/control splits, variant splits, raw fingerprint/model/endpoint identity, and usage coverage.

## Execution and stop rules

All 240 original slots have a deterministic SHA-256 order and concurrency one. The runner refuses existing or incomplete append-only attempt directories, does not substitute slots, and performs no provider retry.

It retains an attempt and then stops before the next slot after:

- HTTP 401, 402, or 403;
- three consecutive L0 failures;
- a different non-empty `system_fingerprint` within the same transport.

Missing fingerprints are recorded as unknown and do not silently become equal. JSON and Beta Strict transports have separate fingerprint groups because their endpoints may legitimately differ.

## Artifacts and interpretation

Each attempt retains the secret-free request JSON, lossless response body, hashes, UTC timestamps, duration, HTTP status, provider identity/usage, original and optional repair assessment, and derived scheme results. Generated artifacts live under ignored `.runs/protocol-reliability-v1/`.

The completed result is recorded in [`../evidence/protocol-reliability-v1-candidate-2026-08-23.md`](../evidence/protocol-reliability-v1-candidate-2026-08-23.md). It identifies provider-by-protocol behavior during one recorded time window. It does not measure action correctness, task completion, general Harness reuse, persistent provider quality, or a SWE-bench score. A separate Regulator must inspect the raw matrix and add negative tests before any result is promoted beyond Working Agent candidate Evidence.
