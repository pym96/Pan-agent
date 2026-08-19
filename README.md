# Workspace Agent Harness

Workspace Agent Harness targets a General Agent Runtime plus materially different Vertical Domain Packs. The earlier single-user Local Workspace Agent remains a historical design baseline, not the active implementation plan.

> **Independently accepted ordinary implementation candidate, not a verified fact (2026-08-19):** Human accepted ADR-0009 and ADR-0010, and a separate same-model Regulator accepted the Runtime/Campaign kernel plus two bounded seed paths within the operator-trusted, non-malicious-process boundary. Security/permission publicity, public benchmarks, task-set expansion, project-fact registration, and resume disclosure remain closed. Start at `AGENTS.md`; the bounded assignment lives in `docs/agents/current-assignment.md`.

## Learning Wiki

The project maintains a source-grounded [Learning Wiki](wiki/index.md) recording what building this system teaches: harness engineering, agent tool design, evaluation methodology, and verification practice. Every substantive page is either a **Verified Learning Fact** (with an explicit verification level — `source-located`, `triangulated`, or `experiment-reproduced` — and stated boundaries) or an **Open Learning Question** (with a verification path). The [log](wiki/log.md) is append-only. The Wiki claims no product, benchmark, or resume authority; it is the project's public learning trail.

## Current implementation gate

The architecture is Human-accepted. The code and tests below remain a candidate, but their ordinary operator-trusted implementation boundary has passed a separate same-model Regulator review; high-risk security, public benchmark, fact, and resume gates remain closed:

- [`docs/design/general-vertical-system.md`](docs/design/general-vertical-system.md): Runtime and Domain Pack Interface alternatives, selection, invariants, ordering, errors, configuration, and migration;
- [`docs/design/deerflow-mechanism-map.md`](docs/design/deerflow-mechanism-map.md): pinned DeerFlow mechanism sources, local decisions, and intentional omissions;
- [`docs/design/proof-domains.md`](docs/design/proof-domains.md): bounded `data-analysis` and `workspace-coding` tasks and deterministic evaluators;
- [`docs/design/benchmark-strategy.md`](docs/design/benchmark-strategy.md): a pinned PinchBench compatibility lane plus a 15+15 local vertical evidence campaign;
- [`docs/adr/0009-general-runtime-and-vertical-domain-packs.md`](docs/adr/0009-general-runtime-and-vertical-domain-packs.md): accepted Runtime/Pack seam decision;
- [`docs/adr/0010-external-and-vertical-evaluation-lanes.md`](docs/adr/0010-external-and-vertical-evaluation-lanes.md): accepted benchmark/campaign placement;
- [`tests/test_general_runtime_contract.py`](tests/test_general_runtime_contract.py): Runtime/Pack seam, authority, admission, and evaluator-limit contracts;
- [`tests/test_benchmark_campaign_contract.py`](tests/test_benchmark_campaign_contract.py): suite selection, eligibility, aggregation, and append-only attempt contracts.
- [`workspace_agent_harness/proof_packs.py`](workspace_agent_harness/proof_packs.py): concrete seed Pack implementation candidate; the Runtime Module does not import it;
- [`tests/test_proof_packs.py`](tests/test_proof_packs.py): same-Runtime/same-model concrete Generality Proof integration contract.

The complete local suite is expected green for this implementation candidate. Passing tests are Evidence, not automatic acceptance. The candidate includes one concrete seed for each proof Pack plus a two-case `vertical-development-smoke`; it does not include PinchBench translation, the 15+15 local task set, a real provider, or any benchmark score.

PinchBench is pinned as an external compatibility source, not vendored as the Runtime contract. Any translated local run must be labelled `pinchbench-compatible`; official compatibility requires the unmodified upstream runner. The Composio thread contributes campaign shape and efficiency metrics only, not reusable tasks or results.

## Previous Local Workspace v1 contract｜historical design baseline

- **Task surface:** Markdown knowledge maintenance, CSV retrieval/cleaning/aggregation, and code modification/test repair.
- **Agent surface:** an online model adapter, CLI, allowlisted file/command tools, composable Skills and Workflow, explicit budgets, structured Trace, checkpoint/resume, and policy results.
- **Acceptance suite:** 30 version-frozen local tasks, exactly 10 per task family. Every task uses an isolated fixture workspace and a deterministic grader; tasks and graders freeze before the formal run, and failed cases are retained.
- **Baseline:** the same model, tools, prompt budget, and task suite run through a minimal ReAct loop. The full system adds only Skills/Workflow, Trace, recovery, and reliability controls.
- **Metrics:** task success rate is primary; Token use, cost, and latency are secondary; fault-injection recovery rate, unauthorized-operation block rate, and Trace completeness are reliability metrics.

Coze is a **Product Reference** for how task entry, Skills, Workflow, tool execution, observation, debugging, evaluation, and release can be organized. It is not a benchmark and this project does not claim superiority to Coze. The 30-task **Evaluation Suite** is the v1 acceptance mechanism. Only after v1 passes may a v1.1 experiment attempt a clearly named Terminal-Bench subset; BFCL is an on-demand component diagnosis for tool-selection or argument errors. GAIA is outside the current roadmap.

## Explicit exclusions

v1 does not include open-web browsing, GUI/Computer Use, multimodal input/output, autonomous research, cloud multi-tenancy, a complete Coze clone, model training, or a precommitted paper. Research may be reconsidered only after the product exposes a repeated, falsifiable failure mode and additional work cannot delay the job-search deliverable.

## Verified implementation facts

[`docs/evidence/verified-project-facts.md`](docs/evidence/verified-project-facts.md) is the only project-level fact register. It records each accepted atomic Claim, Evidence, Criterion, independent acceptance, date, and limitation. README prose, specs, Wiki pages, and passing structure checks are not implementation Evidence by themselves.

Run the complete candidate suite with:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The historical Local Workspace v1 specification remains [GitHub Issue #1](https://github.com/pym96/workspace-agent-harness/issues/1) and [`docs/spec/v1.md`](docs/spec/v1.md). Domain language lives in [CONTEXT.md](CONTEXT.md); ADR-0008 is the accepted historical product decision, while Human-accepted ADR-0009 and ADR-0010 define the current target. Their bounded ordinary implementation has passed a same-model Regulator Gate; this does not release high-risk security, benchmark, project-fact, or resume claims.
