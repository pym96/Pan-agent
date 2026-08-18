# Workspace Agent Harness

Workspace Agent Harness is a single-user, local-first project for building and evaluating a Local Workspace Agent. A user gives the agent a goal and an isolated local workspace; the agent may read, search, and modify Markdown, CSV, and code through allowlisted tools, while the Harness records a structured Trace and evaluates the resulting workspace with deterministic graders.

## Learning Wiki

The project maintains a source-grounded [Learning Wiki](wiki/index.md) recording what building this system teaches: harness engineering, agent tool design, evaluation methodology, and verification practice. Every substantive page is either a **Verified Learning Fact** (with an explicit verification level — `source-located`, `triangulated`, or `experiment-reproduced` — and stated boundaries) or an **Open Learning Question** (with a verification path). The [log](wiki/log.md) is append-only. The Wiki claims no product, benchmark, or resume authority; it is the project's public learning trail.

## v1 product contract

- **Task surface:** Markdown knowledge maintenance, CSV retrieval/cleaning/aggregation, and code modification/test repair.
- **Agent surface:** an online model adapter, CLI, allowlisted file/command tools, composable Skills and Workflow, explicit budgets, structured Trace, checkpoint/resume, and policy results.
- **Acceptance suite:** 30 version-frozen local tasks, exactly 10 per task family. Every task uses an isolated fixture workspace and a deterministic grader; tasks and graders freeze before the formal run, and failed cases are retained.
- **Baseline:** the same model, tools, prompt budget, and task suite run through a minimal ReAct loop. The full system adds only Skills/Workflow, Trace, recovery, and reliability controls.
- **Metrics:** task success rate is primary; Token use, cost, and latency are secondary; fault-injection recovery rate, unauthorized-operation block rate, and Trace completeness are reliability metrics.

Coze is a **Product Reference** for how task entry, Skills, Workflow, tool execution, observation, debugging, evaluation, and release can be organized. It is not a benchmark and this project does not claim superiority to Coze. The 30-task **Evaluation Suite** is the v1 acceptance mechanism. Only after v1 passes may a v1.1 experiment attempt a clearly named Terminal-Bench subset; BFCL is an on-demand component diagnosis for tool-selection or argument errors. GAIA is outside the current roadmap.

## Explicit exclusions

v1 does not include open-web browsing, GUI/Computer Use, multimodal input/output, autonomous research, cloud multi-tenancy, a complete Coze clone, model training, or a precommitted paper. Research may be reconsidered only after the product exposes a repeated, falsifiable failure mode and additional work cannot delay the job-search deliverable.

## Current verified state

The first local tracer bullet is implemented; v1 is **not** complete.

- `AgentLoop.run(Task, RunLimits) -> RunResult` with replaceable model and tool interfaces.
- Seven explicit terminal statuses: success, model error, parse error, tool error, step limit, timeout, and model-call budget exceeded.
- JSONL Trace output that appends within one run and refuses to overwrite an existing Trace path; this is not a cross-process tamper-proof log.
- A loader that rejects unknown event types, missing sequence entries, and unknown terminal statuses.
- Fourteen deterministic standard-library behavior tests plus one package-identity migration test.

Run the current tests with:

```bash
python3 -m unittest discover -s tests -v
```

Not implemented yet: a real model-provider adapter, CLI, allowlisted workspace tools, Skills/Workflow, OS/process/network isolation, checkpoint/resume, the 30-task Evaluation Suite, baseline experiment, CI, or a public v1 release.

The detailed v1 specification is [GitHub Issue #1](https://github.com/pym96/workspace-agent-harness/issues/1). Domain language lives in [CONTEXT.md](CONTEXT.md), and the product migration decision is [ADR-0008](docs/adr/0008-local-workspace-agent-v1.md).
