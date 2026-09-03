# Verification Governance

This document is the canonical process contract for producing, checking, accepting, and externally disclosing project claims. It is development governance, not a Runtime component.

## Roles

**Master Agent** triages Issue Candidates, publishes WorkOrders, freezes `main` integration during review, and routes Handoffs and Verdicts. After acceptance it may only fast-forward the exact accepted candidate SHA. It cannot implement the WorkOrder, perform its independent Acceptance Gate, or promote a Claim without the applicable Verdict and human authority.

**Working Agent** produces candidate code, documents, experiments, and handoffs on `workorder/<issue>-candidate`. It commits and pushes before Handoff, cites the full candidate SHA, and never pushes `main`. It cannot accept its own work or promote a project claim into any external factual or resume ledger.

**Regulator Agent** accepts or rejects the exact remote candidate SHA against predeclared Criteria. It must use a separate session/process and clean worktree, read primary Evidence independently, design or rerun negative tests outside the candidate commit, and avoid relying on the Working Agent's summary.

**Learning Wiki Agent** answers an assigned learning question and maintains Wiki knowledge objects under `wiki/SCHEMA.md`. It cannot change implementation, governance decisions, project facts, or resume facts.

Runtime generator/evaluator components are product roles and must not be called Working or Regulator Agents.

The human assigns one immutable `SessionRole` at session creation. A missing role, role change, or mismatch with the WorkOrder is read-only `RoleMismatch`; changing roles requires a new session/process.

## Exchange Interface

- **WorkOrder** is the Master-promoted GitHub issue defined in [`../agents/issue-tracker.md`](../agents/issue-tracker.md). It fixes the target role, scope, deliverables, predeclared Criteria, budget, write authority, non-goals, dependencies, risks, and human authorization before execution.
- **ScopeChallenge** reports why the assigned contract should change and links Evidence. It does not authorize the specialist to switch tasks.
- **Handoff** records the candidate branch, accepted-base SHA, full candidate SHA, exact changed-file list, produced artifacts, primary Evidence, executed checks, limitations, and unresolved items. Its narrative is not Evidence by itself, and its SHA cannot be edited in place.
- **Verdict** records `accepted | rejected`, the exact candidate SHA, applied Criteria, independently inspected Evidence and probes, limits, and any new Issue Candidates. It does not transfer across rebases, cherry-picks, merges, or replacement commits and does not independently authorize project-fact or resume-fact promotion.

## Candidate integration

- Rejection returns the same candidate branch to Builder for additive repair. The repair produces a new tip SHA and Handoff.
- Acceptance allows Master to verify the remote SHA, confirm the frozen `main` is its ancestor, and fast-forward that exact SHA. Builder is not recalled for landing.
- If fast-forward is impossible, integration stops. Any rebased, cherry-picked, merged, or otherwise rewritten result is a new candidate requiring a new Verdict.
- Regulator probes and review notes remain separate from product commits. Candidate branches are durable review objects, not sources of project facts.

## Verification vocabulary

**Candidate Claim** is any falsifiable statement not yet accepted by the applicable Gate. A Claim may originate in source changes, an experiment, a handoff, or the Learning Wiki; the Wiki is not a mandatory promotion stage.

**Evidence** is an inspectable artifact or observation with provenance. It may include source code, Git history, Trace data, raw experiment outputs, external records, human disclosure records, Test results, and Domain Evaluator results. Unsupported narrative, completion self-report, and an agent's summary are not Evidence.

**Test** is a deterministic machine check. Unit, contract, integration, and negative tests describe different purposes; Test is one verification mechanism and is not the exclusive producer of Evidence.

**Domain Evaluator** is defined in [`../../CONTEXT.md`](../../CONTEXT.md). It produces a domain-task verdict and supporting measurements; it is a verification mechanism, not the only other producer of Evidence.

**Criterion** is a pass condition stated before acceptance and applied without post-hoc weakening.

