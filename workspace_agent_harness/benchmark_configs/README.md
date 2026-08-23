# Benchmark configuration locks

These files configure benchmark catalogs; they are not result files and do not establish a benchmark score.

## External compatibility lane

- `pinchbench-core-v2.0.0.json`: 21-task core profile.
- `pinchbench-full-v2.0.0.json`: 147-task full profile.

Both locks pin `pinchbench/skill` tag `v2.0.0`, commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`, the `tasks/` Git tree, and the manifest SHA-256. `load_pinchbench_suite(...)` also requires a clean task worktree, verifies the manifest/task-file set and task frontmatter (including a present positive-integer timeout), and treats task Markdown plus embedded grader source strictly as data.

Every PinchBench case is currently `ineligible` with reason `pinchbench.translation_not_frozen`. Therefore the configured lane is P0 catalog-audit evidence only. It is labelled `pinchbench-compatible`, never official PinchBench compatibility, and cannot create a score until explicit local translations and protected evaluators exist.

```python
from pathlib import Path

from workspace_agent_harness.benchmarks import load_pinchbench_suite

suite = load_pinchbench_suite(
    checkout=Path("/absolute/path/to/pinchbench-skill-v2.0.0"),
    profile="core",
)
```

## Vertical evidence lane

`vertical-evidence-v1.json` fixes one ordered 30-case catalog: 15 `data-analysis` cases and 15 `workspace-coding` cases. It records the Composio thread only as the methodology source for campaign shape and metrics; all case IDs and scopes are original local definitions.

`load_vertical_evidence_suite(...)` maps the two implemented proof seeds to real `RunRequest` values and compiles each seed once to verify that the configured fixture/evaluator IDs match the Pack's real protected `ControlProjection`. Exact fixture and evaluator identities are retained in suite source provenance. The remaining 28 cases stay visible and pre-run `ineligible` with reason `vertical.case_not_implemented`. Their fixtures and deterministic evaluators still need implementation before they can run.

The configuration declares one development repetition and a minimum of three repetitions for any later publishable comparison. Public numbers remain a separate high-risk Gate.

## ReAct learning smoke

`react-mvp-5-v1.json` freezes a separate Phase 0 mechanism experiment in the `workspace-coding` lane. It pins the current official `SWE-bench/SWE-bench_Lite` development source/revision, five deterministic case IDs and their x86_64 evaluation images, Act-only/ReAct variants, three repetitions, DeepSeek V4 Flash with thinking disabled, bash-only Docker isolation, dual-channel observations, and official `resolved` as the primary outcome.

The canonical `content_hash` covers the whole document except the hash field itself. `load_react_mvp_config(...)` rejects hash drift, a non-five-case denominator, missing image bindings, variant drift, or repetition drift. The planned 30 Agent attempts have not run because the authorized DeepSeek account returned insufficient balance. Five development cases can support a mechanism smoke and Bad Case analysis only; they cannot be reported as a SWE-bench Lite score.
