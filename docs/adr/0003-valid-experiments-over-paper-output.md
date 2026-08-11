# ADR-0003: Measure v1 by experiment auditability and validity, not publication

- Status: Accepted
- Date: 2026-08-11

## Context

Research improvement is stochastic and publication is affected by factors outside the Harness. Optimizing for a paper or only for positive results would encourage cherry-picking, evaluator contamination, and hidden failures.

## Decision

v1 targets a 100% Auditable Attempt Rate and at least an 80% Valid Experiment Rate across its acceptance campaign. Improvement Rate is reported without a required minimum. A Research Outcome is welcome but not required for v1 acceptance.

## Consequences

Crashes, OOMs, timeouts, rejected hypotheses, and null results remain first-class evidence when correctly recorded and resolved. Generated prose cannot substitute for a reproduced result.
