# Agent Map | Workspace Agent Harness

This file is the shared constitution and role router. It is not a glossary, implementation-fact register, design specification, learning notebook, or task body.

## Session role gate

- The human assigns exactly one immutable `SessionRole` when creating a session: `Master Agent`, `Working Agent` (Builder), `Regulator Agent`, or `Learning Wiki Agent`.
- A role change requires a new session. A missing role, conflicting role, or role/WorkOrder mismatch is read-only and returns `RoleMismatch`.
- Every role reads this same map. A WorkOrder selects work; it does not grant or change SessionRole.
- Master decides **what** is done. A specialist decides **how** inside the WorkOrder. A specialist may return `ScopeChallenge`, but cannot switch work without a revised WorkOrder.

## Common startup

1. Confirm the human-assigned `SessionRole`; a missing or conflicting role returns `RoleMismatch` before mutation.
2. For a specialist role, fetch the assigned GitHub WorkOrder and comments under [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md), then follow only that role's route plus files explicitly required by the WorkOrder.
3. Treat unpersisted chat as local context, never cross-session shared truth.

## Role routes

### Master Agent

- Read the project lane in [`docs/agents/current-assignment.md`](docs/agents/current-assignment.md), the issue conventions in [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md), and accepted limits in [`docs/evidence/verified-project-facts.md`](docs/evidence/verified-project-facts.md).
- Triage Issue Candidates, publish role-compatible WorkOrders, set priority/budget/dependencies, freeze `main` during review, and route Handoff/Verdict. Fast-forward the exact accepted candidate SHA; do not implement, independently accept, recall Builder for landing, or curate the Wiki.

### Working Agent | Builder

- Read the assigned WorkOrder, [`CONTEXT.md`](CONTEXT.md), the project lane, [`docs/governance/verification.md`](docs/governance/verification.md), and only the ADR/design/code/tests relevant to that WorkOrder.
- Produce candidate implementation and Evidence within the allowed write scope. Commit and push it on `workorder/<issue>-candidate`, then bind the Handoff to the full commit SHA; never push `main`. Do not self-accept or switch tasks; return `ScopeChallenge` when the assignment should change.

### Regulator Agent

- First fetch the assigned WorkOrder and its latest Human/Master comments, then read its Criteria, [`docs/governance/verification.md`](docs/governance/verification.md), primary Evidence, source, tests, and relevant ADRs.
- Use a separate Regulator session/process and clean worktree, fetch and inspect the exact remote candidate SHA, distrust the Handoff summary, add independent negative probes outside that candidate, and return a SHA-bound Verdict. Self-acceptance is forbidden.

### Learning Wiki Agent

- Read only the assigned learning question/sources, [`wiki/index.md`](wiki/index.md), and [`wiki/SCHEMA.md`](wiki/SCHEMA.md); follow linked Evidence only when needed for provenance.
- Use the Schema's Ingest operation and admit only a Verified Learning Fact or an Open Learning Question. Append material changes to [`wiki/log.md`](wiki/log.md). Do not modify implementation, governance decisions, or fact registers.

## Cross-role gates

- An executable WorkOrder and its required fields follow [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md); a Handoff or Verdict follows [`docs/governance/verification.md`](docs/governance/verification.md).
- Before claiming implementation progress, cite [`docs/evidence/verified-project-facts.md`](docs/evidence/verified-project-facts.md). Specs, README prose, Wiki pages, tests, and summaries are not Verified Project Facts.
- Before relying on a new source, Ingest it under the Wiki Schema. The Wiki cannot promote a project or resume fact.
- Project results do not become resume or other external facts inside this repository; external disclosure requires human approval of the atomic Claim and disclosure boundary plus a separately authorized host workflow.
- High-risk security, authority, credential, deletion, production, public-benchmark, attribution, and disclosure Claims require the extra Gate in verification governance.

## Optional host integration

When this repository is embedded in a larger private workspace, a WorkOrder may name an external file as a task-specific input. That integration is optional and absence-safe: an external file is never a repository startup or verification prerequisite, and its absence does not change the repository-local role, WorkOrder, Handoff, or Verdict contracts.
