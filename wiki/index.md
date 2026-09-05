# Learning Wiki Index

This Wiki contains only Verified Learning Facts and Open Learning Questions. It is outside the Workspace Agent Harness product boundary and cannot promote project or resume facts.

## Control

- [Schema and operations](SCHEMA.md)
- [Append-only learning log](log.md)

## Verified Learning Facts

### Source-located

- [First-hand Agent engineering advice](sources/2026-08-13-agent-practice.md)
- [Hung-yi Lee: Harness Engineering lecture](sources/2026-08-17-harness-engineering-lecture.md)
- [Lidang: agent field entry Q&A](sources/2026-08-17-agent-career-qna.md)
- [lidangzzz/goal-driven](sources/2026-08-17-goal-driven-repo.md)
- [nashsu/llm_wiki](sources/2026-08-17-llm-wiki-repo.md)
- [Agent DX CLI scale](sources/2026-08-17-agent-dx-cli-scale.md)
- [DPO and preference-optimization terminology](sources/2026-08-18-dpo-preference-optimization.md)
- [Skill packaging: SKILL.md, layered loading, install scopes](sources/2026-08-18-skill-packaging-mechanics.md)
- [PinchBench v2.0.0 task and runner mechanics](sources/2026-08-18-pinchbench-v2.md)
- [Composio 30-task agent comparison methodology](sources/2026-08-18-composio-agent-benchmark-thread.md)
- [3Blue1Brown: cross-entropy, compression, and LLM training](sources/2026-08-19-cross-entropy-compression.md)
- [chengyongru: multi-agent collaboration survey](sources/2026-08-19-multiagent-collaboration-survey.md)
- [ReAct: Synergizing Reasoning and Acting in Language Models](sources/2026-08-20-react-paper.md)
- [SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering](sources/2026-08-20-swe-agent-paper.md)
- [SWE-bench Harness, dataset metadata, and ARM Docker execution](sources/2026-08-20-swe-bench-harness.md)
- [Anthropic: official harness definitions](sources/2026-08-23-anthropic-harness-definitions.md)
- [Earendil: What is a harness (four-component framing)](sources/2026-08-23-earendil-what-is-a-harness.md)
- [DeepSeek JSON Output and Strict Function Calling](sources/2026-08-23-deepseek-structured-output.md)
- [Trace versus thought trajectory](concepts/trace-vs-thought-trajectory.md)
- [Model Context Protocol: official documentation and the "why MCP matters" claims](sources/2026-08-26-mcp-official-docs.md)
- [Anthropic: Harness design for long-running applications](sources/2026-08-26-anthropic-long-running-harness.md)
- [Provider tool-call envelopes: Anthropic blocks vs OpenAI tool_calls](sources/2026-08-28-provider-tool-envelopes.md)
- [SWE-bench and the 2026 SWE-agent benchmark landscape](sources/2026-08-28-swe-benchmark-landscape.md)
- [ACI as atomic work design](concepts/aci-atomic-work.md)
- [DeepSeek thinking-mode tool-call contract](sources/2026-08-29-deepseek-thinking-tool-contract.md)
- [Andrew Ng: AI Engineering Skills Map and follow-up article](sources/2026-08-25-andrew-ng-skills-map.md)

### Triangulated

- [Harness Engineering](concepts/harness-engineering.md)
- [Distrust-driven verification](concepts/distrust-driven-verification.md)
- [Canonical conversation](concepts/canonical-conversation.md)
- [Honest capability degradation and the three-gate model](concepts/honest-degradation-three-gates.md)
- [Signal–decision separation](concepts/signal-decision-separation.md)
- [Handoff](concepts/handoff.md)
- [Harness, MCP, and skills: three capability layers](concepts/harness-mcp-skills.md)

### Experiment-reproduced

- [Visible ReAct versus Act-only in the frozen five-case development smoke](experiments/2026-08-23-react-vs-act-swebench.md)
- [Fixed-context DeepSeek action-protocol reliability](experiments/2026-08-23-protocol-reliability-v1.md)
- [Maximum-token sensitivity in Strict ReAct action generation](experiments/2026-08-24-protocol-max-token-sensitivity.md)

## Open Learning Questions

- [Cross-domain failure-mode question](questions.md)
- [First cross-domain experiment question](experiments/README.md)
- [Failure-retention question](failures/README.md)
- [Multi-agent coordination protocol question](questions/multiagent-runtime-coordination.md)
- [Why does self-generated thought improve action quality?](questions/why-self-generated-thought-helps.md)
- [Do grading criteria steer generation quality before any feedback loop?](questions/do-criteria-steer-generation-quality.md)

## External decisions and facts

- [Architecture decisions](../docs/adr/)
- [Governance decisions](../docs/governance/decisions/)
- [Verified Project Facts](../docs/evidence/verified-project-facts.md)

## Maintenance rhythm

- Ingest before relying on a new source.
- Admit only one of the two Schema-defined knowledge objects.
- Append every material learning update or correction to `log.md`.
- Run Lint before a release or resume-evidence review.
- Never rewrite an old log entry to hide a failed path.