**Evidence Bundle** links one Candidate Claim to its primary artifacts, observations, Test/Evaluator results, provenance, known limitations, and applicable Criteria.

**Acceptance Gate** is the Regulator's accept/reject decision after comparing an Evidence Bundle with its Criteria. Passing automation supplies Evidence; it never performs automatic acceptance.

## Operational Acceptance Criteria

This section is the canonical contract for blocking Acceptance Criteria, frozen as Criteria-Version `1.0`. [`../agents/issue-tracker.md`](../agents/issue-tracker.md) applies this contract to GitHub WorkOrder promotion and recording; the two documents must not contradict each other.

### Blocking versus exploratory

A condition may block a Verdict only as a versioned blocking Criterion. Qualitative or exploratory goals remain allowed in a WorkOrder, but they are explicitly non-blocking: they inform review and can become blockers only through the `ScopeChallenge` route for unforeseen high-risk discoveries. Before an issue becomes `ready-for-agent`, every blocking Criterion carries a unique Criterion ID, the Criteria-Version, a GateLevel, the fields `Given / Observe / Pass iff / Fail when`, and an oracle type.

### Oracle types

Every blocking Criterion declares exactly one primary oracle type:

1. **Deterministic invariant/test** — a machine-checkable predicate or test with predeclared inputs;
2. **Measurement** — a numeric observation under a complete measurement contract;
3. **Protocolized Human observation** — a predeclared Human judgment protocol;
4. **External contract** — a content-pinned external document, interface, or record.

### Open and finite input domains

A Criterion over an open or impractical-to-enumerate input domain states a domain-level invariant as its pass condition; listed examples define minimum probe coverage and never define completeness. A Criterion over a finite domain may instead enumerate that domain exhaustively.

### Measurement and stochastic Claims

A numeric Criterion predeclares metric, denominator, window, unit, precision, missing-data behavior, comparison boundary (threshold direction and inclusivity), and threshold provenance (where the number comes from). Missing data is never silently converted to zero or pass; the declared missing-data behavior decides between `FAIL` and `NOT_EVALUABLE`. A single live smoke supports only Claims about that retained Run's occurrence and mechanism. Model capability, reliability, or comparative Claims additionally require a frozen sample, denominator, repetitions, metric, threshold, uncertainty treatment, and stop rule.

### Protocolized Human judgment

A Criterion that cannot be decided solely by a machine oracle predeclares the observer, stimulus/task, visible Evidence, response scale or pass condition, and the retained decision record. An unspecified Human or Regulator impression recorded after the candidate exists cannot become a blocker.

### Results and rejection mapping

Each blocking Criterion evaluates to `PASS | FAIL | NOT_EVALUABLE`; acceptance requires every blocking Criterion to PASS. The Verdict remains `accepted | rejected`, and a rejection distinguishes `criterion_failed` (an evaluated blocking Criterion is `FAIL`) from `evidence_incomplete` (a blocking Criterion is `NOT_EVALUABLE` because required Evidence is missing). A rejection maps every blocker to a Criterion ID, probe input, observed value, expected predicate, and Evidence locator. Ordinary discoveries outside the frozen contract become linked Issue Candidates, not new blockers. Unforeseen high-risk discoveries pause the review through `ScopeChallenge` for Human/Master adjudication rather than silently inventing a new blocker. Known global high-risk invariants (security, authority, credential, deletion, production, public-benchmark, attribution, disclosure) apply even when a WorkOrder omits them; a Verdict that ignores them is itself defective.

### Freeze, amendment, and repair semantics

Criteria freeze append-only when the issue becomes `ready-for-agent`. An amendment creates a new append-only Criteria-Version that applies prospectively to new candidates; accepted historical WorkOrders are never reopened. A repair Verdict binds the full new candidate SHA. Unchanged Evidence may be carried forward by exact identity (hash or locator) plus a documented impact analysis of the changed bytes; an old Verdict never transfers to replacement bytes.

### Verification depth

