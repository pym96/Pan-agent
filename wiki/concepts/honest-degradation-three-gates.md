# Honest capability degradation and the three-gate model

- Type: verified-learning-fact
- Verification: triangulated
- Source: three materially independent pinned codebases inspected directly on 2026-08-25/26 — Pi `a1f955e9f47fd3379b44f4aace65ab916c80519a` (`packages/ai/src/utils/estimate.ts:14`, `packages/ai/src/api/simple-options.ts:12`, `packages/ai/src/utils/overflow.ts:70-95`), Codex `44e95c857f37f81a5731eab72c32a3d334d0e2c4` (`codex-rs/models-manager/src/model_info.rs:139-160`, `codex-rs/protocol/src/openai_models.rs:~421`, `codex-rs/core/src/compact_remote.rs:399-405`, `codex-rs/models-manager/src/manager_tests.rs:70-71`), DeerFlow `88252e9b318d34e7e1867155ad2c77993320788e` (`backend/packages/harness/deerflow/config/model_config.py:35-44`, `backend/packages/harness/deerflow/agents/middlewares/summarization_middleware.py:392-400`) — plus the user-confirmed design tree from the 2026-08-25/26 grill-with-docs session
- Updated: 2026-08-26

## Verified facts

Observed mature-project behaviors, each inspected at the locators above:

- Pi estimates context tokens as characters ÷ 4 with a fixed 4,096-token reserve, and when `contextWindow <= 0` it neither blocks the call nor clamps `max_tokens` locally.
- Pi detects three overflow classes — provider error patterns, silent overflow (`usage.input` exceeding the window on a successful response), and length-stop with zero output — with explicit non-overflow exclusions (rate limits are not overflow), and allows one bounded compact-and-retry.
- Codex does not reject unknown models: it builds fallback metadata, emits a `warn!`, and continues. The 272,000-token context figure was located only in `manager_tests.rs` fixtures; a production fallback path carrying 272K was not found in this inspection.
- Codex keeps `context_window` as `Option<i64>` and its history trim returns without cutting when the window is unknown. The user's "~90% auto-compact threshold" claim was not re-verified at the cited locator; only the existence of the auto-compact task (`compact.rs:111`) is confirmed.
- DeerFlow allows `context_window` to be unset and merely hides the UI percentage when unknown.
- Neither project refuses to truncate outright: Codex rewrites oversized tool output and trims function-call history to fit; DeerFlow's `_bound_text` falls back to character-level head (2/3) + tail truncation.

The synthesis adopted by this Wiki after a user-confirmed grilling session:

- **Maturity invariant**: mature does not mean "all information precise before running". The shared invariant across the three codebases is that uncertainty is explicitly represented, never fabricated as certainty: Pi declines to clamp, Codex warns and labels fallback, DeerFlow hides the percentage.
- **Three-gate model**: a run gate (may we attempt), a conclusion gate (may results count as evidence), and an action gate (what may the run touch). Capability uncertainty may modulate the run and conclusion gates; it never propagates to the action gate — "best-effort" is never a reason to relax authority, sandboxing, or evaluator isolation.
- **Run gate stance — labeled best-effort**: running with an unknown/fallback profile is allowed, with `capability_confidence` recorded as first-class provenance; guessed fallback values are forbidden from identity fields, config hashes, and statistics.
- **Conclusion gate mechanism — dual track**: formal lanes bind profile identity into the config content hash, so a missing identity changes the hash and excludes the run by construction; development-lane summarizers exclude unknown-profile runs from denominators and report exclusion counts explicitly, following the existing precedents of 28 ineligible vertical cases and 182/183 usage coverage.
- **`capability_confidence` placement**: a required three-state field (`verified | fallback | unknown`) on RunReport/Trace provenance, because the conclusion gate's summarizer must read it from every run's retained artifact.
- **Slot identity rule**: a slot's identity is its exact byte-level frozen input. Repair preserves identity (the same context is resent with incremental accounting); compaction changes identity and must be accounted as a new observation. "Semantic equivalence" of a compaction is an unverified assumption, compaction is systematically biased toward success, and byte-hash accounting is zero-discretion. Precedent: the 16K max-token extension changed only a request parameter and was still versioned separately as v1.2 rather than rewriting v1.1.
- **Two identities, refined 2026-08-26 after the Anthropic long-running-harness grill**: *product identity* (session/task lineage — the same user-facing task continuing) survives compaction and resets; *measurement identity* (slot identity — which frozen ledger row a result is booked to) does not. The three recovery mechanisms also differ by trigger: repair answers an **output-side** failure (malformed response; input intact, resent byte-identical), while compact and reset answer **input-side** pressure (context too large; the reply may have been perfectly valid). Compact and reset both change measurement identity; they differ only in audit trail — compact loses information silently and unknowably, while a reset with a structured handoff artifact makes the loss explicit and auditable. Rule: changing measurement identity is not the sin; changing it without an audit trail is.
- **ContextBudgeter input contract**: it consumes only translated inputs — the ModelProfile-declared output ceiling, the TranslationAdapter's typed failure classification, and the canonical conversation size estimate — and returns `proceed | compact-then-proceed | refuse`; it never parses raw provider wire, and retry counts plus cost accounting are frozen by governance rather than self-decided.

## Boundaries

- The three-gate model, labeled best-effort stance, and Budgeter contract are this project's adopted design decisions from the grilling session, not industry standards; the behavioral sample is three codebases.
- Fail-closed is always relative to a specific claim: labeled best-effort is fail-open at the run gate and fail-closed at the conclusion gate; the gates' postures are chosen independently.
- The Codex 272K figure and the ~90% auto-compact threshold are recorded as not independently re-verified; only the locators listed above were inspected.
- Nothing on this page is a Verified Project Fact, a benchmark result, or resume evidence; Wiki admission promotes nothing. Adopting the three gate names into `CONTEXT.md` requires the separate terminology-change protocol and is not performed here.

## Links

- [Canonical conversation](canonical-conversation.md) — the state layer the Budgeter sizes and the slot identity freezes.
- [Harness Engineering](harness-engineering.md) — enforcement supplied by non-model components; the action gate is one instance.
- [Distrust-driven verification](distrust-driven-verification.md) — the conclusion gate is the evidence-lane instance of the same posture.
- [Fixed-context DeepSeek action-protocol reliability](../experiments/2026-08-23-protocol-reliability-v1.md) — 240 pre-frozen slots and 90 identity-preserving repairs.
- [Anthropic: Harness design for long-running applications](../sources/2026-08-26-anthropic-long-running-harness.md) — the reset-with-handoff mechanism that motivated the two-identity refinement.
- [Maximum-token sensitivity in Strict ReAct action generation](../experiments/2026-08-24-protocol-max-token-sensitivity.md) — the v1.2 16K extension as the slot-identity precedent.
