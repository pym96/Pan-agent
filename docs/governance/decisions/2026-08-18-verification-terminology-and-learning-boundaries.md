# Verification, terminology, and learning boundaries

- Decision-State: accepted
- Verification-State: passed
- Human source: `career-planning/00-控制与决策/人类反馈.md`, `HF-20260818-019`
- Decided: 2026-08-18
- Supersedes: `wiki/decisions/2026-08-17-terminology-rulings.md`

## Decision

1. Evidence is any inspectable artifact or observation with provenance. Tests and Domain Evaluators are verification mechanisms, not its two exclusive producers.
2. Verified Project Facts live in `docs/evidence/verified-project-facts.md`; AGENTS is a map and cannot be the fact register.
3. Human approval applies to an atomic external Claim and disclosure boundary; meaning-preserving edits do not require reapproval, semantic expansion does.
4. Decision authority and implementation verification use separate state fields.
5. Regulator independence is risk-tiered: separate process and independent evidence/tests for all work; a different model family or human review for high-risk acceptance.
6. `CONTEXT.md` owns only project-specific product language. Verification process belongs in `docs/governance/`, project facts in `docs/evidence/`, learning records in `wiki/`, and navigation in `AGENTS.md`.
7. `AgentLoop ⊂ General Agent Runtime ⊂ Workspace Agent Harness`; the Learning Wiki and development-process Agents are outside the product boundary.
8. Candidate Claims are not bound to the Wiki. Fact promotion consumes an Evidence Bundle and an independent Gate.
9. The Wiki admits only Verified Learning Facts and Open Learning Questions as knowledge objects; raw source, experiment, and failure pages exist only as provenance records supporting them.
10. Product-semantic terminology changes require human approval and a negative regression test; meaning-preserving clarification may be accepted by an independent Regulator.

## Verification condition

Set `Verification-State: passed` only after a Regulator from a different session/process independently confirms that:

- all canonical files implement this decision without contradictory active definitions;
- the negative tests reject the superseded closed-Evidence, AGENTS-as-fact-register, process-terms-in-CONTEXT, and unrestricted-Wiki models;
- the complete acceptance suite passes after `HF-20260818-019` is resolved;
- the Regulator did not author the candidate implementation being accepted.
