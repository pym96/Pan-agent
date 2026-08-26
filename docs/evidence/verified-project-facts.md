# Verified Project Facts

This file is the only project-level source of truth for independently accepted implementation facts. Plans, specs, README summaries, Wiki pages, and Working Agent handoffs are not substitutes.

## Record contract

Every fact has an atomic Claim, Evidence locators, acceptance Criteria, an independent Regulator record, an acceptance date, and explicit limits. New facts begin as candidates and cannot be marked `verified` by their Working Agent.

## Current facts

### VPF-001 | Public project identity

- State: verified
- Claim: Git commit `7d267bc7babac7778acf3461b86793eed4f34e5b` preserves the renamed `workspace-agent-harness` repository and the `workspace_agent_harness` Python package identity.
- Evidence: Git HEAD/remote; `workspace_agent_harness/__init__.py`; `tests/test_package_identity.py`.
- Criterion: local and remote `main` resolve to the named commit and the package-identity test passes.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Master-20260813-迁移与简历验收.md`.
- Accepted: 2026-08-13
- Limits: repository identity does not prove the target General Runtime or full Harness is implemented.

### VPF-002 | Bounded AgentLoop interface

- State: verified
- Claim: the accepted commit implements `AgentLoop.run(Task, RunLimits) -> RunResult` with replaceable `ModelAdapter` and `Tool` interfaces.
- Evidence: `workspace_agent_harness/__init__.py`; `tests/test_runtime.py`.
- Criterion: the same AgentLoop entry point completes with two model-adapter/tool combinations without editing loop control flow.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Master-20260813-迁移与简历验收.md`.
- Accepted: 2026-08-13
- Limits: fake adapters demonstrate a seam, not a real provider, CLI, or production Runtime.

### VPF-003 | Explicit terminal results and budgets

- State: verified
- Claim: AgentLoop returns one of seven explicit terminal statuses covering success, model error, parse error, tool error, step limit, timeout, and model-call-budget exceeded.
- Evidence: `workspace_agent_harness/__init__.py`; terminal and budget cases in `tests/test_runtime.py`.
- Criterion: each named branch returns an auditable RunResult and the budget/timeout tests stop before an extra model call.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Master-20260813-迁移与简历验收.md`.
- Accepted: 2026-08-13
- Limits: timeout is checked at loop boundaries and does not preempt a blocked provider/tool call.

### VPF-004 | JSONL Trace validation boundary

- State: verified
- Claim: a single run appends JSONL Trace events, refuses to overwrite an existing path, and the loader rejects unknown event types, sequence gaps, and unknown terminal statuses.
- Evidence: `workspace_agent_harness/__init__.py`; `tests/test_trace.py`; representative negative probes recorded in prior Regulator reviews.
- Criterion: all positive Trace behavior and the overwrite/event/sequence/status negative cases pass without modifying an existing sentinel.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Master-20260813-迁移与简历验收.md`.
- Accepted: 2026-08-13
- Limits: this is not cross-process tamper resistance, durable checkpointing, or recovery.

### VPF-005 | Accepted test baseline

- State: verified
- Claim: the accepted implementation baseline has 14 deterministic Runtime/Trace behavior tests and one package-identity test.
- Evidence: `tests/test_runtime.py`; `tests/test_trace.py`; `tests/test_package_identity.py`; recorded 15/15 run in the independent acceptance report.
- Criterion: `python3 -m unittest discover -s tests -p 'test_*.py' -v` passes all 15 tests at the accepted commit.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Master-20260813-迁移与简历验收.md`.
- Accepted: 2026-08-13
- Limits: this count is not a task-level LLM evaluation, benchmark score, CI result, or proof of the target General Runtime.

### VPF-006 | Two seed Domain Packs through one Runtime and model

- State: verified
- Claim: at accepted commit `d16b5876e6f451e6229163f9f188d8742b280ae0`, one `GeneralAgentRuntime` and one `ScriptedProofModel` execute the `data-analysis` and `workspace-coding` seed Packs through the same `run` interface, and both deterministic seed cases pass.
- Evidence: `workspace_agent_harness/proof_packs.py`; `tests/test_proof_packs.py::ProofPackIntegrationTest.test_two_concrete_seed_packs_pass_one_runtime_and_model`; the retained two-case development-smoke report reproduced by the independent review.
- Criterion: both exact Pack selectors run through one Runtime configuration and one model Adapter, produce their distinct artifacts, and receive passing deterministic evaluator results.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Regulator-20260819-积压验收.md`.
- Accepted: 2026-08-19
- Limits: this is a two-case local development proof with a scripted model, not a live LLM result, a public benchmark, or proof of general cross-domain performance.

### VPF-007 | Runtime authority intersection

