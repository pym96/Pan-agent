# chengyongru: a preliminary survey of multi-agent collaboration problems

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://x.com/chengyongru/status/2089289757138575737> (X article `multiagent 协作问题的初步整理` by @chengyongru, nanobot maintainer, posted 2026-08-17; full text captured via the fxtwitter API on 2026-08-19, with the tier table and dialogue example transcribed verbatim by the user from the original post)
- Updated: 2026-08-19

## Verified facts

The article itself makes the following statements. `source-located` here means the source was inspected and does make these statements; it does not establish that the cited papers actually show them.

- The article defines four tiers of multi-agent problems in a table:
  1. Multi-prompt workflow — one model plays planner, critic, and reviewer roles.
  2. Centrally orchestrated expert collection — one orchestrator dynamically selects models, tools, or subagents.
  3. Distributed collaboration system — agents hold different information, state, tools, or permissions, with no single omniscient node.
  4. Open agent ecosystem — members, goals, coalitions, roles, and institutions can all change dynamically.
- For tiers 1–2 (composite reasoning / workflow optimization), the article cites two 2026 papers: OneFlow [1] reportedly found that multi-agent workflows built on one base model can usually be simulated by a single agent over multiple turns at lower cost via KV-cache reuse across seven benchmarks; another paper [2] reportedly found that after matching thinking-token budgets, a single agent matched or beat multi-agent systems across two multi-hop reasoning benchmarks, three model families, and five MAS architectures.
- The article's derived rule: a multi-agent workflow is justified only if it exploits a condition a single agent lacks — different models/tools/real capabilities, different private information or context, different permissions or trust domains, environment actions that must execute in parallel, different owners/goals/incentives, or long-term state beyond one agent's capacity — otherwise it is probably just a more expensive single-agent workflow.
- For tiers 3–4 (irreducible coordination problems), the article reports six negative results:
  - SILO-BENCH (ACL 2026) [7]: agents in information silos communicate actively but fail to turn communication into correct distributed reasoning ("Communication-Reasoning Gap"); at 50+ agents on the hardest task class, success drops to zero.
  - A SIGDIAL 2026 embodied-collaboration study [8]: dialogue between two agents reduced action conflicts by about 40–90 percentage points, yet final task success was lower than silent collaboration (illustrated with a six-turn "I'll move the table" / "Copy" / "Are you sure?" / "Sure" confirmation exchange).
  - "Multi-Agent Teams Hold Experts Back" (ICML 2026) [3]: even when told who the real expert is, free-collaboration teams average opinions instead of deferring to the expert, and the averaging worsens with more agents; the same tendency also dilutes malicious agents, so there is a real tradeoff between expert utilization and malicious-node resistance.
  - "Relational Priors as Convergence Pressure" [4]: making agents more trusting, cooperative, and friendly increases agreement but not necessarily objective correctness.
  - "When 20 Agents Fail to Sort" [5]: in MAS-BENCH, agents each seeing only part of an array fail at collaborative global sorting due to inconsistent shared state, inconsistent communication conventions, duplicate submissions, and no agreed termination signal; the paper proposes a lightweight coordination mechanism called CAMOC.
  - DPBench [6]: models that behave normally in sequential decision-making show deadlock rates up to 90% by default and 100% under a minimal-prompt setting once they compete for resources simultaneously.
- The article questions whether natural language is the right inter-agent protocol, suspecting many papers study "how multiple ChatGPTs chat" rather than how agents collaborate.
- The article's engineering conclusion: a real multi-agent runtime must re-face classic distributed-systems coordination problems — commit protocols, resource ordering, locks and leases, state versioning, idempotent operations, termination detection — as explicit, executable, verifiable protocols, not prompt-level behavioral advice such as "please avoid duplicate work".
- The article closes by noting that fault attribution in a multi-agent system is itself hard, and announces itself as the first of a planned series.

## Reference list as cited by the article

1. <https://arxiv.org/abs/2601.12307>
2. <https://arxiv.org/abs/2604.02460>
3. <https://arxiv.org/abs/2602.01011>
4. <https://arxiv.org/abs/2608.03239>
5. <https://aclanthology.org/2026.findings-acl.1698>
6. <https://arxiv.org/abs/2602.13255>
7. <https://aclanthology.org/2026.acl-long.1354.pdf>
8. <https://aclanthology.org/2026.sigdial-1.21>

## Boundaries

- This is one practitioner's secondary survey. None of the eight references has been read first-hand; on 2026-08-19 all eight URLs were only confirmed to resolve (HTTP 200). Paper titles, venue attributions, and all numbers (seven benchmarks, 40–90 percentage points, 50+ agents to zero, 90–100% deadlock) are recorded as the article's claims.
- The article's "single-agent justification rule" and its natural-language-protocol skepticism are the author's interpretation of the cited papers, not established consensus.
- The survey concerns multi-agent systems; the current project boundary is a single-agent General Runtime plus Vertical Domain Packs, and this page does not expand that boundary.
- The author's nanobot product aside carries no learning content and is intentionally not recorded.
- No statement on this page is a project fact, benchmark result, or resume fact.

## Links

- [Multi-agent coordination protocol question](../questions/multiagent-runtime-coordination.md)
- [Harness Engineering fact](../concepts/harness-engineering.md)
- [Distrust-driven verification fact](../concepts/distrust-driven-verification.md)
- [PinchBench v2.0.0 task and runner mechanics](2026-08-18-pinchbench-v2.md)
- [Composio 30-task agent comparison methodology](2026-08-18-composio-agent-benchmark-thread.md)
