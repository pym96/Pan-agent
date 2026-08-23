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

### Triangulated

- [Harness Engineering](concepts/harness-engineering.md)
- [Distrust-driven verification](concepts/distrust-driven-verification.md)

### Experiment-reproduced

- [Visible ReAct versus Act-only in the frozen five-case development smoke](experiments/2026-08-23-react-vs-act-swebench.md)

## Open Learning Questions

- [Cross-domain failure-mode question](questions.md)
- [First cross-domain experiment question](experiments/README.md)
- [Failure-retention question](failures/README.md)
- [Multi-agent coordination protocol question](questions/multiagent-runtime-coordination.md)

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
