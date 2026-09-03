# TypeScript/Pi General Agent Working Stack

Status: WorkOrder #23 tracer bullet, independently accepted and landed at `4ebf660`. WorkOrder #25's candidate adds the three-lane memory contract (ADR-0015), pending independent review.

This is the active TypeScript/Pi tracer bullet for a Human-operated general coding agent. One `GeneralAgentSession` owns Pi's stateful `Agent`, DeepSeek Provider translation, complete in-memory Context, typed read/write/edit/bash ToolCalls and ToolResults, cancellation, usage, response identity, and explicit terminal outcomes. The existing Python implementation remains available as an accepted reference path; this package does not delete or port it.

## Install

From the repository root, install the exact dependency graph in `package-lock.json` without package lifecycle scripts:

```bash
npm --prefix typescript ci --ignore-scripts
```

The direct Pi dependencies are pinned to `@earendil-works/pi-agent-core@0.84.4` and `@earendil-works/pi-ai@0.84.4`. The lockfile pins every transitive package and registry integrity value.

## Run the TUI

Choose an existing directory deliberately. It may be an actual project checkout or a disposable test workspace.

```bash
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
npm --prefix typescript run agent -- \
  --workspace /absolute/path/to/workspace \
  --memory-root /absolute/path/to/memory \
  --model deepseek-v4-flash \
  --thinking high
```

The initial profile is `deepseek-v4-flash` with `high` thinking. `deepseek-v4-pro` and the listed thinking levels are explicit alternatives; switching them does not change the session or tool Interface. `--memory-root` is required and must be disjoint from the workspace; it holds the durable three-lane memory (below). Construction, `--help`, confirmation rejection, blank input, `:help`, `:context`, `:runs`, `:replay RUN_ID`, and `:exit` make no Provider call. The first non-empty task submitted after confirmation is the first Provider call.

Each task returns control to `Task>` and the next task continues the same Pi-owned transcript. `:context` reports the retained message count. Ctrl-C during a task requests Pi cancellation; Ctrl-C at the prompt closes the TUI.

## Trust boundary

`bash` is labelled **trusted-local**. It runs directly as the current host user. `--workspace` establishes the default cwd; it is not path containment, an OS sandbox, a Docker boundary, or a network boundary. Pi's read/write/edit tools also accept absolute paths. Use this command only against a workspace and task you trust.

The shell child receives a small allowlist of ordinary process variables and does not inherit `DEEPSEEK_API_KEY` or other ambient Provider credentials. This reduces accidental shell leakage; it does not turn trusted-local execution into a security boundary. OS isolation and policy enforcement belong to future WorkOrder #22 and are not claimed here.

## Observable contract

The TUI renders normalized events for each Run:

- Provider/model/response identity, stop reason, and Provider-reported Token usage;
- typed ToolCall name, correlation ID, arguments, ToolResult text, and error status;
- one attributable terminal: `completed`, `cancelled`, `model_error`, or `incomplete`.

Thinking blocks are retained inside Pi's model transcript but never rendered by this projection. No credential is copied into source, CLI arguments, shell child environment, or Run Archive bytes. The stack does not yet implement checkpoint/resume across processes, enforce a paid-call budget, compact Context, or recover from Context overflow. It performs no application-level history truncation.

## Three-lane memory (WorkOrder #25 candidate)

Every admitted run is archived before any Provider exchange or tool effect: one append-only hash-chained `events.jsonl` per run under `<memory-root>/runs/<run-id>/`, sealed at settlement (`terminal | cancelled | failed`), or settled as `interrupted` by recovery after a process crash, with disclosed torn-tail byte counts and no identity reuse. Sealed archives refuse every application-owned write interface and verify integrity byte-exactly; there is no overwrite or delete interface. `:runs` lists sealed archives and `:replay RUN_ID` renders one with zero Provider calls and zero tool effects.

The Retrospective Ledger (`<memory-root>/retrospective-ledger.jsonl`) holds append-only post-run conclusions and corrections; every entry references a sealed archive identity plus its sealed head hash, and a correction is a new entry with an explicit `supersedes` reference. Entries are not raw trajectory and never auto-promote to project facts.

The Runbook ([`RUNBOOK.md`](RUNBOOK.md)) is the current operating guidance, edited and reverted through ordinary version control. Each run resolves the Runbook snapshot at its creation and binds the content-hash revision into its archive and the model-visible prompt, so later edits never rewrite an old run's meaning. This is an application-level memory contract, not filesystem immutability or OS isolation.

## Deterministic checks

```bash
npm --prefix typescript run check
```

The test Adapter uses Pi's Faux Provider and makes no network, credential, balance, or paid-model call. It crosses the same `GeneralAgentSession` and tool seams as the real DeepSeek Adapter.
