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

## Agent Loop Behavioral Eval v0

`agent-loop-behavioral-eval-v0.json` freezes exactly 12 local deterministic cases: three information-acquisition, three dependency-ordering, three observation-recovery, and three stop-or-abstain tasks. It binds visible inputs, protected fixtures/oracles, closed local tool schemas, deterministic transitions, exact terminal rules, common limits, and per-tool-set Semantic Context policy identities. The loader rejects semantic drift before execution and binds the complete manifest to `sha256:026543baf0a1d48d640b695ee21c7aaab5713e75cef437024a48fb0e66f180f8`.

This lock is a local AgentLoop learning/evaluation instrument. It is not a Provider result, external benchmark, or public score.

## DeepSeek live Behavioral Eval v0 Stage A-R

`deepseek-live-behavioral-eval-v0.json` binds the accepted 12 cases to five repetitions and the paired `observation-feedback-v0`/`act-once-v0` Loop Policy arms, yielding exactly 120 slots in a deterministic case-major order. It also freezes the DeepSeek model/endpoint/thinking/tool profile, native Translation and Context identities, historical #4 fixture and #9 manifest hashes, per-slot and campaign call/Token/CNY ceilings, pricing observation, stop rules, and reconstructable denominator states. Stage A-R preserves the original `sha256:ea23dceaa9b8131a54399e7eda5f8cdd8bf968816e0d4efd2668884753dd52fa` as parent lineage and requires repaired v2 identity `sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25`, which additionally binds the sole budgeted serial runner and live entry. Recomputing an edited document's internal hash does not authorize drift.

This independently accepted Stage A-R lock and its default preview make zero live model or balance calls and contain no causal result. The separately authorized v2 Stage B campaign later reached exactly one frozen Provider exchange and terminated under `model_usage_missing`; its accepted Evidence is [`../../docs/evidence/deepseek-live-stage-b-terminal-2026-08-29.md`](../../docs/evidence/deepseek-live-stage-b-terminal-2026-08-29.md). The v2 campaign cannot be resumed or repaired; any v3 requires a new lock and fresh Human budget authorization.

## DeepSeek live Behavioral Eval v3 Stage A

`deepseek-live-behavioral-eval-v3.json` is WorkOrder #19's new zero-call identity. It binds the accepted terminal v2 lock/Verdict/Evidence and the #18 Provider learning artifact, retains the stable endpoint, model, Thinking/high mode, tools, Context/output settings, cases, exact paired schedule, Loop Policies, evaluator, `120` Runs, `600`-exchange ceiling, `CNY 15` ceiling, and stop taxonomy, while changing the Profile/Translation contract to Provider-controlled/default tool choice with the wire-level `tool_choice` key omitted. It also admits either one valid typed tool call or non-empty `finish_reason="stop"` final content and binds full assistant reasoning-history replay.

The v3 lock identity is `sha256:cbc23aaf211a02a492c147f40dcad7b017888ba96d68b030cadbcf87d337a5f4`. Its default preview reports `formal_runs_started=0`, `live_model_calls=0`, `balance_queries=0`, `cost=CNY 0`, and no causal result. Its offline boundary was independently accepted on 2026-08-29 and grants no live execution or budget authority.

## ReAct learning smoke

`react-mvp-5-v1.json` freezes a separate Phase 0 mechanism experiment in the `workspace-coding` lane. It pins the current official `SWE-bench/SWE-bench_Lite` development source/revision, five deterministic case IDs and their x86_64 evaluation images, Act-only/ReAct variants, three repetitions, DeepSeek V4 Flash with thinking disabled, bash-only Docker isolation, dual-channel observations, and official `resolved` as the primary outcome.

The canonical `content_hash` covers the whole document except the hash field itself. `load_react_mvp_config(...)` rejects hash drift, a non-five-case denominator, missing image bindings, variant drift, or repetition drift. The planned 30 Agent attempts completed and passed a sixth independent ordinary candidate-Evidence review. Five development cases support mechanism and Bad Case analysis only; they cannot be reported as a SWE-bench Lite score.

## Protocol reliability replay

`protocol-reliability-v1.json` and `protocol-reliability-v1-contexts.json` freeze the post-ReAct protocol gate. The corpus is regenerated from all 30 retained source Traces and contains all 16 unique terminal protocol-failure pre-call contexts plus eight deterministic Act/ReAct × depth-band controls. Its hash is bound into the experiment lock.

The experiment derives J0/J1/S0/S1 from 24 contexts × JSON-object/Strict Function Calling × five repetitions. No-repair and repair policies share each original call; repair adds at most one L1-L3 correction call and includes both calls in Token cost. The lock also fixes L0-L3 metrics, Wilson reporting, append-only artifacts, deterministic serial order, and per-transport fingerprint drift stopping. This is a provider-protocol time-window measurement, not task execution, a persistent benchmark, or a project/resume fact.

The 240 original slots have completed as Working Agent candidate Evidence. Results and limits live in [`../../docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md`](../../docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md) and remain pending independent review.

## Protocol maximum-token sensitivity

`protocol-reliability-v1.1-max-token-sensitivity.json` freezes the five parent ReAct Contexts that exactly cover all 21 Strict `length@2048` failures, then varies only the requested maximum completion Tokens across 2,048, 4,096, and 8,192 for five repetitions without repair.

`protocol-reliability-v1.2-max-token-16k-extension.json` freezes the Human-requested post-v1.1 16,384-token arm as a separate 25-call identity. It binds the completed v1.1 summary and raw-manifest hashes so the baseline cannot be replaced after the extension is observed. Both locks describe provider-protocol sensitivity rather than task execution or a persistent benchmark. The candidate result is [`../../docs/evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md`](../../docs/evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md).
