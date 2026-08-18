# lidangzzz/goal-driven repository

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://github.com/lidangzzz/goal-driven> (README inspected 2026-08-12)
- Updated: 2026-08-18

## Verified facts

- The repository is a prompt template rather than an implementation library.
- Its named elements are Goal, Criteria, Subagent, and a controlling Master Agent.
- Its loop asks the Master to continue while Criteria are unmet, inspect subagent progress, verify claimed completion, and restart failed or stalled work.
- The README warns about token/time cost and advises against installing the full prompt as a context-polluting skill.

## Boundaries

- Source inspection verifies the template's instructions, not that the workflow guarantees correct results.
- The repository does not supply independent-process enforcement, project-specific Criteria, or this project's Acceptance Gate.

## Links

- [Distrust-driven verification fact](../concepts/distrust-driven-verification.md)
- [Verification governance](../../docs/governance/verification.md)
