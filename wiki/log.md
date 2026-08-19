# Append-only Learning Log

Do not edit or delete existing entries. Corrections are new entries that link to the earlier record.

## 2026-08-13｜Product migration

- Ingested: private first-hand advice from an engineer working on a data-analysis Agent.
- Decision: migrate the product from autonomous research to a Local Workspace Agent while preserving the bounded loop and Trace implementation.
- Evidence: ADR-0008 and the 30-task v1 contract.
- Open: validate six seed tasks before freezing the full Evaluation Suite.

## 2026-08-17｜Learning ingest: harness engineering and agent-design sources

- Ingested five sources: Hung-yi Lee Harness Engineering lecture; Lidang agent career Q&A recording; lidangzzz/goal-driven; nashsu/llm_wiki; jpoehnelt Agent DX CLI scale.
- Added concepts: Harness Engineering; Distrust-driven verification.
- Rationale: recent working sessions produced design-relevant claims (harness three-lever taxonomy, model-specific harness, agents-as-untrusted-operators) that the Runtime/Domain Pack design gate will rely on; per Schema, sources are ingested before use.
- Open: map the harness three-lever taxonomy onto `docs/design/deerflow-mechanism-map.md`; evaluate per-model workflow knobs when the model adapter becomes real.

## 2026-08-17｜Decision: terminology rulings recorded

- Decision page: decisions/2026-08-17-terminology-rulings.md (glossary home, Working/Regulator independence, naming ladder, verification vocabulary, fact-promotion ladder).
- CONTEXT.md gained a "Process and verification vocabulary" section; the historical "Workspace Agent Harness" entry now points to the active definition.
- Correction: harness-engineering.md previously equated General Runtime with the Harness; fixed to the ruled ladder (AgentLoop ⊂ Runtime ⊂ Harness; Wiki outside the product boundary).
- Note: Evidence has exactly two producers (Tests, Domain Evaluator); Criteria are the Gate's yardstick, not evidence.

## 2026-08-18 | Correction: learning and verification boundaries

- Human ruling: the 2026-08-17 closed-Evidence statement is superseded. Evidence may be any inspectable artifact or observation with provenance; Tests and Domain Evaluators are verification mechanisms, not exclusive producers.
- Governance moved out of the Learning Wiki to `docs/governance/`; independently accepted implementation facts now belong only in `docs/evidence/verified-project-facts.md`.
- CONTEXT.md now contains project-specific product language only, and AGENTS.md is a navigation map.
- Wiki admission narrowed to Verified Learning Facts and Open Learning Questions. Unverified interpretation must become a question with a verification path or remain outside the Wiki.
- Decision authority is accepted by the human; implementation verification remains pending until a separate Regulator session accepts this change.

## 2026-08-18｜Regulator acceptance: HF-20260818-019

- Independent Regulator (separate session/process, different model family) verified the verification/terminology/learning-boundary decision: canonical files consistent, negative tests effective (three independent mutation probes), 71+15 tests rerun, full acceptance gate PASS.
- Governance decision `Verification-State: passed`; HF-019 marked processed.
- Defect found and fixed during review: the governance state test was coupled to the live pending state and would fail precisely when verification passed; now derives both state variants synthetically.
- Record: independent Regulator acceptance record, 2026-08-18 (held in the unpublished governance workspace).

## 2026-08-18｜Learning ingest: DPO terminology and skill packaging mechanics

- Ingested: DPO = Direct Preference Optimization (arXiv:2305.18290), correcting the user's initial "Deep Policy Optimization" expansion; PPO = Proximal Policy Optimization is a separate object.
- Ingested: skill packaging mechanics (one directory per skill, harness-generated frontmatter listing, progressive disclosure, local vs global install scopes), observed from the agent-dx-cli-scale install.
- Note: the same session's first-principles "essence of wiki" discussion was left outside the Wiki per the admission boundary (interpretation without a verification path is not a knowledge object).

## 2026-08-18 | Learning ingest: general and vertical evaluation references

- Ingested PinchBench tag `v2.0.0` at commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`; machine inspection found 147 manifest tasks and recorded the OpenClaw runner, mixed grading, usage fields, and in-process task-grader execution boundary.
- Ingested the Composio 30-task model-comparison thread as a source-located methodology reference for pass rate, duration, Token use, tool calls, cost per task, and cost per success.
- Added proposed ADR-0010 and `docs/design/benchmark-strategy.md`: PinchBench becomes a content-pinned external compatibility lane; original deterministic cases form a separate 15+15 vertical evidence lane.
- Boundary: no benchmark was executed, no score was produced, and neither source establishes a project or resume fact.

## 2026-08-19｜Learning ingest: multi-agent collaboration survey (chengyongru)

- Ingested: X article `multiagent 协作问题的初步整理` by @chengyongru (posted 2026-08-17); full text captured via the fxtwitter API, tier table and dialogue example transcribed verbatim by the user. Admitted as `source-located`.
- Recorded: the four-tier problem taxonomy; the single-agent justification rule (a multi-agent workflow must exploit a condition a single agent lacks); six reported coordination failure results (Communication-Reasoning Gap, dialogue-vs-silent embodied success inversion, expert-dilution tradeoff, trust-without-correctness, 20-agent sorting failure with CAMOC, DPBench deadlock rates); and the claim that real multi-agent runtimes need explicit, verifiable distributed-systems protocols rather than prompt advice.
- Boundary: all eight cited references were only link-checked (HTTP 200), not read first-hand; every paper claim is recorded as the article's claim. The survey does not expand the single-agent product boundary.
- Added open question: which coordination mechanisms must be Runtime-encoded vs prompt-level if multi-agent execution is ever justified (verification path gated on a concrete requirement plus first-hand paper reading).

## 2026-08-19｜Note: acceptance anchor update by direct human authorization

- The acceptance validator still pins the workspace repo HEAD to `7d267bc` (the HF-019 acceptance state), while the repo has since advanced through commits `31401db` and `116da36` and carries a large uncommitted working tree from 2026-08-18/19 sessions.
- The human directly authorized updating the validator's `EXPECTED_HEADS` anchor to the post-ingest commit. This entry records that the update is a direct human authorization, not an independent Regulator acceptance; the uncommitted backlog still awaits a proper independent Regulator pass.
