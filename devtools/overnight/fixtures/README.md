# Trusted offline subprocess fixtures

- `supervisor.mjs` owns an ordinary detached group, writes receipt/completion and discards child stdout/stderr.
- `offline-guard.mjs` blocks Node network entrypoints in the fixed child processes and records attempt counters.
- `role.mjs` creates synthetic candidate commits, returns strict Handoff/Verdict fixtures, or exercises blocked/abnormal/hostile cases. Its `result.json` may deliberately contain a synthetic canary and is raw fixture material, not a public report.
- `crash-coordinator.mjs` kills the test coordinator at an injected durable boundary, preserving the real lock for explicit recovery tests.

All tracker results are SIMULATED. These are trusted local fixtures, not coding Agents, model adapters, real tracker connectors or role grants. [Operator guide](../README.md).

The crash coordinator also supports `recorded-review` and `recorded-builder` boundaries (exit 93) to exercise recovery after durable publication acknowledgment, before the next routing decision.

`live-review` (exit 94) records a completed Builder, starts the ordinary blocked Regulator fixture and exits the actual coordinator after its PID/start identity is durable. It supports the combined F4 recovery/stop/deadline regression; it never starts a real coding Agent.

#46: `codex-supervisor.mjs` is the fixed owned wrapper; `codex-fixture.mjs` is a deterministic fake CLI only, guarded by `connector-guard.mjs` during Stage A. `connector-crash.mjs` exits the real test coordinator after durable live Regulator identity. They do not start real Codex or use credentials during Stage A.

`workorder-46-contract.json` retains the exact public formal comment in its `body` field used as a pinned input for positive/negative remote-contract probes; its identity is checked against CONTRACT. It is not a replacement authority or an editable criterion.