- State: verified
- Claim: the accepted General Runtime resolves capability authority from the Runtime ceiling, caller grant, and Pack request, and rejects attempts to widen authority or traverse from workspace resources into the control root.
- Evidence: `workspace_agent_harness/__init__.py`; `tests/test_general_runtime_contract.py::GeneralRuntimeContractTest.test_guidance_and_model_action_cannot_widen_runtime_authority`; P6/P7 in `tests/test_regulator_negative_probes.py`.
- Criterion: an out-of-authority model action has zero tool effects and terminates `policy_blocked`; caller-wider-than-ceiling and traversal probes fail closed without modifying the protected sentinel.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Regulator-20260819-积压验收.md`.
- Accepted: 2026-08-19
- Limits: this establishes reliability behavior for operator-trusted Pack code; it is not a malicious-code or OS sandbox claim.

### VPF-008 | Evaluator control separation and bounded process execution

- State: verified
- Claim: the accepted Runtime gives a Domain Evaluator frozen `EvaluationEvidence` rather than the Agent's model, tools, workspace authority, or control-plane mutators; evaluator failure remains separate from the execution terminal result, and a timed-out evaluator process group is terminated.
- Evidence: `workspace_agent_harness/__init__.py`; `tests/test_general_runtime_contract.py` evaluator error/timeout cases; P3 in `tests/test_regulator_negative_probes.py`.
- Criterion: evaluator error produces `EvaluationStatus.ERROR` without rewriting a successful execution result, while the timeout probe terminates the evaluator and its child before a delayed protected-side effect occurs.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Regulator-20260819-积压验收.md`.
- Accepted: 2026-08-19
- Limits: process and authority separation are accepted reliability mechanisms, not a general security-isolation or hostile-code claim.

### VPF-009 | Protocol-reliability-v1 completed identity

- State: verified
- Claim: the dated `protocol-reliability-v1` experiment reconstructed 24 fixed provider-visible Contexts from retained ReAct Traces and completed all 240 original JSON/Strict slots plus 90 eligible one-repair calls, with 240/240 original attempt artifacts present.
- Evidence: `workspace_agent_harness/benchmark_configs/protocol-reliability-v1.json`; `workspace_agent_harness/benchmark_configs/protocol-reliability-v1-contexts.json`; `.runs/protocol-reliability-v1/`; `.runs/protocol-reliability-v1-summary-with-call-coverage.json`; `docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md`.
- Criterion: config/corpus identities reproduce exactly, the frozen denominator and call coverage are complete, and an independent reassessment of retained response bodies reproduces the summary tables.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Regulator-20260824-协议可靠性验收.md`.
- Accepted: 2026-08-24
- Limits: this replays fixed Contexts without executing tools or grading tasks; it is not task quality, a SWE-bench result, or a persistent Provider benchmark.

### VPF-010 | Strict one-repair L3 observation

- State: verified
- Claim: within the frozen 2026-08-23 Context corpus and Provider window, Strict Function Calling reached canonical L3 in `93/120` attempts without repair and `120/120` after at most one repair; all 27 Strict repairs recovered to L3.
- Evidence: `.runs/protocol-reliability-v1-summary-with-call-coverage.json`; the L0-L3 and repair tables in `docs/evidence/protocol-reliability-v1-candidate-2026-08-23.md`.
- Criterion: independent response-body reassessment reproduces `93/120`, `120/120`, and `27/27` without reusing the experiment assessor.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Regulator-20260824-协议可靠性验收.md`.
- Accepted: 2026-08-24
- Limits: the no-repair arm bundled a 2,048-token requested output ceiling; the observation is Provider × model × endpoint × protocol × ceiling specific and is not a transport-only causal estimate or reliability guarantee.

### VPF-011 | Four-ceiling sensitivity completed identity

