# First cross-domain experiment question

> This page retains the first open cross-domain experiment question. Completed, date-scoped experiment facts are indexed below and in [`../index.md`](../index.md).

## Completed experiment facts

- [`2026-08-23-protocol-reliability-v1.md`](2026-08-23-protocol-reliability-v1.md): frozen 240-slot DeepSeek provider×protocol reliability measurement, including raw/effective L0–L3 validity, repair cost, cohort splits, and identity scope.
- [`2026-08-24-protocol-max-token-sensitivity.md`](2026-08-24-protocol-max-token-sensitivity.md): 2K/4K/8K fixed-context sensitivity plus a separately identified 16K extension, showing that higher ceilings extend many malformed responses without a monotonic L3 gain.

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
