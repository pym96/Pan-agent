# Anthropic: official harness definitions

- Type: verified-learning-fact
- Verification: source-located
- Source: two Anthropic pages fetched 2026-08-23 — <https://www.anthropic.com/research/trustworthy-agents> and <https://www.anthropic.com/engineering/managed-agents>
- Updated: 2026-08-23

## Verified facts

- The trustworthy-agents page decomposes an agent into four components — the model, tools, an environment, and a harness — and defines: "A harness. This refers to the instructions, and the guardrails, that the model operates under."
- The same page states that agents' behavior depends on all four layers working together, and that a well-trained model can still be exploited through a poorly configured harness, an overly permissive tool, or an exposed environment. Example given: the harness might tell Claude to flag anything over a hundred dollars, or to never submit expenses without user confirmation.
- The managed-agents page splits the agent runtime into three virtualized parts: a session ("the append-only log of everything that happened"), a harness ("the loop that calls Claude and routes Claude's tool calls to the relevant infrastructure"), and a sandbox (the execution environment where code runs).
- The same page assigns context management to the harness: the harness writes to the session via `emitEvent(id, event)`, fetched events can be transformed in the harness before entering Claude's context window, and "the interfaces push that context management into the harness."
- The same page states "Claude Code is an excellent harness that we use widely across tasks", notes that task-specific agent harnesses excel in narrow domains, and describes Managed Agents itself as a "meta-harness" that can host such harnesses.
- Anthropic's narrow usage therefore treats tools and the environment/sandbox as adjacent layers that the harness routes to, while the broader industry usage ("everything outside the model") folds them into the harness.

## Boundaries

- These are vendor publications: they establish Anthropic's own usage of the term, not an industry-wide standard.
- Secondary accounts attributing additional quotable lines (for example LangChain's "Agent = Model + Harness") were not verified against primary sources and are deliberately not recorded.
- The pages make design claims about their own products; no external performance numbers are established by this ingest.

## Links

- [Harness Engineering fact](../concepts/harness-engineering.md)
- [Hung-yi Lee Harness Engineering lecture](2026-08-17-harness-engineering-lecture.md)
- [SWE-agent paper](2026-08-20-swe-agent-paper.md)
- [ReAct paper](2026-08-20-react-paper.md)
