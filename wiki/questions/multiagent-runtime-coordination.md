# Multi-agent coordination protocol question

- Type: open-learning-question
- Verification: open
- Source: [chengyongru multi-agent collaboration survey](../sources/2026-08-19-multiagent-collaboration-survey.md)
- Updated: 2026-08-19

## Question

If a future requirement ever justifies multi-agent execution beyond the current single-agent General Runtime, which coordination mechanisms — commit protocols, resource ordering, locks and leases, state versioning, idempotent operations, termination detection — must be encoded in the Runtime as explicit, executable, verifiable protocols, and which (if any) can safely remain prompt-level policy?

## Why it matters

The surveyed evidence claims that prompt-level behavioral advice does not solve coordination (deadlock, duplicate submission, no agreed termination), so the Runtime-vs-prompt placement decision would determine whether any future multi-agent capability is testable at all. Deciding the placement rule in advance also sharpens how we read external multi-agent benchmark claims during learning, without expanding the current product scope.

## Known boundaries

- The accepted product boundary is a single-agent General Runtime plus Vertical Domain Packs; no multi-agent capability is in the current plan, and this question does not reopen that scope.
- All cited multi-agent results are second-hand from the survey; the eight referenced papers have not been read first-hand.
- The survey's single-agent justification rule (a multi-agent workflow must exploit a condition a single agent lacks) is the accepted framing for judging whether this question ever activates.

## Verification path

If and only if a concrete requirement matching the justification rule appears: read the primary papers first-hand (SILO-BENCH, When 20 Agents Fail to Sort, DPBench at minimum), map each observed failure mode to a candidate Runtime mechanism or prompt rule in a design review, and route any adoption through the ADR and independent-Regulator gates.

## Links

- [chengyongru multi-agent collaboration survey](../sources/2026-08-19-multiagent-collaboration-survey.md)
- [General + Vertical system design](../../docs/design/general-vertical-system.md)
- [Harness Engineering fact](../concepts/harness-engineering.md)
