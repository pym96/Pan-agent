# Current Assignment | Concrete Proof Packs on the Accepted Runtime/Campaign Kernel

This document owns the current Working Agent assignment. It defines a target and acceptance contract; it does not establish implementation facts. Read the fact register linked from the root Agent map before making any current-state statement.

## Mission

Human accepted ADR-0009 and ADR-0010 on 2026-08-19. Turn the green generic Runtime/Campaign kernel into a material Generality Proof without editing Runtime source for either domain.

Phase-transition note: the original **design before implementation** gate for the **General Agent Runtime + Vertical Domain Packs** required **failing contract tests**. Human acceptance closed that historical red-test gate; the current implementation and regression suite must remain green.

Generality requires at least two materially different packs through the same Runtime interface and lifecycle:

1. `data-analysis`: structured-data inspection, transformation, calculation, policy boundaries, and a domain evaluator;
2. `workspace-coding`: repository/file maintenance, code changes, tests, policy boundaries, and a domain evaluator.

Do not add a third domain before these two are rigorous.

## Current phase and next bounded gate

The Working Agent implementation candidate currently covers Runtime-recomputed Pack/Suite/source/case/transform digests, fail-closed task admission, capability/resource authority intersection, bounded AgentLoop reuse, schema-2 Runtime provenance, process-terminated evaluator timeouts, separate evaluator status, campaign eligibility/denominators, usage/cost coverage, failure attribution, and append-only attempt artifacts. These are Candidate Claims, not Verified Project Facts.

The implementation candidate now also completes the concrete seed gate:

1. a private local workspace staging/freeze seam adds no caller lifecycle methods;
2. `data-analysis` stages the accepted CSV, uses typed aggregate/write capabilities, and recomputes an exact Decimal/CSV verdict;
3. `workspace-coding` stages the accepted repository, limits mutation to `src/slugify.py`, audits AST, and runs fixed hidden cases in an isolated-interpreter subprocess without arbitrary shell;
4. both selectors run through one Runtime instance and one scripted Model Adapter;
5. a two-case suite labelled `vertical-development-smoke` runs only through `EvaluationCampaign -> runtime.run` and retains raw artifacts.

The ordinary independent implementation gate has passed. The next bounded gate is explicit Human or different-model review of security/authority limitations plus authorized correction of the stale top-level HEAD pin. Do not expand to the remaining 14+14 cases or a PinchBench Adapter until those gates explicitly authorize it.

## External success contract: maximize Shanghai job-search odds

The project exists to maximize the user's probability of earning a high-quality **Shanghai-only LLM / Agent internship and later offer**. Mature companies are the P0 priority; companies with reliably sourced Series C or D financing are a P1 candidate pool. P0 mature-company requirements remain the primary technical bar.

Prioritize evidence for:

1. a complete, inspectable Agent project rather than a prompt-only demo;
2. a real LLM provider path, model configuration, and recorded failure boundaries;
3. tool use, policy/authority enforcement, and domain-required RAG or workspace understanding;
4. deterministic evaluation, Bad Case retention, Trace/observability, and attributable failures;
5. two materially different task domains through one Runtime seam;
6. tests, CI, versioned release, raw results, and clean-environment reproduction.

Select the hardest **bounded, evidence-producing** next gate. Challenge does not authorize unbounded scope, skipped tests, fabricated metrics, or future-as-finished claims.

## Reference hierarchy

### DeerFlow | primary architecture reference

Read-only checkout: `../../30-已有资产与参考/工具与方法参考/deer-flow/`

Pinned review commit: `88252e9b318d34e7e1867155ad2c77993320788e`.

Inspect these entry points before proposing architecture:

- `AGENTS.md` and `backend/AGENTS.md`;
- `backend/README.md`;
- `backend/packages/harness/deerflow/agents/lead_agent/agent.py`;
- `backend/packages/harness/deerflow/runtime/runs/manager.py`;
- `backend/packages/harness/deerflow/sandbox/sandbox.py`;
- `backend/packages/harness/deerflow/skills/catalog.py`;
- `backend/packages/harness/deerflow/subagents/executor.py`.

