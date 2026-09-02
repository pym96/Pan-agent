# Workspace Agent Harness

Workspace Agent Harness targets a Human-usable TypeScript/Pi General Agent Working Stack. The accepted base named by WorkOrder #22 contains the #23 TypeScript/Pi tracer bullet, the Python #21 Live TUI, and the historical Local Workspace Agent contract. The active #22 candidate uses Python only as a behavioral proving ground for an opt-in trusted-local shell and Human-owned PTY handoff; it does not migrate those capabilities to TypeScript or decide a later cutover.

> **Mixed verification state; not a new verified fact (2026-08-25):** Human accepted ADR-0009/0010/0011/0012/0013/0014. Separate same-model Regulator reviews accepted the ordinary Runtime/Campaign/seed/configuration boundary through HF-20260820-022, a sixth review reproduced the ReAct MVP ordinary candidate-Evidence boundary, WorkOrder #4's offline Translation Adapter boundary passed its independent Gate, and WorkOrder #3's design freeze was independently accepted. All 30 ReAct slots executed, with 29 task outcomes and one infrastructure/artifact failure; this is not a SWE-bench Lite score. The 240-slot `protocol-reliability-v1` replay and its 75-call maximum-token sensitivity plus separately identified 25-call 16K extension have completed as Working Agent candidate Evidence; they still require a new independent review. WorkOrder #6's evented Python TUI tracer is only a Working Agent candidate pending its own independent review. Start at `AGENTS.md`; the bounded assignment lives in `docs/agents/current-assignment.md`.

## Learning Wiki

The project maintains a source-grounded [Learning Wiki](wiki/index.md) recording what building this system teaches: harness engineering, agent tool design, evaluation methodology, and verification practice. Every substantive page is either a **Verified Learning Fact** (with an explicit verification level — `source-located`, `triangulated`, or `experiment-reproduced` — and stated boundaries) or an **Open Learning Question** (with a verification path). The [log](wiki/log.md) is append-only. The Wiki claims no product, benchmark, or resume authority; it is the project's public learning trail.

## TypeScript/Pi General Agent Working Stack

WorkOrder #23 adds a [TypeScript package and Human command](typescript/README.md) backed by the [candidate design](docs/design/typescript-pi-general-agent-working-stack.md). One deep `GeneralAgentSession` Module owns Pi's stateful Context and Agent loop, translates through a real DeepSeek Adapter, exposes typed read/write/edit/bash tools, returns control for successive tasks, renders usage and attributable terminals, and supports cancellation. Its test Adapter is Pi's deterministic Faux Provider; Builder verification makes no paid Provider call.

The shell is explicitly **trusted-local**: it runs as the host user, and the selected workspace is only the default cwd. It claims neither path containment nor an OS/network sandbox. WorkOrder #22 prototypes corresponding Python shell/PTY semantics without adding isolation or changing this TypeScript implementation; authoritative cutover and cleanup remain separate work.

## Current implementation gate

The architecture is Human-accepted. The code and tests below remain a candidate, but their ordinary operator-trusted implementation boundary has passed a separate same-model Regulator review; high-risk security, public benchmark, fact, and resume gates remain closed:

