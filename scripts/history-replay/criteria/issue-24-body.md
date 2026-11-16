## Parent

- #23

## What to build

Make the Human-proven TypeScript General Agent Working Stack the repository's authoritative product path, while preserving the Python implementation as an explicit reference and the prior benchmark/campaign code as historical experiments.

The completed slice gives a new contributor one default product installation and launch route, keeps language-neutral conformance scenarios independent of either implementation, and removes Domain Pack, evaluator, benchmark, and DeepSeek campaign machinery from the default interactive dependency path. Existing historical Evidence remains reproducible and is not rewritten to imply that it came from the TypeScript product.

Record the architectural supersession explicitly: the retained outer ideas are workspace/authority and attributable outcomes; the retained inner ideas are canonical tool semantics, Context behavior, and events. The duplicated Python AgentLoop implementations and task-specific experiment machinery do not become TypeScript product dependencies.

## Target Role

Working Agent / Builder. The Human-assigned session role remains immutable.

## Accepted base and candidate workflow

- Accepted `main` base: **fixed at promotion time** — the landed `main` after the in-flight #25 candidate lands; the exact SHA is recorded in the promotion comment.
- Create and push `workorder/24-candidate` from that exact base.
- Publish one immutable candidate SHA and stop for an independent Regulator.
- Do not push or merge `main`.

## Acceptance criteria (Criteria-Version `1.0`)

Every criterion below is **blocking** and evaluates to `PASS | FAIL | NOT_EVALUABLE` under the Operational Acceptance Criteria contract in `docs/governance/verification.md` (Criteria-Version `1.0`). Acceptance requires every blocking Criterion to PASS. Handoff and Verdict must both name Criteria-Version `1.0`.

**GateLevel:** `high-risk` for C-CUT-07 (deletion/evidence-integrity-related); the Regulator review must therefore be a different model family or explicit Human review per `verification.md`. All other criteria are `standard` depth inside the same review.

### C-CUT-01 — Default product path (oracle: deterministic document test)

- **Given:** the candidate's README, install, and launch documentation.
- **Observe:** the default installation and launch route presented to a new contributor.
- **Pass iff:** the default route installs and launches the TypeScript working stack (the `typescript/` package), and no Python package installation or Python TUI launch step appears on the default route.
- **Fail when:** the default route requires any Python setup step, or presents the Python TUI as the product entry.

### C-CUT-02 — Human-usable default path (oracle: protocolized Human observation)

- **Given (observer/stimulus):** the Human, on a clean checkout of the exact candidate SHA, follows only the default README route, launches the TUI in a scratch workspace, and submits one ordinary task (create-and-run a small file).
- **Observe:** the TUI event rendering and the terminal settlement, plus any step the Human needed that the README does not document.
- **Pass iff:** the task reaches `terminal=completed` with no undocumented step. Missing-data behavior: if the Human trial has not been recorded on this issue, the criterion is `NOT_EVALUABLE` (`evidence_incomplete`).
- **Fail when:** the task does not complete, or completion requires a step absent from the default route documentation.
- **Decision record:** the Human's outcome comment on this issue, retained before the Verdict.

### C-CUT-03 — Language-neutral conformance fixtures (oracle: deterministic invariant/test)

- **Given:** the candidate's conformance fixture suite.
- **Observe:** fixture coverage, suite results against the TypeScript product, and the suite's imports.
- **Pass iff:** fixtures cover the retained tool semantics, terminal settlement kinds, cancellation, and Context behavior; the suite runs green against the TypeScript product; and no fixture or conformance runner imports a Python implementation module.
- **Fail when:** any retained semantics area lacks a fixture, any fixture fails, or Python implementation code is imported.

### C-CUT-04 — Reference/experiment classification (oracle: deterministic document test)

- **Given:** the candidate's entry-level documentation (README and the docs index).
- **Observe:** the classification labels of the Python evented path and of the ReAct, protocol, DeepSeek campaign, proof-pack, and benchmark machinery.
- **Pass iff:** the Python evented path is labelled reference-only, and each named machinery area is labelled experiment/reference rather than active product infrastructure.
- **Fail when:** any named area is unlabelled or presented as active product infrastructure.

### C-CUT-05 — Independence from the Python package (oracle: deterministic invariant/test)

