# Verification Governance

This document is the canonical process contract for producing, checking, accepting, and externally disclosing project claims. It is development governance, not a Runtime component.

## Roles

**Working Agent** produces candidate code, documents, experiments, and handoffs. It cannot accept its own work or promote a project claim into the career factual ledger.

**Regulator Agent** accepts or rejects a handoff against predeclared Criteria. It must use a separate session/process, read primary Evidence independently, design or rerun negative tests, and avoid relying on the Working Agent's summary.

Runtime generator/evaluator components are product roles and must not be called Working or Regulator Agents.

## Verification vocabulary

**Candidate Claim** is any falsifiable statement not yet accepted by the applicable Gate. A Claim may originate in source changes, an experiment, a handoff, or the Learning Wiki; the Wiki is not a mandatory promotion stage.

**Evidence** is an inspectable artifact or observation with provenance. It may include source code, Git history, Trace data, raw experiment outputs, external records, human disclosure records, Test results, and Domain Evaluator results. Unsupported narrative, completion self-report, and an agent's summary are not Evidence.

**Test** is a deterministic machine check. Unit, contract, integration, and negative tests describe different purposes; Test is one verification mechanism and is not the exclusive producer of Evidence.

**Domain Evaluator** is defined in [`../../CONTEXT.md`](../../CONTEXT.md). It produces a domain-task verdict and supporting measurements; it is a verification mechanism, not the only other producer of Evidence.

**Criterion** is a pass condition stated before acceptance and applied without post-hoc weakening.

**Evidence Bundle** links one Candidate Claim to its primary artifacts, observations, Test/Evaluator results, provenance, known limitations, and applicable Criteria.

**Acceptance Gate** is the Regulator's accept/reject decision after comparing an Evidence Bundle with its Criteria. Passing automation supplies Evidence; it never performs automatic acceptance.

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

An **Approved Resume Fact** must also be registered at A/B level in the career-side [`事实账本.md`](../../../../20-现状与事实/事实账本.md). Only the human user can grant the final disclosure approval.

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
