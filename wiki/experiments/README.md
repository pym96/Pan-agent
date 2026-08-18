# First cross-domain experiment question

- Type: open-learning-question
- Verification: open
- Source: the unimplemented proof-domain contract in `docs/agents/current-assignment.md`
- Updated: 2026-08-18

## Question

What is the smallest controlled experiment that can falsify the claim that one unchanged Runtime executes both proof domains under domain-owned evaluators and authority limits?

## Why it matters

A passing demo can hide domain branching inside Runtime or evaluator-specific shortcuts; a falsifiable experiment defines the seam before implementation.

## Known boundaries

- There is no accepted Domain Pack implementation or formal cross-domain run.
- The historical 30-task Local Workspace suite is not the active experiment contract.
- Model, Runtime configuration, and public Runtime entry point must remain fixed across domains.

## Verification path

Freeze one task/fixture/evaluator per domain, record pack version/hash, assert no Runtime source diff, execute the same Runtime entry point, and include negative cases for authority escalation and evaluator mutation. Promote results only after independent reproduction.

## Links

- [Cross-domain failure-mode question](../questions.md)
- [Failure-retention question](../failures/README.md)
- [Current assignment](../../docs/agents/current-assignment.md)
