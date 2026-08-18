# PinchBench v2.0.0 task and runner mechanics

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://github.com/pinchbench/skill/tree/v2.0.0>; local read-only inspection of tag `v2.0.0`, commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`
- Updated: 2026-08-18

## Verified facts

- The pinned `tasks/manifest.yaml` contains 147 unique tasks in 11 categories and a 21-task `core` list. Machine parsing found 25 automated, 101 hybrid, and 21 LLM-judge tasks; three tasks declare multiple sessions.
- The pinned `tasks/` Git tree is `1368925645e3bffa49fb2d238958e2530236a3e0`. The manifest SHA-256 is `38d7cd1bddfa5e9fefc7b6945c91955f36dc5c88c32c994bf8676344b1069a7b`.
- Task frontmatter and Markdown sections describe prompts, expected behavior, fixtures, grading type, deterministic checks, and optional LLM-judge rubrics.
- The runner creates and invokes OpenClaw agents rather than accepting an arbitrary agent Runtime Interface.
- Automated grading extracts Python from each task document and executes it in the benchmark process. Hybrid grading combines that result with an LLM judge.
- Results retain per-task execution status, elapsed time, transcript length, usage, workspace, grading, category scores, and aggregate efficiency fields. The runner extracts model requests, Tokens, and cost from OpenClaw transcripts.
- Task-count prose is internally inconsistent at the pinned tag: the README says 53 tasks and `SKILL.md` lists 23, while the manifest contains 147. Reproducible use must pin and inspect machine-readable content rather than trust the prose count.

## Boundaries

- The source describes and implements a benchmark for OpenClaw. It does not establish compatibility with Workspace Agent Harness.
- Source inspection did not execute the full benchmark, contact a model provider, or reproduce any leaderboard score.
- A locally translated task would change the harness and possibly the grading path; its result must not be called an official PinchBench result.
- In-process execution of task-provided grader code is not accepted as a safe local evaluator design.
- Task count and grading-type counts apply only to the pinned commit and were computed from its local files.

## Links

- [Evaluation strategy](../../docs/design/benchmark-strategy.md)
- [ADR-0010](../../docs/adr/0010-external-and-vertical-evaluation-lanes.md)
- [Verification governance](../../docs/governance/verification.md)
- [Wiki index](../index.md)