- [`docs/design/general-vertical-system.md`](docs/design/general-vertical-system.md): Runtime and Domain Pack Interface alternatives, selection, invariants, ordering, errors, configuration, and migration;
- [`docs/design/deerflow-mechanism-map.md`](docs/design/deerflow-mechanism-map.md): pinned DeerFlow mechanism sources, local decisions, and intentional omissions;
- [`docs/design/proof-domains.md`](docs/design/proof-domains.md): bounded `data-analysis` and `workspace-coding` tasks and deterministic evaluators;
- [`docs/design/benchmark-strategy.md`](docs/design/benchmark-strategy.md): a pinned PinchBench compatibility lane plus a 15+15 local vertical evidence campaign;
- [`docs/adr/0009-general-runtime-and-vertical-domain-packs.md`](docs/adr/0009-general-runtime-and-vertical-domain-packs.md): accepted Runtime/Pack seam decision;
- [`docs/adr/0010-external-and-vertical-evaluation-lanes.md`](docs/adr/0010-external-and-vertical-evaluation-lanes.md): accepted benchmark/campaign placement;
- [`docs/design/react-to-swe-mvp.md`](docs/design/react-to-swe-mvp.md): Phase 0 Act-only/ReAct mechanism comparison, dual-channel observations, Docker/gold gates, and the later SWE-style ACI transition;
- [`docs/adr/0011-react-mvp-before-swe-aci.md`](docs/adr/0011-react-mvp-before-swe-aci.md): accepted decision to isolate ReAct loop grammar before adding coding-interface treatments;
- [`docs/design/protocol-reliability-v1.md`](docs/design/protocol-reliability-v1.md): frozen 24-context JSON/Strict protocol replay, repair, measurement, identity, and stop contract;
- [`docs/design/protocol-reliability-v1.1-max-token-sensitivity.md`](docs/design/protocol-reliability-v1.1-max-token-sensitivity.md) and [`docs/design/protocol-reliability-v1.2-max-token-16k-extension.md`](docs/design/protocol-reliability-v1.2-max-token-16k-extension.md): the complete 2K/4K/8K sensitivity design and transparently post-v1.1 16K extension;
- [`docs/adr/0012-freeze-protocol-reliability-v1.md`](docs/adr/0012-freeze-protocol-reliability-v1.md): accepted decision to calibrate the Translation Layer before coding ACI treatments;
- [`docs/design/translation-adapter.md`](docs/design/translation-adapter.md) and accepted [`ADR-0013`](docs/adr/0013-typed-native-history-translation-adapter.md): WorkOrder #4's independently accepted offline candidate seam for typed canonical history, provider-native call/result replay, separate reasoning, fail-closed correlation, and ModelProfile-owned output limits;
- [`docs/design/agent-loop-behavioral-eval-v0.md`](docs/design/agent-loop-behavioral-eval-v0.md) and accepted [`ADR-0014`](docs/adr/0014-evented-agent-loop-and-behavioral-eval.md): WorkOrder #3's independently accepted evented AgentLoop, deep ModelGateway, consumer-only TUI, Context, and Behavioral Eval design freeze;
- [`docs/design/evented-tui-tracer.md`](docs/design/evented-tui-tracer.md): WorkOrder #6's credential-free, manually testable Python TUI tracer candidate and replay/cancellation entry points; pending independent Regulator review and explicitly excluding #7–#10;
- [`docs/design/provider-context-overflow-recovery.md`](docs/design/provider-context-overflow-recovery.md): WorkOrder #8's one classified Provider Context-overflow recovery candidate, #7 semantic-compaction reuse, one retry ceiling, separate attempt accounting, explicit exhaustion, and deterministic TUI/replay paths; pending independent Regulator review;
- [`docs/design/behavioral-eval-runtime-v0.md`](docs/design/behavioral-eval-runtime-v0.md): WorkOrder #9's exact 12-case deterministic Behavioral Eval campaign, protected oracles, attributable report, and zero-call replay candidate; pending independent Regulator review;
- [`docs/design/tui-three-view-projections.md`](docs/design/tui-three-view-projections.md): WorkOrder #10's compact/expanded/trace event projections, visibility filtering, candidate/admission distinction, bounded long-output rendering, and repeatable Python TUI view selection candidate; pending independent Regulator review;
- [`docs/design/deepseek-live-behavioral-eval-stage-a.md`](docs/design/deepseek-live-behavioral-eval-stage-a.md): WorkOrder #11 Stage A's DeepSeek native-tool Translation/Gateway, balance and call/token/cost controls, content-hashed paired 120-slot lock, and zero-call inventory candidate; pending independent Regulator review and containing no live result;
- [`docs/design/deepseek-live-budgeted-serial-runner.md`](docs/design/deepseek-live-budgeted-serial-runner.md) and [`Stage B terminal Evidence`](docs/evidence/deepseek-live-stage-b-terminal-2026-08-29.md): WorkOrder #11's independently accepted runner later retained one frozen HTTP 400 Provider exchange, mandatory balance settlement, `model_usage_missing` stop, and the complete `1 failed / 119 skipped / 0 missing` denominator; v2 is terminal, with no task result or arm comparison, and any v3 requires a new lock and fresh Human budget authorization;
- [`docs/design/deepseek-live-v3-adapter-stage-a.md`](docs/design/deepseek-live-v3-adapter-stage-a.md) and [`candidate Evidence`](docs/evidence/deepseek-live-v3-stage-a-candidate-2026-08-29.md): WorkOrder #19's independently accepted zero-call v3 repair retains Thinking/tools/stable endpoint, omits request-level `tool_choice`, accepts one typed tool call or non-empty ordinary final content, versions the lock/runner/entry identity chain, and preserves the 120-slot controls; accepted on 2026-08-29 and authorizing no live call;
- [`docs/design/deepseek-live-tui.md`](docs/design/deepseek-live-tui.md), [`historical #21 smoke observation`](docs/evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md), and [`#22 smoke candidate Evidence`](docs/evidence/deepseek-live-trusted-local-smoke-candidate-2026-09-02.md): the accepted Python entry plus WorkOrder #22's candidate trusted-local extension. Default no-shell behavior remains; `--trusted-local` adds a typed non-interactive shell and a separate exact-command/cwd Human PTY confirmation, process-group cancellation, lossless artifacts, lifecycle events, and replay. The trusted-local profile also treats absent/empty Provider reasoning as optional metadata (the default-off profile remains reasoning-required) while retaining executable action validation. The authorized real `deepseek-v4-flash` snake smoke completed on exact candidate bytes with a Human-operated PTY handoff; it makes no sandbox, benchmark, model-quality, or TypeScript migration claim and remains pending independent high-risk review;
- [`tests/test_general_runtime_contract.py`](tests/test_general_runtime_contract.py): Runtime/Pack seam, authority, admission, and evaluator-limit contracts;
- [`tests/test_benchmark_campaign_contract.py`](tests/test_benchmark_campaign_contract.py): suite selection, eligibility, aggregation, and append-only attempt contracts.
- [`workspace_agent_harness/proof_packs.py`](workspace_agent_harness/proof_packs.py): concrete seed Pack implementation candidate; the Runtime Module does not import it;
- [`tests/test_proof_packs.py`](tests/test_proof_packs.py): same-Runtime/same-model concrete Generality Proof integration contract.

