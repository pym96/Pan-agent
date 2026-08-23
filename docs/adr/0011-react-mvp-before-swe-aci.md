# ADR-0011: Reproduce a bash-only ReAct mechanism before adding a SWE-style ACI

- Status: Accepted
- Date: 2026-08-20
- Decision owner: human accepted the frozen MVP choices during the ReAct/SWE planning interview; implementation conformance pending independent review
- Depends on: ADR-0009 and ADR-0010

## Context

The project already has a bounded `AgentLoop`, a `workspace-coding` proof Pack, and an evaluation campaign seam, but its accepted benchmark configuration does not exercise a real provider or a general coding environment. Reading ReAct and SWE-agent exposed two different learning objects: interleaved thought/action/observation as loop grammar, and a coding-specific Agent-Computer Interface as an environment design.

Implementing both at once would make a success or failure hard to attribute. A large SWE-bench campaign would also be premature before the provider path, Docker evaluator, trajectory retention, and scoring boundary work end to end.

## Decision

Add a Phase 0 `workspace-coding` experiment that reuses the existing `AgentLoop` and compares Act-only with visible bounded ReAct through one bash tool. Freeze five SWE-bench Lite development cases, three repetitions, one non-thinking DeepSeek V4 Flash configuration, the exact official runner revision, Docker images, observation policy, and official `resolved` outcome before any provider call.

Run every task in a disposable no-network, no-host-mount Docker container. Require a passing official gold-patch evaluation for each case before its model attempts. Preserve full trajectories and lossless raw command streams while giving the model bounded head-tail observations. Use no history compaction in the first version.

After Phase 0 produces Bad Cases, propose SWE-agent-style ACI changes as separately versioned treatments based on observed interface failures. Do not treat the five-case smoke as a SWE-bench Lite score.

## Alternatives

### Start directly with the full SWE-agent interface

Rejected for the first phase because loop grammar, tool ergonomics, feedback formatting, and model capability would change together. The user would learn less from the resulting trajectory.

### Use only handcrafted local tasks

Rejected as the sole validation path because deterministic microtasks are useful contract tests but do not exercise real repository setup and the official SWE-bench resolution path. They remain unit/integration fixtures below the external smoke.

### Run the full SWE-bench Lite test split

Deferred. It costs substantially more time, model budget, disk, and evaluator time while the provider and environment paths are still being validated. Five frozen development cases are enough to expose plumbing and interface failures without creating a leaderboard Claim.

### Use Kimi Code as the first provider

Deferred because the Kimi coding endpoint may include coding-agent behavior that confounds a minimal loop comparison. Kimi remains a later robustness/provider treatment after the Harness mechanism works with provider thinking disabled.

### Compact history immediately

Deferred because summarization could remove causal observations and become an uncontrolled treatment. Phase 0 bounds each observation but retains the full conversation until a concrete context failure justifies a compaction experiment.

## Consequences

- The first result is small and intentionally non-publishable as a benchmark score.
- Docker image acquisition and x86_64 emulation add setup cost on the ARM host.
- Full raw artifacts consume disk, but permit later failure analysis without exposing all output to the model.
- Act-only versus ReAct becomes interpretable because the visible thought requirement is the only intended treatment.
- Provider balance or environment failures can leave the campaign incomplete; this is retained as Evidence rather than repaired by post-hoc task substitution.
- SWE-agent-style ACI work is driven by observed Bad Cases instead of copied wholesale from the paper.

## Acceptance evidence required

An independent Regulator must reject implementation conformance unless:

1. the shipped configuration hash, dataset revision, five IDs/images, variants, repetitions, and model settings fail closed on drift;
2. Act-only rejects thought and ReAct requires bounded thought while both reuse the same `AgentLoop`;
3. only bash actions are admitted and command observations reach the next model call;
4. model-visible output is bounded while raw stdout/stderr remain byte-for-byte recoverable with hashes;
5. credentials are absent from identity material, Trace, artifacts, and provider errors;
6. every attempted case has a passing pinned-runner gold receipt first;
7. official evaluator errors remain distinct from unresolved Agent patches;
8. no five-case result is described as a SWE-bench Lite score, Verified Project Fact, or resume fact.

## Detailed design

- [`../design/react-to-swe-mvp.md`](../design/react-to-swe-mvp.md)
- [`../evidence/react-mvp-docker-gold-gate-2026-08-20.md`](../evidence/react-mvp-docker-gold-gate-2026-08-20.md)
- [`../../workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json`](../../workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json)