For every borrowed idea, record the source path, problem, smaller local interface, and intentional omissions. DeerFlow is mechanism evidence, not a specification or implementation claim.

### Coze | product reference only

Use Coze to reason about task entry, skill/workflow organization, observation, debugging, evaluation, and release. It is not a code baseline or scored benchmark.

### PinchBench | general compatibility source

Use tag `v2.0.0`, commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`, as the initial content-pinned general benchmark source. It is OpenClaw-specific and does not define the Runtime Interface. Any translated local result must be labelled `pinchbench-compatible`; official compatibility requires the unmodified upstream runner.

### Composio 30-task thread | vertical methodology reference

Use <https://x.com/composio/status/2087889898208367036> for campaign shape and disclosed metrics: pass rate, duration, Token use, tool calls, cost per task, and cost per success. It does not supply a reproducible task set or grader.

## Target module model

```text
Workspace Agent Harness
└── General Agent Runtime
    ├── Run lifecycle and explicit terminal result
    ├── model, tool, and execution adapters
    ├── state, budgets, policy, Trace, and recovery
    └── Domain Pack loading and validation
                        | stable Domain Pack Interface
              +---------+---------+
              |                   |
       Data Analysis Pack   Workspace/Coding Pack
       tasks + guidance     tasks + guidance
       tools + policies     tools + policies
       evaluator            evaluator