- **Given:** a checkout of the candidate with the Python product package excluded by the candidate's predeclared exclusion mechanism (e.g. temporary move inside the test harness).
- **Observe:** results of the TypeScript focused tests and the conformance suite, and presence of the TypeScript behavioral specification documents.
- **Pass iff:** both suites run green and the behavioral specification remains present and readable without the Python package.
- **Fail when:** either suite fails, becomes unrunnable, or the specification is missing.

### C-CUT-06 — Assignment and architectural supersession record (oracle: deterministic document test)

- **Given:** the candidate's `docs/agents/current-assignment.md` and ADR set.
- **Observe:** the active-mission statement and the superseding architectural decision.
- **Pass iff:** the active mission describes the TypeScript/Pi product seam; the Bash-only ReAct lane is retired as the active mission (its history retained, not deleted); and an ADR records the supersession including the retained outer ideas (workspace/authority, attributable outcomes) and inner ideas (canonical tool semantics, Context behavior, events).
- **Fail when:** any of the three elements is missing, or history is deleted rather than retained.

### C-CUT-07 — Historical Evidence preservation (GateLevel: high-risk; oracle: deterministic invariant/test)

- **Given:** the candidate's full diff against the accepted base.
- **Observe:** changes under `docs/evidence/`, `wiki/`, `workspace_agent_harness/benchmark_configs/`, and to `docs/evidence/verified-project-facts.md`.
- **Pass iff:** no file under `docs/evidence/`, `wiki/`, or the benchmark locks is modified or deleted (purely additive pointers in navigation indexes excepted, if any, must be enumerated in the Handoff); `verified-project-facts.md` is byte-identical to the base; historical reproduction instructions remain intact; no past result, verified fact, Wiki fact, or resume claim is rewritten.
- **Fail when:** any historical Evidence byte changes or disappears, or any past claim is silently reframed as a TypeScript product result.

### C-CUT-08 — Python TUI demoted but discoverable (oracle: deterministic document test)

- **Given:** the candidate's entry-level documentation.
- **Observe:** how the old Python TUI is presented.
- **Pass iff:** it is not presented as the default product entry, and a discoverable pointer labels it reference/conformance material until separately removed.
- **Fail when:** it remains the default entry, or becomes undiscoverable.

### C-CUT-09 — Full regression (oracle: deterministic invariant/test)

- **Given:** the candidate at its full SHA.
- **Observe:** results of the TypeScript checks, the cross-language conformance checks, the retained historical Python checks, documentation link checks, and the outer acceptance gate in its declared candidate mode binding the candidate SHA and `workorder/24-candidate`.
- **Pass iff:** all listed checks pass.
- **Fail when:** any listed check fails.

### C-CUT-10 — Handoff contract (oracle: external contract)

- **Given:** the Builder Handoff recorded on this issue.
- **Observe:** presence of the accepted-base SHA, the full candidate SHA, Criteria-Version `1.0`, the exact changed-file list, executed checks, limitations, and the four zero declarations (Provider calls, balance queries, Provider credential reads, paid cost).
- **Pass iff:** every field is present, the declared candidate SHA matches the pushed `workorder/24-candidate` tip, and nothing in the reviewed Evidence contradicts the zero declarations.
- **Fail when:** any field is missing or contradicted.

### Non-blocking exploratory notes

Information architecture taste, label wording beyond the required anchors, and conformance-fixture granularity are exploratory review feedback and become linked Issue Candidates, not Verdict blockers. Unforeseen high-risk discoveries route through `ScopeChallenge` per `verification.md`.

## Budget and permissions

- Provider calls: `0` (C-CUT-02's Human trial uses the Human's own account outside the candidate budget, as with the #23 exploratory trial)
- Balance queries: `0`
- Provider credential reads: `0`
- Paid cost: `CNY 0`
- Local deterministic fake adapters and temporary test directories are allowed.
- Writes are limited to the candidate branch and local control-plane bookkeeping explicitly required by repository rules.

## Blocked by

- ~~#23 must be accepted, landed, and confirmed useful through Human exploratory use~~ — cleared 2026-09-03 (HF-20260903-028; Human trial recorded at comment 5521668899).
- Queues behind the in-flight #25: promotion happens only after #25 lands, because both WorkOrders edit `docs/agents/current-assignment.md`; the accepted base is fixed at that promotion.

## Non-goals

- No deletion or history rewrite of accepted Evidence.
- No implementation of sandbox hardening #22, benchmark expansion, Provider comparison, subagents, marketplace, or product website.
- No claim that preserved Python experiments are TypeScript product capabilities.
