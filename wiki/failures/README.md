# Failure-retention question

- Type: open-learning-question
- Verification: open
- Source: current AgentLoop terminal boundaries and the target requirement for attributable cross-domain failures
- Updated: 2026-08-18

## Question

What minimum failure record preserves enough provenance to distinguish Runtime, policy, tool, domain-task, and evaluator failures without allowing failed cases to be deleted or relabeled after results are known?

## Why it matters

Collapsed or mutable failure labels make iteration conclusions, evaluator quality, and resume metrics impossible to audit.

## Known boundaries

- Existing terminal tests cover only the verified AgentLoop boundary recorded in the project fact register.
- No live-provider, Domain Pack, evaluator, recovery, or formal benchmark failure corpus is verified.
- An agent-authored narrative is not sufficient Evidence.

## Verification path

Predeclare the taxonomy and immutable identifiers, preserve task/pack/config hashes, Trace, artifact diff, evaluator output, and terminal cause, then inject at least one failure per layer and have an independent Regulator recompute the classification.

## Links

- [Verified Project Facts](../../docs/evidence/verified-project-facts.md)
- [First experiment question](../experiments/README.md)
- [Verification governance](../../docs/governance/verification.md)