- State: verified
- Claim: the maximum-token sensitivity work completed 75 preregistered Strict/no-repair calls at 2,048/4,096/8,192 Tokens and a separately versioned 25-call 16,384-token extension over the same five failure-enriched real Contexts.
- Evidence: `workspace_agent_harness/benchmark_configs/protocol-reliability-v1.1-max-token-sensitivity.json`; `workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json`; both retained `.runs/` roots, manifests, and summaries; `docs/evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md`.
- Criterion: both exact matrices complete, their manifests and summaries regenerate, the 16K lineage binds the completed v1.1 identities, and response-byte tampering is rejected.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Regulator-20260824-协议可靠性验收.md`.
- Accepted: 2026-08-24
- Limits: the five Contexts were deliberately selected from prior `length@2048` failures; this is not a population sample or a general Provider comparison.

### VPF-012 | Non-monotonic four-ceiling L3 observation

- State: verified
- Claim: canonical L3 counts in the four sensitivity arms were `2/25`, `4/25`, `4/25`, and `5/25` at 2K/4K/8K/16K respectively, so the observed L3 count did not improve monotonically with each larger output ceiling.
- Evidence: both retained sensitivity summaries; the four-ceiling table in `docs/evidence/protocol-max-token-sensitivity-candidate-2026-08-24.md`.
- Criterion: independent recomputation reproduces all four L0-L3 denominators, cap-hit counts, Token totals, and Context-by-ceiling cells.
- Independent acceptance: `career-planning/80-监管与验收/当前审查/Regulator-20260824-协议可靠性验收.md`.
- Accepted: 2026-08-24
- Limits: confidence intervals overlap; the observation does not establish an optimal ceiling, a Provider-wide law, action correctness, or task success.

### VPF-013 | Offline typed native-history Translation Adapter

- State: verified
- Claim: accepted commit `83fa43087f3ad720ea0b577bf80810d94acb274b` implements a provider-neutral typed `CanonicalConversation` and a DeepSeek Translation Adapter that encodes complete native assistant tool-call/paired tool-result history, decodes retained responses, and fails closed on invalid envelope, action, and correlation shapes.
- Evidence: `workspace_agent_harness/translation.py`; `workspace_agent_harness/deepseek_translation.py`; `tests/test_translation_adapter.py`; `tests/fixtures/translation/manifest.json`; WorkOrder #4 Regulator Verdict.
- Criterion: the independent offline probes and fixture suite reproduce native call/result pairing, reasoning/action separation, ModelProfile-owned output ceilings, classified rejection, content hashes, and a four-cell zero-live-call dry run.
- Independent acceptance: <https://github.com/pym96/workspace-agent-harness/issues/4#issuecomment-5406181641>; final landing record <https://github.com/pym96/workspace-agent-harness/issues/4#issuecomment-5409186399>.
- Accepted: 2026-08-25
- Limits: offline conformance does not prove that DeepSeek accepts the payload or that native history improves behavior; this Adapter was not integrated into the evented AgentLoop by WorkOrder #4.

### VPF-014 | Evented AgentLoop admission and retained event path

- State: verified
- Claim: accepted commit `c2c9e33aad20d1994b7cd7ea4fb8425d6ef92b7a` implements an evented `AgentLoop` whose sole model operation is `ModelGateway.exchange(PreparedModelTurn, cancel_signal)`, validates a candidate before History advancement or tool effects, and retains the deterministic tool round trip in one ordered `run-event/v1` log with exactly one terminal event.
- Evidence: `workspace_agent_harness/evented.py`; `tests/test_evented_agent.py`; `docs/design/evented-tui-tracer.md`; WorkOrder #6 Regulator Verdict.
- Criterion: the independent review reproduces the 17-event round trip, admission-negative cases with zero tool effects, event identity/sequence/causal/terminal invariants, and tamper rejection.
- Independent acceptance: <https://github.com/pym96/workspace-agent-harness/issues/6#issuecomment-5420517568>; landing record <https://github.com/pym96/workspace-agent-harness/issues/6#issuecomment-5420615260>.
- Accepted: 2026-08-26
- Limits: this deterministic slice makes no live Provider call and does not imply semantic compaction, Provider-overflow recovery, Behavioral Eval, checkpoint/resume, or production operation.

### VPF-015 | Replayable and cancellable Python TUI tracer

- State: verified
- Claim: accepted commit `c2c9e33aad20d1994b7cd7ea4fb8425d6ef92b7a` provides a Python terminal entry that accepts non-blank Unicode tasks, renders and replays retained events without model/tool calls, and settles Ctrl-C cancellation with exactly one `cancelled` terminal event.
- Evidence: `workspace_agent_harness/tui.py`; `tests/test_evented_tui.py`; `docs/design/evented-tui-tracer.md`; WorkOrder #6 Regulator Verdict.
- Criterion: independent CLI and PTY checks cover Unicode input, blank refusal, tool round trip, replay equivalence, cancellation exit `130`, and terminal-event uniqueness.
- Independent acceptance: <https://github.com/pym96/workspace-agent-harness/issues/6#issuecomment-5420517568>; landing record <https://github.com/pym96/workspace-agent-harness/issues/6#issuecomment-5420615260>.
- Accepted: 2026-08-26
- Limits: the TUI is a credential-free deterministic tracer, not a live-Provider chat product or the deferred compact/expanded/trace navigation UI.

### VPF-016 | Accepted 116-test repository baseline

- State: verified
- Claim: at accepted commit `c2c9e33aad20d1994b7cd7ea4fb8425d6ef92b7a`, an independent Regulator reran the complete repository test discovery and observed `116/116` tests pass; the surrounding acceptance run also passed its 75 host checks.
- Evidence: WorkOrder #6 Regulator Verdict and final landing record; repository tests at the accepted commit.
- Criterion: `python3 -m unittest discover -s tests -p 'test_*.py' -v` reports 116 tests and exits successfully, and the outer acceptance command exits successfully at the landed baseline.
- Independent acceptance: <https://github.com/pym96/workspace-agent-harness/issues/6#issuecomment-5420517568>; landing record <https://github.com/pym96/workspace-agent-harness/issues/6#issuecomment-5420615260>.
- Accepted: 2026-08-26
- Limits: the count is a repository-test count, not 116 Agent tasks, benchmark attempts, or task successes; one disclosed pre-existing `ResourceWarning` did not change the successful exit.

## Explicitly unverified target boundary

No Verified Project Fact currently establishes live-provider compatibility for the accepted typed Translation Adapter or evented TUI, a malicious-code/OS sandbox, durable checkpoint/recovery, cross-domain generality beyond the two scripted seed cases, a public task benchmark result, CI release, or clean-environment reproduction.
