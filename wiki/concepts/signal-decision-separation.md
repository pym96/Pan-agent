# Signal–decision separation

- Type: verified-learning-fact
- Verification: triangulated
- Source: five systems compared on 2026-08-26 — Codex `44e95c85`, Claude Code mirror `54cc51a`, DeerFlow `88252e9b`, Pi `a1f955e9` (pinned checkouts under `30-已有资产与参考/candidate-projects/`), and this repository. Mechanism reports were produced by exploration agents; this agent then directly spot-checked the eight load-bearing locators listed below and confirmed all eight verbatim. Separability evidence: Anthropic engineering blog "Harness design for long-running applications" (2026-03-24), pending its own source page.
- Updated: 2026-08-26

## Verified facts

**Principle (user-confirmed in session):** output quality in an agent system is governed by two separable mechanisms — M1 *constraint* shrinks the admissible state space so signals become distinguishable ("constrain to distinguish"); M2 *independent verification* keeps acceptance decisions trustworthy ("verify to trust"). M1 alone scales confident wrongness; M2 alone reviews mud honestly. The Anthropic poor-QA-agent observation (the same agent finds real issues, then talks itself into approving) shows the two fail independently and are therefore distinct mechanisms.

**Five-system deployment map** (spot-checked locators in **bold**; others agent-reported):

- **Codex** — M1 strong: typed `ResponseItem` protocol, tool-argument parse failures return `RespondToModel` without executing (`core/src/tools/handlers/mod.rs:82-88`), OS sandbox plus execpolicy three-value `Allow/Prompt/Forbidden`. M2 strongest runtime instance found: the Guardian review session runs without inherited exec-policy rules, may use a different model, and **fails closed — parse/timeout/session errors force `Deny` (`core/src/guardian/review.rs:574-607`)**. Weaknesses: **`AskForApproval::OnRequest` lets "the model decide when to ask the user for approval" (`protocol/src/protocol.rs:923-926`)**, the /review reviewer defaults to the same model slug, and review-output parse failure silently degrades to prose.
- **Claude Code** (mirror repo: hooks/plugins direct evidence, permission engine visible only via CHANGELOG) — M1 strong at the extension surface: allow/ask/deny permission syntax, managed settings, **PreToolUse exit-code-2 blocks the call and feeds stderr to the model (`examples/hooks/bash_command_validator_example.py:56-79`)**, hook outputs themselves schema-validated. M2 four-layer: human approval, deterministic hooks (including transcript-evidence checks — no recorded test run blocks Stop), independent per-issue verification subagents, adversarial self-refute. Critical weakness: **hooks fail open on error (`plugins/hookify/hooks/pretooluse.py:60-72`, "ALWAYS exit 0 - never block")**, and auto-mode replaces the human approver with a model classifier.
- **Pi** — M1 strongest: compiled TypeBox validators before execution, provider-level strict/grammar constrained sampling, **length-stopped messages fail all contained tool calls (`packages/agent/src/agent-loop.ts:208-214`, "Fail them all instead of executing potentially borked calls")**. Anti-pattern: **silent pre-validation coercion — `Value.Convert` and primitive coercions rewrite malformed arguments without a record (`packages/ai/src/utils/validation.ts:317-325`)**; streaming JSON parse falls back to a silent `{}`. M2 medium: extension `block` hooks fail closed, and the evals package judges are deterministic code, but there is no runtime reviewer and compaction is self-produced without validation.
- **DeerFlow** — M1 strong via deterministic middleware gates: read-before-write sha256 versioning, subagent result hash anti-forgery, guardrail provider that **defaults `fail_closed: true` (`config/guardrails_config.py:21-22`) but ships `enabled: false`**. M2 weakest: HITL covers only clarification input, never approval; **the lead agent self-marks todos complete under prompt text alone (`agents/lead_agent/agent.py:342-349`)**; subagent results are trusted as self-reported final messages.
- **This repository** — M1 first tier: four-type canonical conversation with correlation-ID validation, measured Strict-vs-JSON transport comparison (93/120 vs 57/120 original L3), content-hashed frozen configs, evaluators outside the agent-writable workspace. M2 strong at the governance/evidence layer (independent Regulator sessions, separate evaluator processes, behavioral `resolved`), absent at runtime by deliberate deferral. If a runtime reviewer is ever added, Codex's Guardian is the strongest inspected reference: fail-closed, no inherited rules, optionally a different model.

**Three cross-system patterns:**

1. *M2 reality is determined by the verifier's own failure posture.* Codex Guardian parse failure → `Deny`; Claude Code hook crash → allow. "Has independent verification" means opposite things in the two systems. Ask not whether a reviewer exists but what happens when it breaks.
2. *M2 forms an independence ladder:* human > deterministic code > different-model agent > same-model different session > self-report. Claude Code spans the whole ladder; Codex Guardian sits at "different session, optionally different model, fail-closed"; DeerFlow bottoms out at self-report. This repository's Regulator governance (separate session, different model family for high risk) ranks above all four products because they are products and this is an evidence pipeline.
3. *Silent normalization is the shared M1 anti-pattern.* Pi's `null→0` coercions, DeerFlow's dangling-call `"{}"` replacement, Codex's lenient patch parsing — every system somewhere "fixes" malformed output without leaving a trace. This repository's fail-closed-plus-attributable-failure choice is the strictest of the five; its cost is interactive leniency, which the three-gate model's run gate owns.

## Boundaries

- Eight load-bearing locators (bolded) were directly re-verified verbatim by this agent; the remaining locators come from exploration-agent reports and were not exhaustively re-verified. Treat unbolded citations as Working-level claims.
- The Claude Code mirror contains no runtime source; conclusions about its permission engine rest on CHANGELOG and example/plugin files only.
- The entropy formalization of M1 (`H(X|C) ≤ H(X)`, "constraint sharpens signal") remains interpretation-layer: one experiment data point (Strict 93/120 vs JSON 57/120) supports it, and it lacks a second-corpus replication. See the open question below.
- This page compares mechanisms, not product quality; nothing here is a Verified Project Fact, benchmark result, or resume evidence.

## Links

- [Canonical conversation](canonical-conversation.md) — M1's state layer in this repository.
- [Honest capability degradation and the three-gate model](honest-degradation-three-gates.md) — the run/conclusion/action gate framing; M1/M2 map onto conclusion-gate machinery.
- [Distrust-driven verification](distrust-driven-verification.md) — M2 at governance scale.
- [Harness Engineering](harness-engineering.md) — enforcement by non-model components.
- [Why does self-generated thought improve action quality?](../questions/why-self-generated-thought-helps.md) — the entropy interpretation remains open there.
- [Fixed-context DeepSeek action-protocol reliability](../experiments/2026-08-23-protocol-reliability-v1.md) — the M1 measurement leg (Strict vs JSON).
