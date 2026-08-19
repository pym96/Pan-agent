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

## Explicitly unverified target boundary

No Verified Project Fact currently establishes a real LLM provider, CLI, Domain Pack contract, sandbox, durable checkpoint/recovery, cross-domain generality, public benchmark result, CI release, or clean-environment reproduction.
