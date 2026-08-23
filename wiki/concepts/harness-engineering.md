# Harness Engineering

- Type: verified-learning-fact
- Verification: triangulated
- Source: [Hung-yi Lee lecture](../sources/2026-08-17-harness-engineering-lecture.md), [Agent DX CLI scale](../sources/2026-08-17-agent-dx-cli-scale.md), pinned DeerFlow checkout `88252e9b318d34e7e1867155ad2c77993320788e`, and [Anthropic's official harness definitions](../sources/2026-08-23-anthropic-harness-definitions.md)
- Updated: 2026-08-23

## Verified facts

- The inspected sources converge on a Harness as non-model infrastructure that shapes agent execution through rules, tools, interfaces, workflows, state, and feedback.
- Anthropic's primary sources define the harness normatively — "the instructions, and the guardrails, that the model operates under" — and operationally — "the loop that calls Claude and routes Claude's tool calls to the relevant infrastructure" — with context management deliberately placed inside the harness.
- First-principles core: a raw model call is a stateless text-to-text function, so any identity, instruction-following frame, action execution, continuation, memory, or enforcement an agent exhibits must be supplied by non-model components; that supplying layer is the harness.
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
- [Anthropic harness definitions source](../sources/2026-08-23-anthropic-harness-definitions.md)
- [Domain language](../../CONTEXT.md)
- [Current assignment](../../docs/agents/current-assignment.md)
- [Cross-domain failure-mode question](../questions.md)
