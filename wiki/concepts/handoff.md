# Handoff

- Type: verified-learning-fact
- Verification: triangulated
- Source: this repository's governance definition (`docs/governance/verification.md:7-23`, read 2026-08-27) and role rules (`AGENTS.md`, `00-控制与决策` rules 10-11); [Anthropic: Harness design for long-running applications](../sources/2026-08-26-anthropic-long-running-harness.md) (reset handoff artifact; three agents communicating entirely via files); DeerFlow's lead-agent/subagent file-based delegation (pinned `88252e9b`, mechanism level per the earlier exploration report). Definition wording converged with the user in session on 2026-08-27.
- Updated: 2026-08-27

## Verified facts

**Definition adopted by this Wiki (user-converged):** a handoff is the transfer of state and responsibility between nodes in a system — **through an explicit artifact**.

Four defining elements:

1. **A boundary** — handoffs exist only at node boundaries: context-window reset, session end, role switch (Working → Regulator), agent switch (orchestrator → subagent).
2. **An explicit carrier** — the transfer goes through a file/artifact, not memory or chat. Without this element the mechanism is shared state, not handoff; this is what makes the transfer auditable. The career-level rule "chat not written to disk is not a shared fact" is the same discipline in legal form.
3. **Responsibility travels with state** — the receiver owns the next step, not just the information.
4. **Governance-strengthened: the receiver does not inherit trust** — the governance contract states that a Handoff "links produced artifacts, primary Evidence, executed checks, limitations, unresolved items, and candidate next steps. **Its narrative is not Evidence by itself.**" A handoff is a pointer bundle to Evidence; the Regulator's first act is independent re-verification, not belief.

The same pattern at three scales:

| Scale | Boundary | Carrier | Instance |
|---|---|---|---|
| Context | window reset within one run | handoff artifact | Anthropic's reset: clear the window, carry a structured handoff document |
| Session/role | session, role | Handoff document + Evidence bundle | this project's WorkOrder → Handoff → Verdict flow |
| Multi-agent | agent process | files | Anthropic's planner/generator/evaluator communicating entirely via files |

Why the concept is first-principles for agent systems: the raw model call is stateless, so continuity across any boundary is never free — it must be manufactured explicitly. Handoff is the manufacturing mechanism. This closes the earlier reset-versus-compact discussion: **compaction is a handoff without an artifact** — implicit self-transfer with opaque loss; a reset with a handoff artifact is the explicit form. "Changing identity is not the sin; changing it without an audit trail is" restated: compaction is handoff minus the carrier.

## Boundaries

- The definition is a session synthesis grounded in the sources above; it is not an industry-standard term of art, and other communities use "handoff" more loosely (e.g., framework-level agent routing).
- Element 4 (non-inherited trust) is a governance property of this project's distrust-driven regime, not a property of all handoffs in all systems; database failovers, for instance, transfer state without a verification posture.
- The real-world analogy to standardized shift-handover protocols (e.g., medicine) was offered in session as general knowledge and is deliberately not recorded as a fact here.
- Nothing on this page is a Verified Project Fact or resume evidence.

## Links

- [Canonical conversation](canonical-conversation.md) — the state layer whose explicitness handoff depends on.
- [Honest capability degradation and the three-gate model](honest-degradation-three-gates.md) — the two-identity rule; reset-with-handoff as the auditable identity change.
- [Distrust-driven verification](distrust-driven-verification.md) — element 4's home concept.
- [Anthropic: Harness design for long-running applications](../sources/2026-08-26-anthropic-long-running-harness.md)
