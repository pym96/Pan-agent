# ReAct-to-SWE Learning MVP

Status: Human-accepted experiment design; the frozen 30-slot matrix is complete as Working Agent candidate Evidence and remains pending independent review. The result is not a SWE-bench Lite score or accepted project fact.

## Purpose

This phase reproduces the mechanism of ReAct before adding SWE-agent-style Agent-Computer Interface features. It is a learning experiment inside the existing `workspace-coding` lane, not a new product architecture, a paper-score reproduction, or a SWE-bench leaderboard attempt.

The first decision-relevant question is narrower than “can the Agent solve SWE-bench?”:

> With one current model, one bash action interface, one task set, and equal limits, does requiring a visible bounded thought before each action change task resolution or failure behavior compared with Act-only?

The accepted General Runtime remains the product-level seam. Phase 0 deliberately reuses the already-tested `AgentLoop` so the experiment isolates loop grammar before attempting a richer coding ACI.

## Frozen experiment

The executable lock is [`../../workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json`](../../workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json). Its own canonical content hash detects accidental drift.

- Suite: `react-mvp-5`.
- Source: `SWE-bench/SWE-bench_Lite` at revision `b0dde1093fe417d83b7184254edf8199c1f0dff5`, `dev` split; the runner receives the revision's local parquet with SHA-256 `b90bcbfaca1b5f65155500124a977876c264a4003ab384aca4dfc39a54bef89f`.
- Cases: five IDs selected before provider calls by ascending `sha256(seed + NUL + instance_id)`; every mutable image tag is paired with its observed registry digest.
- Variants: `act-only` and `react`.
- Repetitions: three per case and variant, for 30 planned Agent attempts.
- Run limits: 30 bash steps, 31 model calls including the final response, and 1,800 seconds per attempt.
- Provider configuration: DeepSeek `deepseek-v4-flash`, provider thinking disabled, temperature zero, JSON-object response.
- Interface: one `bash` action in a disposable SWE-bench Docker container with no network or host mounts.
- Primary outcome: the pinned official SWE-bench evaluator's `resolved` verdict.

Five development cases and three repetitions are sufficient for a mechanism smoke and failure inspection. They are not sufficient for a SWE-bench Lite aggregate or a stable model-quality estimate.

## Treatment isolation

Both variants receive the same task, model, container image, observation policy, action schema, budgets, and evaluator. The only intended treatment is the visible `thought` field:

- Act-only rejects any thought, analysis, rationale, or planning field.
- ReAct requires one non-empty action-relevant thought of at most 1,000 characters on every tool or final action.

Provider-native reasoning and provider-native tool calling remain disabled. Otherwise a hidden reasoning mode or provider coding agent could dominate the treatment and make the comparison uninterpretable. The Harness parses the provider JSON, validates the treatment contract, then canonicalizes it into the existing `AgentLoop` action format.

This design measures prompted visible ReAct under a current model. It does not measure whether the provider performs undisclosed internal computation.

## Action and observation contract

One model turn emits exactly one object:

```json
{"thought":"inspect the failing test","type":"tool","tool":"bash","arguments":{"command":"pytest -q"}}
```

Act-only uses the same object without `thought`. A final action replaces `tool` and `arguments` with a string `output`. Unknown fields, malformed JSON, a missing ReAct thought, an Act-only thought, non-bash tools, and empty commands fail closed.

Every command runs as `bash -lc` under `/testbed`. The observation returned to the model includes exit state plus bounded stdout and stderr. Each stream uses head-tail truncation within the fixed model-visible byte budget. In parallel, complete stdout and stderr are written losslessly and identified by SHA-256.

No history compaction or automatic summarization is used in Phase 0. This preserves the causal trajectory while bounding the largest tool response. Context-window overflow is retained as a failure rather than silently changing the experiment; compaction becomes a later separately versioned treatment if it proves necessary.

## Docker and evaluator gate

Docker is an evaluation and task-isolation boundary, not a requirement of ReAct itself. Each Agent attempt uses the exact upstream evaluation image, `linux/amd64`, with:

- no container network;
- no host mounts;
- 2 CPUs, 4 GiB memory, and a 512-process limit;
- one disposable container removed after patch extraction.

Before any model attempt for a case, its official gold patch must complete and resolve in the pinned SWE-bench runner. A missing image, platform mismatch, evaluator error, infrastructure failure, or incomplete run is an environment failure and cannot be relabelled as an Agent failure. On the current ARM Docker host, official x86_64 images must be pulled explicitly with `--platform linux/amd64` before evaluation.

The environment receipt is [`../evidence/react-mvp-docker-gold-gate-2026-08-20.md`](../evidence/react-mvp-docker-gold-gate-2026-08-20.md). After the preliminary Verified-set probe, all five selected Lite cases completed and resolved their own pinned gold gates. The credential was subsequently funded, the locked provider preflight returned a usable completion, and all 30 planned slots executed without treatment substitution.

## Attempt artifacts and attribution

Each eligible attempt must retain:

- suite/config hash, source revision, instance ID, image identity, variant, and repetition;
- secret-free provider identity, provider-returned model/fingerprint, and Token usage when supplied;
- complete JSONL trajectory;
- every command's complete stdout/stderr, hashes, exit code, and timeout state;
- extracted Git patch and hash;
- official evaluator report and raw test output;
- terminal category: resolved, unresolved, provider error, protocol error, budget/timeout, tool failure, evaluator error, or infrastructure failure.

Bad Cases and zero-output provider attempts stay in the record. Missing usage is unknown, never zero. Credentials must not enter configuration identity, Trace, commands, patches, or error text.

## Stop conditions and interpretation

The comparison may be summarized only after all eligible attempts use the frozen config. If provider balance, dataset access, image availability, or gold evaluation blocks a case, report the incomplete denominator and stop; do not substitute another task or model after seeing outcomes.

The smallest useful result table reports per variant: attempted, resolved, unresolved, non-task errors, tool calls, provider calls, Token coverage, duration, and paired per-case outcomes. With only five cases, trajectory-level failure analysis matters more than a percentage difference.

## Progression toward SWE-agent

Phase 0 produced inspectable Bad Cases, but most were response-protocol failures rather than coding-interface failures. The candidate result is recorded in [`../evidence/react-mvp-30-slot-candidate-2026-08-23.md`](../evidence/react-mvp-30-slot-candidate-2026-08-23.md): each treatment resolved one planned slot, while 26 slots ended in model/protocol error and one slot exposed a command-timeout artifact failure.

Before Phase 1 selects a coding ACI addition, the separately frozen [`protocol-reliability-v1`](protocol-reliability-v1.md) gate measures whether the action interface is consumable without silently changing task-solving content. Only clean bash-interface Bad Cases should choose additions such as compact repository navigation, bounded file viewing, structured editing, or targeted search feedback. Each ACI addition keeps the same frozen tasks or declares a new experiment version and measures recovery behavior, command efficiency, observation quality, and resolution.

This ordering preserves the learning distinction:

- ReAct tests the interleaved reasoning/action loop grammar.
- SWE-agent-style work tests how a coding-specific computer interface shapes that loop.

Neither phase changes the General Runtime/Vertical Pack decision or establishes a project/resume fact without the normal independent Gate.