```

A Vertical Domain Pack owns domain task schema, guidance/skills, requested tools, policy defaults, fixtures, and evaluator. It does not own the Agent loop, provider lifecycle, global Trace schema, checkpoint engine, or generic budget enforcement.

## Required invariants

1. Adding or replacing a Vertical Domain Pack does not edit Runtime source files.
2. Runtime produces exactly one explicit terminal RunResult for every admitted Run.
3. Domain guidance cannot widen authority granted by Runtime policy.
4. Evaluators and fixtures remain outside the agent-writable workspace.
5. Trace distinguishes Runtime events from domain events and records pack version/hash.
6. The same model/runtime configuration runs both proof domains through one public Runtime interface.
7. Runtime, policy, tool, and evaluator failures remain attributable.
8. Tests cross the same external seam as callers; no test-only public interface.
9. Keep a seam only when two adapters or tests demonstrate real variation.
10. Attribute borrowed DeerFlow mechanisms; never claim its capabilities as ours.

## Completed design gate | retained acceptance history

Produce:

1. `docs/design/deerflow-mechanism-map.md`
   - Map lifecycle, middleware, skills, sandbox, memory, subagents, persistence, policy, and tracing.
   - Record DeerFlow source, problem, `adopt now | defer | reject`, and reason.
2. `docs/design/general-vertical-system.md`
   - Compare at least two Interface shapes.
   - Define Runtime and Domain Pack interfaces, invariants, ordering, errors, configuration, and ownership.
   - Show which AgentLoop behavior is preserved, wrapped, split, or replaced.
3. `docs/design/proof-domains.md`
   - Define one realistic bounded task and deterministic evaluator for each proof domain.
   - Demonstrate why the domains make the seam real.
4. `docs/adr/0009-general-runtime-and-vertical-domain-packs.md`
   - Record seam placement, rejected alternatives, scope, and migration.
5. Failing contract tests for pack interchangeability and authority non-escalation.
6. `docs/design/benchmark-strategy.md`
   - Keep evaluation campaigns above the public Runtime seam.
   - Separate PinchBench compatibility from the original 15+15 vertical evidence suite.
   - Define source pinning, eligibility, metrics, raw artifacts, and public-Claim boundaries.
7. `docs/adr/0010-external-and-vertical-evaluation-lanes.md`
   - Record campaign seam placement, PinchBench compatibility labels, rejected alternatives, and acceptance evidence.
8. Source-located Wiki entries for PinchBench and the Composio thread.
9. Failing campaign contracts for exact suite selection, pre-run ineligibility, and cost-per-success aggregation.

This section records the completed design gate. Its contracts were red before Human acceptance and are green in the current implementation candidate.

## Explicit non-goals

- no DeerFlow fork, vendoring, import, subtree, or copied implementation;
- no real provider, CLI, UI, memory, or subagents in the proof-pack gate;
- no frontend, Gateway, Kubernetes, Redis, browser/computer use, third domain, or marketplace;
- no PinchBench execution, leaderboard submission, official-score Claim, in-process execution of upstream grader code, or 30-case result before the design and implementation gates pass;
- no general-agent claim before both packs pass the same Runtime contract;
- no modification of the reality resume or factual ledger;
- no resumption of the superseded Local Workspace v1 product plan.

## Handoff

Run:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Provide changed files, concrete seed Evidence, DeerFlow and PinchBench commits/paths inspected, the Composio source boundary, full test results, unresolved limitations, and explicit statements that no external benchmark was run, no DeerFlow code was copied, and no project or resume fact was upgraded by the Working Agent.

The Regulator independently reviews Interface depth and seam placement, inspects referenced DeerFlow code, and reruns positive and negative tests under `docs/governance/verification.md`.

## Repository hygiene

Keep credentials, private paths, Protected Prior Work, unpublished material, generated secrets, and agent-writable evaluation controls out of the repository. Preserve Git history and never rewrite evidence to make the new goal appear complete.

## Design handoff history | 2026-08-18

Status: complete as a Working Agent candidate; not independently accepted and not an implementation claim.

Produced:

1. `docs/design/deerflow-mechanism-map.md`;
2. `docs/design/general-vertical-system.md`;
3. `docs/design/proof-domains.md`;
4. `docs/adr/0009-general-runtime-and-vertical-domain-packs.md` with `Status: Proposed`;
5. `tests/test_general_runtime_contract.py` with three expected-red external-seam tests;
6. `docs/design/benchmark-strategy.md`;
7. `docs/adr/0010-external-and-vertical-evaluation-lanes.md` with `Status: Proposed`;
8. two source-located Wiki entries for PinchBench and the Composio comparison thread;
9. `tests/test_benchmark_campaign_contract.py` with three expected-red campaign-seam tests.

DeerFlow was inspected read-only at commit `88252e9b318d34e7e1867155ad2c77993320788e` through every source entry listed above. The earlier relative locator was corrected from an invalid four-level traversal to the repository-root-relative `../../30-已有资产与参考/工具与方法参考/deer-flow/`.

PinchBench was inspected read-only from tag `v2.0.0` at commit `47efe9bf5e14ae52dd9764c5e831317442b054a5`. Its pinned manifest contains 147 unique tasks in 11 categories and a 21-task core; the README/SKILL prose counts disagree with that manifest, so exact commit/tree/manifest digests are mandatory. The OpenClaw-specific runner and task-embedded Python grader execution were treated as compatibility and trust-boundary constraints, not copied as local Runtime behavior.

The Composio thread was inspected through its same-author continuation posts. It supports the 30-task campaign shape and efficiency metric list but does not expose reusable tasks, graders, raw results, repetitions, or variance.

Test evidence:

- accepted baseline: 15/15 pass when `test_package_identity.py`, `test_runtime.py`, and `test_trace.py` are run separately;
- proposed Runtime contract: 3/3 fail as expected because 19 ADR-0009 target Interface names do not exist;
- proposed campaign contract: 3/3 fail as expected because seven ADR-0010 target Interface names do not exist;
- the full discovery command is therefore intentionally non-zero at this design gate.
- the top-level acceptance command was rerun after rereading all 21 resolved human-feedback entries. Feedback and structure gates pass; it is then blocked before repository tests because `validate_knowledge_base.py` still pins project HEAD `7d267bc7...`, while current local and `origin/main` are the descendant `116da367...` after the published Learning Wiki and benchmark-source commits. This Working Agent did not reset Git or change the acceptance hash.
- diagnostics beyond that stale-head block: resume/package and both PDF checks pass; 70/71 top-level validator tests pass, with the same HEAD assertion as the only failure; Python compile and whitespace/path probes for this handoff pass.

Selected Interface: packs are validated and frozen at `GeneralAgentRuntime.create(...)`; callers use one `run(RunRequest) -> RunReport` method with an exact pack selector. The Runtime hides admission, policy, workspace, AgentLoop, Trace, artifact freeze, evaluation, and terminalization ordering. Dynamic install/receipt/lock workflows are deferred.

Selected evaluation seam: `EvaluationCampaign.create(...)` receives the Runtime and frozen suite Adapters; `campaign.run(CampaignRequest) -> CampaignReport` calls only `runtime.run`. PinchBench and the local vertical suite make the suite seam real without exposing campaign lifecycle methods through Runtime.

Implementation-level choices behind the selected seam include the canonical local pack/suite fingerprint schemas and private workspace/Trace Adapter method signatures. Runtime recomputes Pack code/material digests at registration; Campaign recomputes source, case, transform, and suite digests during preflight.

No DeerFlow or PinchBench code was copied and no external benchmark was run. The concrete Packs, evaluators, and two-case campaign are local candidates only. No real provider, CLI, general OS sandbox, checkpoint, memory, subagent, 15+15 catalog, benchmark score, project fact, or resume fact was added.

## Working Agent implementation checkpoint | 2026-08-19

Status: Runtime/Campaign/seed-Pack candidate; Human-authorized and accepted by a separate same-model Regulator on the fourth pass for ordinary operator-trusted implementation behavior. High-risk security, public benchmark, task expansion, project-fact, and resume gates remain closed.

Implemented in `workspace_agent_harness/__init__.py` through the accepted public seams:

- exact frozen Pack and Suite identities;
- Runtime-recomputed Pack bundle and Suite source/case/transform content hashes;
- explicit secret-free Adapter `identity_material()` plus per-run Model/Tool/Workspace identity revalidation;
- per-run Pack manifest/content/bound-method revalidation and evaluator identity bound to the exact Pack bundle;
- registration-time frozen globals/helper snapshots for Pack `compile_task` and `evaluate`, preventing live module-helper rebinding from changing registered execution semantics;
- task-schema admission and capability/resource intersection;
- execution-time denial before capability Adapter invocation;
- separate execution/evaluation states with terminable evaluator-process timeout and output-size limits;
- schema-2 Runtime Trace ordering plus Runtime/model/tool/workspace/Pack/evaluator provenance;
- pre-run required-Pack checks, Runtime-provenance baseline retention even when every call raises, ineligibility, Bad Case denominators, duration/usage/Token/cost coverage, failure attribution, and append-only campaign attempt/report artifacts;
- coding-seed AST audit followed by public plus protected hidden cases, retaining subprocess stdout, stderr, test output, and exit status.

Local candidate Evidence: 39/39 tests pass, including the original 15-test baseline, live data/coding helper-rebinding stability, private model-configuration collision prevention, missing Adapter identity rejection, pre-run Pack drift rejection, Pack/Suite behavior drift probes, post-timeout side-effect prevention, all-exception baseline provenance retention, full execution/evaluation failure-denominator attribution, two concrete Pack paths, the hidden-import negative probe, and the two-case development-smoke campaign. Static Python compilation, MyPy, and repository whitespace checks pass. The top-level acceptance gate passes Human Feedback and blocks only on its stale project-HEAD pin (`7d267...` expected versus current/origin `116da...`, with the former an ancestor); Working Agent scope does not authorize editing `80-监管与验收/`.

Ordinary implementation acceptance is complete for the bounded candidate. Still open before any expansion or fact promotion: explicit Human or different-model review of high-risk security/permission boundaries and correction of the separate stale top-level HEAD pin by an authorized regulator. The globals snapshot is shallow and does not resist malicious interpreter/stdlib mutation; the coding evaluator's AST allowlist plus fixed isolated-interpreter subprocess is not a general OS sandbox. Only two scripted seed cases exist. No real provider, PinchBench Adapter, 15+15 task catalog, external benchmark run, score, project fact, or resume fact exists.