The complete local suite is expected green for this implementation candidate. Passing tests are Evidence, not automatic acceptance. The reviewed foundation includes one concrete seed for each proof Pack, a two-case `vertical-development-smoke`, PinchBench core/full P0 catalog locks, and a 30-case vertical configuration in which only the two seeds are eligible. The newer Phase 0 candidate adds a real-provider Adapter and completed frozen five-case SWE-bench development smoke. Each treatment produced one resolved planned slot, but response-contract failures dominated and one Act-only slot had an infrastructure/artifact failure. It does not include PinchBench task translation, the other 28 fixtures/evaluators, a SWE-bench Lite score, or any accepted project/resume fact.

The ReAct MVP executable lock lives at [`workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json`](workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json). [`scripts/swebench_gold_gate.sh`](scripts/swebench_gold_gate.sh) reproduces one selected case's pinned official gold gate, [`scripts/run_react_mvp_case.py`](scripts/run_react_mvp_case.py) runs one pre-gated attempt, and [`scripts/summarize_react_mvp.py`](scripts/summarize_react_mvp.py) deterministically enumerates and hashes all expected slots. The candidate result and limitations are in [`docs/evidence/react-mvp-30-slot-candidate-2026-08-23.md`](docs/evidence/react-mvp-30-slot-candidate-2026-08-23.md).

The protocol locks are [`protocol-reliability-v1.json`](workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json), its [24-context corpus](workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json), the [2K/4K/8K sensitivity](workspace_agent_harness/benchmark_configs/protocol-reliability-v1.1-max-token-sensitivity.json), and the separately versioned [16K extension](workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json). [`scripts/freeze_protocol_reliability_contexts.py`](scripts/freeze_protocol_reliability_contexts.py) verifies Trace reconstruction; the protocol and sensitivity runners retain deterministic append-only raw calls; their summarizers report layered reliability, repair/cap cost, confidence intervals, marker diagnostics, and provider identity. Generated state stays under ignored `.scratch/`, `.runs/`, and `logs/` paths.

The completed Working Agent result and its explicit limits are indexed at [`docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md`](docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md). It is a dated provider-protocol measurement, not task quality, a persistent benchmark, VPF, or resume fact.

The follow-up [`maximum-token sensitivity candidate Evidence`](docs/evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md) qualifies that result: higher ceilings extended many malformed Strict/ReAct outputs to 16K without a monotonic L3 gain. It supports bounded validation/repair rather than using 16K as the default protocol fix and remains pending independent review.

The WorkOrder #4 implementation candidate adds [`translation.py`](workspace_agent_harness/translation.py), the provider-specific [`deepseek_translation.py`](workspace_agent_harness/deepseek_translation.py), and an [offline four-cell dry-run](scripts/dry_run_translation_matrix.py). Its offline candidate passed an independent Regulator Gate on 2026-08-25, while its secret-free fixture contracts prove local mapping and rejection behavior only; no live call, causal result, Verified Project Fact, Wiki entry, or resume claim was produced.

## Real TUI entrypoints

The Python entry defaults to #21's bounded no-shell tool profile. Choose an existing workspace and a new artifact path outside it; add `--trusted-local` only when you deliberately grant host-user shell and Human PTY authority:

```bash
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
PYTHONPATH=. python3 -m workspace_agent_harness.tui \
  --live-deepseek \
  --trusted-local \
  --workspace /absolute/path/to/workspace \
  --session-root /absolute/new/path/to/live-session
```

The command displays and asks you to confirm the Provider, model, resolved workspace, and selected authority before accepting `Task>`. Each task gets a new Run and model Context while the workspace persists. Use `:help`, `:view compact|expanded|trace`, `:runs`, `:replay RUN_ID`, or `:exit`. Starting, cancelling before confirmation, using help/views, or replaying makes no Provider call. Run artifacts contain the append-only Event Log, secret-free Provider exchanges, Context artifacts, trusted-local stream/PTY identities when enabled, public metadata, reported usage, and changed workspace paths.

The TypeScript/Pi real entry stays separate and directly runnable:

```bash
npm --prefix typescript run agent -- \
  --workspace /absolute/path/to/workspace \
  --model deepseek-v4-flash \
  --thinking high
```

PinchBench is pinned as an external compatibility source, not vendored as the Runtime contract. [`workspace_agent_harness/benchmark_configs/`](workspace_agent_harness/benchmark_configs/) holds content locks; `workspace_agent_harness.benchmarks.load_pinchbench_suite(...)` audits a caller-supplied clean checkout without executing embedded graders. All 21/147 upstream cases are currently ineligible because no local translation is frozen. Any later translated local run must be labelled `pinchbench-compatible`; official compatibility requires the unmodified upstream runner. The Composio thread contributes campaign shape and efficiency metrics only, not reusable tasks or results.

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
