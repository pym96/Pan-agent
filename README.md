# Autonomous Research Harness

Autonomous Research Harness is a single-user, local-first system for running long-lived research agents safely and evaluating their work reproducibly.

The project is built around one claim: an autonomous research system is useful only when every attempt is bounded, recoverable, auditable, and evaluated by controls the agent cannot rewrite.

## Product shape

- **Harness Core** — model-independent loop, budgets, event log, checkpoints, recovery, and metrics.
- **Coding Benchmark** — the first, cheaply verifiable environment used to harden the Harness.
- **Research Adapter** — the boundary through which a real research workspace exposes allowed files and fixed commands.
- **AutoGeoResearch** — the first intended real research application; its exact baseline, dataset, and evaluator remain provisional.
- **TUI/CLI** — an operator view over the same headless runtime, not a second runtime.

## v1 reliability targets

- 100% Auditable Attempt Rate, including crashes, OOMs, timeouts, and policy violations.
- At least 80% Valid Experiment Rate across the acceptance campaign.
- One bounded eight-hour Unattended Research Run with no human edits, restarts, or answers.
- Improvement Rate is reported honestly but has no required minimum.

The detailed v1 specification is tracked in GitHub Issues. Domain terms live in [CONTEXT.md](CONTEXT.md), and accepted architectural decisions live in [docs/adr](docs/adr).

## Status

Planning and repository initialization. Implementation has not started.
