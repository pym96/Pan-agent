# Harness Engineering

- Type: verified-learning-fact
- Verification: triangulated
- Source: [Hung-yi Lee lecture](../sources/2026-08-17-harness-engineering-lecture.md), [Agent DX CLI scale](../sources/2026-08-17-agent-dx-cli-scale.md), and pinned DeerFlow checkout `88252e9b318d34e7e1867155ad2c77993320788e`
- Updated: 2026-08-18

## Verified facts

- The inspected sources converge on a Harness as non-model infrastructure that shapes agent execution through rules, tools, interfaces, workflows, state, and feedback.
- Natural-language guidance affects behavior but does not enforce authority; capability boundaries require executable controls and negative checks.
- Tool interface shape, structured I/O, context discipline, input hardening, dry-run behavior, and feedback surfaces are recurring engineering levers.
- DeerFlow's inspected package layout separates reusable harness mechanisms from application services, providing an architecture reference rather than local implementation.

## Boundaries

- Triangulation establishes recurring mechanisms, not a universal Harness architecture or optimal design for every model.
- Project terminology and the `AgentLoop ⊂ General Agent Runtime ⊂ Workspace Agent Harness` boundary come from governance/domain decisions, not from this learning page.
- No fact here establishes that this repository implements the target Harness boundary.

## Links

- [Harness Engineering source](../sources/2026-08-17-harness-engineering-lecture.md)
- [Agent DX source](../sources/2026-08-17-agent-dx-cli-scale.md)
- [Domain language](../../CONTEXT.md)
- [Current assignment](../../docs/agents/current-assignment.md)
- [Cross-domain failure-mode question](../questions.md)
