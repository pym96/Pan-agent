# Agent DX CLI scale

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://skills.sh/jpoehnelt/skills>; locally inspected `agent-dx-cli-scale/SKILL.md`, derived from Justin Poehnelt's "You Need to Rewrite Your CLI for AI Agents"
- Updated: 2026-08-18

## Verified facts

- The rubric scores seven agent-facing CLI axes from 0 to 3, for a 0-21 total and four named readiness bands.
- The axes cover machine-readable output, raw JSON input, schema introspection, context-window discipline, input hardening, safety rails, and versioned agent knowledge packaging.
- The source treats agent input as a security boundary and recommends dry-run behavior plus response sanitization.
- It lists MCP stdio, plugin installation, and headless authentication as unscored optional surfaces.

## Boundaries

- This is a source-authored rubric, not a benchmark result for this project.
- The rubric has not been applied to a released Workspace Agent Harness CLI because no such CLI is a Verified Project Fact.

## Links

- [Harness Engineering fact](../concepts/harness-engineering.md)
- [Distrust-driven verification fact](../concepts/distrust-driven-verification.md)
- [Verification governance](../../docs/governance/verification.md)
