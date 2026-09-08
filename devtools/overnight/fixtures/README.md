# Trusted offline subprocess fixtures

- `supervisor.mjs` owns an ordinary detached group, writes receipt/completion and discards child stdout/stderr.
- `offline-guard.mjs` blocks Node network entrypoints in the fixed child processes and records attempt counters.
- `role.mjs` creates synthetic candidate commits, returns strict Handoff/Verdict fixtures, or exercises blocked/abnormal/hostile cases. Its `result.json` may deliberately contain a synthetic canary and is raw fixture material, not a public report.
- `crash-coordinator.mjs` kills the test coordinator at an injected durable boundary, preserving the real lock for explicit recovery tests.

All tracker results are SIMULATED. These are trusted local fixtures, not coding Agents, model adapters, real tracker connectors or role grants. [Operator guide](../README.md).
