# ADR-0010: Keep benchmark campaigns outside the General Agent Runtime

- Status: Accepted
- Date: 2026-08-18
- Decision owner: human selected PinchBench for general evaluation and the Composio 30-task comparison as a vertical-evaluation reference; repository conformance pending independent review
- Depends on: ADR-0009

## Context

The target system needs both a breadth-oriented external benchmark and evidence that its Vertical Domain Packs solve domain tasks reliably and efficiently. PinchBench supplies a public task catalog and runner, but its pinned runner is OpenClaw-specific, mixes automated and LLM judging, and executes task-embedded Python graders. The referenced Composio thread supplies useful comparison metrics and a 30-task scale, but no reusable task set or grader.

Putting either source inside the General Agent Runtime would make benchmark versions, task catalogs, repetition policy, scoring, and leaderboard concerns part of the execution core. Letting benchmark code call model/tools directly would bypass the Runtime seam and invalidate authority, Trace, and failure-attribution evidence.

## Decision

Add one external Evaluation Campaign Module after ADR-0009 acceptance. It receives an already-created General Agent Runtime plus one or more frozen Benchmark Suite Adapters. A suite exposes immutable provenance and a list of `BenchmarkCase` values; each eligible case contains exactly one `RunRequest`. The campaign invokes cases only through `GeneralAgentRuntime.run` and aggregates returned `RunReport` values.

Use two lanes:

1. a PinchBench compatibility lane pinned initially to tag `v2.0.0`, commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`, with explicit per-task translation and eligibility;
2. a local vertical evidence lane of 30 deterministic cases, 15 per proof pack, using the referenced Composio comparison only for campaign shape and metrics.

The first PinchBench lane is labelled `pinchbench-compatible`. It is not an official PinchBench score. Upstream automated grader code is not executed in the host Runtime process. Official compatibility is deferred until an unmodified pinned upstream runner can call the Harness through an accepted Adapter.

The primary vertical pass metric is deterministic Domain Evaluator success. LLM judging may be reported separately later, but cannot replace the primary pass decision. Both lanes retain Bad Cases and report pass rate, duration, model requests, Token use, tool calls, cost per task, cost per success, failure attribution, raw attempts, and measurement coverage.

## Seam placement

The Runtime seam remains unchanged: `GeneralAgentRuntime.run(RunRequest) -> RunReport`. Benchmark selection and aggregation sit above that seam. The campaign cannot access model, tool, workspace, evaluator, or Trace collaborators directly.

The Benchmark Suite seam is real because the PinchBench profile and local vertical suite are materially different Adapters with the same small Interface: immutable manifest plus `cases()`. PinchBench translation logic stays in its Adapter; local task construction stays in the vertical suite Adapter.

## Alternatives

### Make PinchBench the Runtime task format

Rejected because it couples the product to OpenClaw task/frontmatter/grader semantics and would let an external benchmark define internal policy and lifecycle.

### Add a benchmark hook to every Vertical Domain Pack

Rejected because repetitions, source pinning, aggregation, and cross-pack comparison would spread across packs. Packs already own task compilation and deterministic evaluation; campaign concerns belong above Runtime.

### Execute upstream PinchBench grader code in-process

Rejected because the pinned implementation extracts Python from task Markdown and calls `exec`. A future isolated grader may be considered after its authority and resource limits are independently accepted.

### Treat the Composio thread as a reproducible benchmark

Rejected because the thread does not publish the complete task set, fixtures, graders, raw results, or repetition protocol. Only its disclosed campaign shape and metrics are adopted.

### Add a broad `general-assistant` pack now

Deferred. The first two packs must establish a rigorous real seam before a third domain or the full PinchBench tool surface is added.

## Consequences

- Benchmark changes do not edit Runtime source or alter Runtime success semantics.
- Every score is tied to exact source, transform, pack, Runtime, model, tool, evaluator, and pricing provenance.
- Local PinchBench adaptation sacrifices immediate leaderboard comparability for authority isolation and attributable evaluation.
- The campaign needs structured Runtime usage data; missing Token/cost data remains unknown and limits efficiency Claims.
- Building 30 deterministic vertical cases costs more than copying prompts, but produces inspectable job-search evidence and stable regression coverage.
- Public benchmark numbers remain high-risk Claims under verification governance.

## Acceptance evidence required

An independent Regulator must reject this decision unless:

1. the campaign invokes work only through the public Runtime Interface;
2. PinchBench source/version/task/transform provenance is content-pinned and source drift fails closed;
3. adapted results cannot be mistaken for official PinchBench results;
4. upstream grader code cannot execute in the host Runtime process;
5. ineligible tasks are visible and excluded by a pre-run rule, not post-hoc outcome filtering;
6. failed/error attempts and their costs remain in denominators and raw artifacts;
7. the 30 vertical cases preserve per-pack results and use deterministic primary evaluators;
8. expected-red tests cross the same campaign seam intended for callers;
9. no benchmark result, project fact, or resume fact is promoted by this design handoff.

## Detailed design

- [`../design/benchmark-strategy.md`](../design/benchmark-strategy.md)
- [`../design/general-vertical-system.md`](../design/general-vertical-system.md)
- [`../design/proof-domains.md`](../design/proof-domains.md)