GateLevel follows `exploratory | standard | high-risk`. Clarity requirements are universal; probe depth is proportional to risk and reversibility. The independence rules below are unchanged: standard review uses a different session/process; high-risk review additionally requires a different model family or explicit Human review.

### Criteria Lint v1

Criteria Lint v1 is a manual checklist applied by Master at `ready-for-agent` promotion and by the Regulator as preflight: every blocking condition has the required shape, open domains have invariants, numeric and stochastic fields are complete, Human judgment is protocolized, and the Criteria-Version is named in the WorkOrder, Handoff, and Verdict. It is a manual contract — no parser, bot, GitHub form, or policy engine is added.

## Fact-promotion ladder

```text
Candidate Claim
  + Evidence Bundle
  + Criterion
  + independent Acceptance Gate
→ Verified Project Fact
  + human approval of the atomic meaning and disclosure boundary
→ Approved Resume Fact
```

A **Verified Project Fact** must be registered in [`../evidence/verified-project-facts.md`](../evidence/verified-project-facts.md). That register is the only project-level source of truth; `AGENTS.md`, README, specs, Wiki pages, and review prose cannot substitute for it.

An **Approved Resume Fact** is outside this repository's authority. It additionally requires human approval of the atomic meaning and disclosure boundary plus registration in the external ledger governing that disclosure. No repository role may infer or perform that promotion.

Human approval attaches to an atomic fact's meaning and disclosure boundary, not to one exact sentence. Agents may reorder, shorten, or make meaning-preserving edits. A new metric, causal claim, ownership claim, role, publication state, or broader disclosure scope requires new Evidence, acceptance, and human approval.

## Independence by risk

All acceptance requires a different session/process from the Working Agent, primary-evidence inspection, and independently selected positive and negative checks. A prompt change inside the Working Agent's session is not independent.

High-risk acceptance additionally requires a different model family or explicit human review. High-risk changes include:

- a new reality-resume fact or external-disclosure boundary;
- public benchmark numbers;
- personal contribution, authorship, or ownership attribution;
- security, authority, credential, deletion, or production-environment behavior.

The same model family in a separate context may regulate ordinary changes, but cannot alone release a high-risk Claim. Self-acceptance is forbidden at every risk level.

## Decision state

Governance decisions record two independent fields:

- `Decision-State: proposed | accepted | superseded` records human authority;
- `Verification-State: pending | passed | failed` records whether an independent Regulator verified the implementation and references.

Human acceptance makes a decision authoritative. It does not prove that the repository implements it.

## Terminology-change control

1. Product-domain terms live only in [`../../CONTEXT.md`](../../CONTEXT.md).
2. A Working Agent may propose a definition and a decision record, but cannot accept its own semantic change.
3. Product scope, role authority, Acceptance Gate, fact promotion, or external-Claim changes require human approval.
4. A meaning-preserving clarification may be accepted by an independent Regulator without a new human ruling.
5. A rename atomically updates active references, keeps at most one active definition, and records any needed historical alias.
6. Every semantic change adds at least one negative test that would have failed under the superseded definition.

## Sources of truth

- Product domain language: [`../../CONTEXT.md`](../../CONTEXT.md)
- Project facts: [`../evidence/verified-project-facts.md`](../evidence/verified-project-facts.md)
- Learning path: [`../../wiki/index.md`](../../wiki/index.md) under [`../../wiki/SCHEMA.md`](../../wiki/SCHEMA.md)
- Architecture decisions: [`../adr/`](../adr/)
- Governance decisions: [`decisions/`](decisions/)
- Agent navigation and triggers: [`../../AGENTS.md`](../../AGENTS.md)

## Optional host integrations

An external career, portfolio, or private-workspace process may consume an accepted project Claim only when a Human-authorized WorkOrder explicitly names that integration. External files and checks are optional task inputs, not repository startup or Acceptance-Gate dependencies; when absent, repository-local work and verification remain fully defined by the sources above.
