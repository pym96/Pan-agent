# Agent Map | Workspace Agent Harness

This file is a navigation map and trigger list, not a glossary, implementation-fact register, design specification, or learning notebook.

## Required read order

1. [`CONTEXT.md`](CONTEXT.md) - canonical project-domain language.
2. [`docs/agents/current-assignment.md`](docs/agents/current-assignment.md) - current mission, bounded assignment, non-goals, and handoff contract.
3. [`docs/governance/verification.md`](docs/governance/verification.md) - Working/Regulator roles, Evidence, Criteria, Acceptance Gates, independence, and fact promotion.
4. [`docs/evidence/verified-project-facts.md`](docs/evidence/verified-project-facts.md) - only project-level source of truth for verified implementation facts.
5. [`wiki/index.md`](wiki/index.md) and [`wiki/SCHEMA.md`](wiki/SCHEMA.md) - Learning Wiki entry point and admission/maintenance contract.
6. Accepted architecture decisions under [`docs/adr/`](docs/adr/) and the active design entries at [`docs/design/general-vertical-system.md`](docs/design/general-vertical-system.md) and [`docs/design/benchmark-strategy.md`](docs/design/benchmark-strategy.md).
7. Career-side target contract at [`../../10-愿景与目标/目标岗位.md`](../../10-愿景与目标/目标岗位.md).

## Triggers

- Before changing product terminology, follow the terminology-change protocol in `docs/governance/verification.md`; keep exactly one active definition in `CONTEXT.md`.
- Before relying on a new external source, use the Wiki Schema's Ingest operation. Admit only a Verified Learning Fact or an Open Learning Question as a knowledge object.
- After a material experiment or failure, preserve its provenance record, update the supported learning fact/question, and append to `wiki/log.md` without rewriting earlier entries.
- Before claiming implementation progress, cite `docs/evidence/verified-project-facts.md`. A spec, README, Wiki page, passing structure check, or Working Agent summary is not a Verified Project Fact.
- Before accepting a handoff, use a separate Regulator session/process, inspect primary Evidence, add or rerun negative tests, and apply the risk tier in the governance contract. Self-acceptance is forbidden.
- Before any reality-resume migration, require a Verified Project Fact, human approval of the atomic Claim and disclosure boundary, and A/B registration in the career factual ledger.
- Do not edit the career factual ledger or reality resume from this repository unless the human user explicitly assigns that separate high-risk task.

## Handoff entry points

- Current work and required outputs: [`docs/agents/current-assignment.md`](docs/agents/current-assignment.md)
- Verification command and evidence format: [`docs/governance/verification.md`](docs/governance/verification.md)
- Current accepted facts and explicit limits: [`docs/evidence/verified-project-facts.md`](docs/evidence/verified-project-facts.md)
- Learning updates: [`wiki/index.md`](wiki/index.md), [`wiki/log.md`](wiki/log.md)
