# Cross-domain failure-mode question

- Type: open-learning-question
- Verification: open
- Source: the accepted General Runtime + Vertical Domain Pack target and the absence of accepted proof-domain contracts
- Updated: 2026-08-18

## Question

Do `data-analysis` and `workspace-coding` expose materially different task and failure modes while remaining executable through one stable Runtime and Domain Pack interface?

## Why it matters

If the domains differ only in prompts or tool names, they do not provide a Generality Proof and the proposed seam is decorative.

## Known boundaries

- The two proof-domain names and the no-Runtime-edit invariant are already accepted target constraints.
- No Verified Project Fact establishes either Domain Pack, evaluator, or cross-domain result.
- A third domain cannot compensate for weak first and second domains.

## Verification path

Define one realistic bounded task, authority boundary, fixture, and deterministic evaluator per domain; write failing interchangeability and non-escalation contract tests at the same external seam; then compare the required domain-owned variation without editing Runtime source.

## Links

- [Current assignment](../docs/agents/current-assignment.md)
- [Harness Engineering fact](concepts/harness-engineering.md)
- [First experiment question](experiments/README.md)
