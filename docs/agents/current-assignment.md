# Current Assignment | Authoritative TypeScript/Pi product cutover

This document owns the current project lane, constraints, and non-goals. It does not grant a session-specific task or establish implementation facts. A Working session starts only from a Master-published WorkOrder, and that WorkOrder cannot widen this lane or override Human decisions. Read the fact register linked from the root Agent map before making any current-state statement.

## Active mission | WorkOrder #24 authoritative TypeScript cutover

The active lane is [WorkOrder #24](https://github.com/pym96/Pan-agent/issues/24) (Criteria-Version `1.0`, C-CUT-01…10; C-CUT-07 high-risk) on exact base `c4796f7da173f1717d5c9adb07a9d2e13cc1cf8b`. It makes the existing TypeScript/Pi `GeneralAgentSession` the authoritative product and default Human route, retains the Python implementation as reference-only, and retains prior mechanism/evaluation work as experiment/reference. Language-neutral fixtures preserve canonical tool semantics, terminal outcomes, cancellation, and Context behavior without making the Python product package a TypeScript test or runtime dependency.

The Bash-only ReAct lane is retired as an active mission; its raw artifacts, locks, reports, Evidence, and learning record remain historical experiment material. WorkOrder #24 must not edit those identities, make a Provider call, read a credential, query a balance, incur paid cost, claim security/benchmark/model quality, promote a fact, or begin #17. Its candidate requires deterministic TypeScript conformance, full regression, candidate-mode outer acceptance, immutable push, Human C-CUT-02 trial, and a different-session Regulator Verdict.

## Retained prior mission history | WorkOrder #25 (accepted and landed)

WorkOrder #25 added the three memory lanes to the TypeScript/Pi working stack and passed independent review before landing at `3dc834ef3405564d8eeff802ca54cb5874079df3`: an append-only-then-sealed Run Archive, an append-only supersedes-only Retrospective Ledger linked to sealed archives, and a version-controlled mutable Runbook whose content-hash revision is bound into every run. Its acceptance does not establish the separate #24 product cutover.

## Retained prior mission history | WorkOrder #22 (accepted and landed)

WorkOrder #22's Python trusted-local shell and Human-confirmed PTY handoff passed its high-risk independent review and landed at `af28c081f28c74aea8719054406ef60e82ad27b9`. Its earlier brief text follows unchanged for history.

## Retained prior mission history | WorkOrder #22 superseding brief (historical text)

The latest [Human/Master brief on WorkOrder #22](https://github.com/pym96/Pan-agent/issues/22#issuecomment-5492880264) supersedes the original #22 sandbox contract and its stale routing comment. Start from accepted main `4ebf660b7166724e604263e6c3d60a139bf0db8b`. Python is the behavioral prototype layer; TypeScript/Pi remains the product implementation direction and must stay directly runnable without receiving the #22 capability migration.

WorkOrder #22 adds a default-off trusted-local non-interactive shell and a distinct Human-confirmed interactive PTY handoff to the Python DeepSeek Live TUI. Deterministic checks must precede at least one real `deepseek-v4-flash` Run from exact candidate bytes; the Agent must create/inspect/verify a terminal `snake.py`, reach the confirmation boundary, and let the Human operate and quit it. All attempts remain retained under a combined CNY 2.00 development ceiling. This slice makes no sandbox, containment, network-denial, benchmark, model-quality, project-fact, Wiki, resume, PDF, #25, or TypeScript migration claim. Candidate code, design, tests, live artifacts, and SHA-bound Handoff require a different-session high-risk Regulator review.

## Retained prior mission history | superseded for #22

Human accepted ADR-0009 and ADR-0010 on 2026-08-19. The HF-20260820-022 benchmark-configuration assignment completed its ordinary independent Gate on 2026-08-20. After reading ReAct and SWE-agent, the human then accepted ADR-0011's next bounded learning phase: reproduce a bash-only visible ReAct mechanism first, then use its Bad Cases to choose later SWE-agent-style Agent-Computer Interface changes.

Implement Phase 0 inside the existing `workspace-coding` lane without replacing the General Runtime architecture or presenting a five-case development smoke as a benchmark score. Freeze the treatment before provider calls: five official SWE-bench Lite development cases, Act-only versus visible ReAct, three repetitions, DeepSeek V4 Flash with provider thinking disabled, one bash tool, disposable Docker execution, no model-visible history compaction, lossless raw command artifacts, and official `resolved` as the primary outcome.

Every case was ineligible for Agent execution until its pinned official gold patch completed and resolved. Infrastructure/evaluator errors remain separate from unresolved Agent patches. The authorized DeepSeek credential was funded after the initial insufficient-balance response; the locked preflight then returned a usable completion, and all 30 frozen slots executed from 2026-08-21 through 2026-08-23. A sixth independent Regulator review reproduced the ordinary candidate-Evidence claims: 29 task outcomes, one infrastructure/artifact failure, and one resolved planned slot per treatment. This review did not create a Verified Project Fact. Do not present the result as a SWE-bench Lite score or repair/rerun the failed formal slot after observing its trajectory.

Phase-transition note: the original **design before implementation** gate for the **General Agent Runtime + Vertical Domain Packs** required **failing contract tests**. Human acceptance closed that historical red-test gate; the current implementation and regression suite must remain green.

Generality requires at least two materially different packs through the same Runtime interface and lifecycle:

1. `data-analysis`: structured-data inspection, transformation, calculation, policy boundaries, and a domain evaluator;
2. `workspace-coding`: repository/file maintenance, code changes, tests, policy boundaries, and a domain evaluator.

Do not add a third domain before these two are rigorous.

## Accepted foundation and prior configuration gate

The Working Agent implementation candidate currently covers Runtime-recomputed Pack/Suite/source/case/transform digests, fail-closed task admission, capability/resource authority intersection, bounded AgentLoop reuse, schema-2 Runtime provenance, process-terminated evaluator timeouts, separate evaluator status, campaign eligibility/denominators, usage/cost coverage, failure attribution, and append-only attempt artifacts. These are Candidate Claims, not Verified Project Facts.

The implementation candidate now also completes the concrete seed gate:

1. a private local workspace staging/freeze seam adds no caller lifecycle methods;
2. `data-analysis` stages the accepted CSV, uses typed aggregate/write capabilities, and recomputes an exact Decimal/CSV verdict;
3. `workspace-coding` stages the accepted repository, limits mutation to `src/slugify.py`, audits AST, and runs fixed hidden cases in an isolated-interpreter subprocess without arbitrary shell;
4. both selectors run through one Runtime instance and one scripted Model Adapter;
5. a two-case suite labelled `vertical-development-smoke` runs only through `EvaluationCampaign -> runtime.run` and retains raw artifacts.

The ordinary independent Runtime/seed implementation gate has passed. HF-20260820-022 explicitly authorizes the configuration-only expansion that was previously deferred:

1. content-lock and audit PinchBench `v2.0.0` core/full catalogs without translating or invoking a task;
2. fix an original ordered 15+15 vertical catalog while keeping every unimplemented case visibly ineligible;
3. prove the configured vertical suite calls only the two existing seed cases through `EvaluationCampaign -> runtime.run`.

The configuration artifacts and tests passed an independent ordinary Regulator review after one rejection/remediation round. The HF-20260820-022 assignment is complete at the configuration boundary. Security/authority publicity, stale top-level HEAD correction, implementation of the remaining 28 vertical cases, PinchBench translation/execution, public numbers, and fact promotion remain separate open work and are not authorized by this completion.

## Completed Phase 0 gate

Required Working Agent candidate outputs:

1. one secret-free DeepSeek JSON Adapter that locks `deepseek-v4-flash`, provider thinking disabled, JSON-object output, temperature zero, and explicit usage/fingerprint capture;
2. Act-only/ReAct response contracts that differ only by the visible bounded `thought` requirement and canonicalize into the existing `AgentLoop` action contract;
3. one Docker bash tool that returns bounded head-tail observations while preserving complete stdout/stderr and SHA-256 artifacts;
4. one content-hashed `react-mvp-5` lock for the official Lite development source, exact ordered IDs/images, two variants, and three repetitions;
5. passing contract tests for treatment isolation, observation feedback, lossless raw streams, credential exclusion, and configuration drift;
6. a pinned official-runner gold receipt for every selected case before any model execution;
7. complete model trajectories, patches, official evaluator artifacts, failure attribution, and paired summaries for all 30 planned slots, retaining any infrastructure/artifact failure separately;
8. a Learning Wiki fact for the reproduced SWE-bench/Docker mechanics and an experiment-reproduced learning fact after the comparison runs.

The comparison and sixth independent ordinary review have now completed. The former Open Learning Question is superseded by the experiment-reproduced Wiki fact and candidate Evidence record. The accepted next gate is the separately frozen `protocol-reliability-v1` experiment before any SWE-agent-style ACI treatment.

The one-case Verified-set Docker probe demonstrates the initial ARM-to-amd64 evaluator path. All five selected Lite cases subsequently completed and resolved their pinned gold patches with zero infrastructure/evaluator errors. The sixth review accepted this ordinary candidate-Evidence boundary; the Working Agent still cannot register a Verified Project Fact.

## Current protocol-reliability-v1 gate

Human accepted ADR-0012 and authorized execution after the sixth review. Before the first formal provider slot, the Working Agent must retain:

1. a 24-context content-hashed corpus reconstructed from all 30 source Traces: 16 unique terminal failure contexts plus eight deterministic variant/depth controls;
2. one content-hashed lock for DeepSeek V4 Flash, thinking disabled, JSON-object versus Strict Function Calling Beta, five repetitions, deterministic serial order, and the J0/J1/S0/S1 derived policies;
3. exactly one repair after L1-L3 only, with shared original calls and complete incremental Token accounting;
4. deterministic L0-L3 and earliest-failure classification, exact counts, Wilson 95% intervals, cohort/variant splits, and missing-usage coverage;
5. append-only secret-free requests, lossless responses, hashes, UTC timing, endpoints, returned model, and `system_fingerprint` identity;
6. stop-after-retention behavior for fatal authentication/balance HTTP statuses, three consecutive L0 failures, or non-empty fingerprint drift within one transport;
7. offline contract/negative tests and a dry-run that enumerate exactly 240 original slots before API execution;
8. a candidate Evidence record and experiment-reproduced Learning Wiki fact only after the matrix is complete and deterministically summarized.

The experiment does not execute bash, judge task correctness, prove general Harness reuse, or create a persistent benchmark. Its result requires a new independent Regulator session before any candidate claim can be accepted.

Working checkpoint: all 240 original slots completed in the frozen order, with 90 repair calls and no missing attempt artifact. The deterministic summary and candidate Evidence are at `docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md`. Post-run regression and the root acceptance gate passed; the remaining Gate is independent Regulator inspection. The Working Agent must not select a coding ACI treatment from this result until that Gate closes.

## Current maximum-token sensitivity checkpoint

After the Human identified the 2,048-token confound, the Working Agent froze and completed `protocol-reliability-v1.1-max-token-sensitivity`: the exact five parent ReAct Contexts covering all 21 Strict `length@2048` failures, three ceilings (2K/4K/8K), five repetitions, Strict transport only, no repair, and 75/75 retained calls. After v1.1 completed, the Human requested a 16K check; it was frozen as the separately identified `protocol-reliability-v1.2-max-token-16k-extension`, locked to the completed v1.1 summary/raw manifest, and completed 25/25 calls.

Candidate result: L3 was 2/25, 4/25, 4/25, and 5/25 at 2K/4K/8K/16K; exact cap hits were 19, 16, 20, and 15. Fifteen 16K calls still generated exactly to the ceiling, while one 16K call ended at L0 with unknown underlying transport cause. The Working Agent classifies this as persistent runaway with Context-dependent branching, not evidence that 16K should become the default. The v1 S0 result must be described as Strict under a bundled 2,048 ceiling rather than an unconfounded transport-only estimate.

The deterministic summaries and candidate record are indexed at `docs/evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md`. The remaining Gate is a new independent Regulator session that reproduces both summaries from raw artifacts and adds negative tests. No coding ACI treatment, VPF, factual-ledger entry, or resume claim is authorized by this Working checkpoint.

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

Read-only checkout: `../../30-已有资产与参考/candidate-projects/deer-flow/`

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
- no provider expansion beyond the frozen DeepSeek Phase 0 Adapter; no CLI, UI, memory, or subagents in this gate;
- no frontend, Gateway, Kubernetes, Redis, browser/computer use, third domain, or marketplace;
- no PinchBench task execution or translation, leaderboard submission, official-score Claim, in-process execution of upstream grader code, or 30-case result;
- no attempt to run the 28 vertical cases whose fixtures/evaluators are only configured; they must remain visible and pre-run ineligible;
- no general-agent claim before both packs pass the same Runtime contract;
- no SWE-bench Lite score, leaderboard submission, task substitution after outcomes, or SWE-agent capability claim from the five-case development smoke;
- no modification of the reality resume or factual ledger;
- no resumption of the superseded Local Workspace v1 product plan.

## Handoff

Run:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Provide changed files, Phase 0 environment/contract Evidence, pinned SWE-bench source/runner identities, full test results, unresolved provider/environment limits, and explicit statements distinguishing gold evaluator gates from Agent results. Confirm that no leaderboard score, Verified Project Fact, factual-ledger entry, or resume fact was upgraded by the Working Agent.

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

DeerFlow was inspected read-only at commit `88252e9b318d34e7e1867155ad2c77993320788e` through every source entry listed above. The earlier relative locator was corrected from an invalid four-level traversal to the repository-root-relative `../../30-已有资产与参考/candidate-projects/deer-flow/`.

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

At this 2026-08-18 design handoff, no DeerFlow or PinchBench code was copied and no external benchmark was run. The concrete Packs, evaluators, and two-case campaign were local candidates only. No real provider, CLI, general OS sandbox, checkpoint, memory, subagent, 15+15 catalog, benchmark score, project fact, or resume fact was added.

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

At the 2026-08-19 checkpoint, ordinary implementation acceptance was complete for the bounded seed candidate. Still open before any fact promotion: explicit Human or different-model review of high-risk security/permission boundaries and correction of the separate stale top-level HEAD pin by an authorized regulator. The globals snapshot is shallow and does not resist malicious interpreter/stdlib mutation; the coding evaluator's AST allowlist plus fixed isolated-interpreter subprocess is not a general OS sandbox. Only two scripted seed cases existed, with no real provider, PinchBench Adapter, 15+15 task catalog, external benchmark run, score, project fact, or resume fact.

## Working Agent benchmark-configuration checkpoint | 2026-08-20

Status: ordinary configuration boundary independently accepted after one rejection/remediation round; not a Verified Project Fact and not a benchmark result.

Candidate outputs:

1. `workspace_agent_harness/benchmarks.py` adds one small suite-loading Interface. It hides Git pin verification, clean-task-worktree checks, manifest/task-set parsing, strict positive timeout/frontmatter audit, upstream-grader non-execution, frozen Suite identity construction, and vertical seed/control/ineligibility composition.
2. `workspace_agent_harness/benchmark_configs/pinchbench-{core,full}-v2.0.0.json` pin the requested upstream source. Real-source P0 audit resolves 21 core and 147 full cases. Every case is pre-run ineligible with `pinchbench.translation_not_frozen`; no upstream grader is imported or executed.
3. The audit retains the pinned upstream discrepancy `task_polymarket_briefing`: manifest category `research`, frontmatter category `Research`. The manifest remains canonical and the discrepancy remains in source provenance.
4. `workspace_agent_harness/benchmark_configs/vertical-evidence-v1.json` fixes 30 original case IDs/scopes, exactly 15 per proof Pack. Only `paid-revenue-by-region-v1` and `repair-slugify-v1` map to implemented `RunRequest` values; their configured fixture/evaluator IDs are checked against the real Pack `ControlProjection` and exact identities are retained. The other 28 remain pre-run ineligible with `vertical.case_not_implemented`.
5. A one-repetition development configuration smoke retains all 30 case records, attempts 2, passes the 2 existing deterministic seeds, and reports 28 ineligible. This is configuration evidence, not a 2/2 benchmark score.

Candidate suite identities at the reviewed working snapshot:

- PinchBench core: `sha256:7f79aeeb5bd4078cf3fb16844ac032163b9a7ec18efcb6464ca4ec72e3fcedda`;
- PinchBench full: `sha256:540198e6121660a92e217cab0c18dfebdde73a60a09b1b6b9b2d760831c19e06`;
- vertical evidence config: `sha256:834a3141470bb69acb69b7a37241bd1753f92a64613b9b94623f360b47d85005`.

First independent benchmark-configuration review: REJECT. It found that the initial catalog named the two seed evaluators incorrectly and that the loader would rehash forged eligible fixture/evaluator claims instead of comparing them with the execution control plane; it also found that missing and non-positive PinchBench timeouts were accepted. The Working remediation corrected both evaluator IDs, derived and validated the real seed `ControlProjection`, retained resolved identities in source provenance, and required every task timeout to be a positive integer.

Second independent review: ACCEPT for the ordinary configuration-only boundary. Independent probes rejected forged eligible fixture/evaluator values and missing/zero/negative/non-integer timeouts; linked resolved controls to both Pack compilation and actual RunReport provenance; retained 21/147 Pinch cases as ineligible; retained a 30-case vertical denominator with 2 attempted seeds and 28 ineligible cases; and rebuilt/installed the wheel with all locks present. The review explicitly excludes benchmark translation/execution, official compatibility, public numbers, remaining case implementation, high-risk security Claims, VPF, factual-ledger, and resume changes.

No external benchmark attempt, provider call, public number, official compatibility Claim, Verified Project Fact, factual-ledger change, or resume change is part of this checkpoint.
