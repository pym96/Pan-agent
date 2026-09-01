# TypeScript/Pi General Agent Working Stack

Status: WorkOrder #23 Working Agent candidate, pending independent Regulator review.

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
  --model deepseek-v4-flash \
  --thinking high
```

The initial profile is `deepseek-v4-flash` with `high` thinking. `deepseek-v4-pro` and the listed thinking levels are explicit alternatives; switching them does not change the session or tool Interface. Construction, `--help`, confirmation rejection, blank input, `:help`, `:context`, and `:exit` make no Provider call. The first non-empty task submitted after confirmation is the first Provider call.

Each task returns control to `Task>` and the next task continues the same Pi-owned transcript. `:context` reports the retained message count. Ctrl-C during a task requests Pi cancellation; Ctrl-C at the prompt closes the TUI.

## Trust boundary

`bash` is labelled **trusted-local**. It runs directly as the current host user. `--workspace` establishes the default cwd; it is not path containment, an OS sandbox, a Docker boundary, or a network boundary. Pi's read/write/edit tools also accept absolute paths. Use this command only against a workspace and task you trust.

The shell child receives a small allowlist of ordinary process variables and does not inherit `DEEPSEEK_API_KEY` or other ambient Provider credentials. This reduces accidental shell leakage; it does not turn trusted-local execution into a security boundary. OS isolation and policy enforcement belong to future WorkOrder #22 and are not claimed here.

## Observable contract

The TUI renders normalized events for each Run:

- Provider/model/response identity, stop reason, and Provider-reported Token usage;
- typed ToolCall name, correlation ID, arguments, ToolResult text, and error status;
- one attributable terminal: `completed`, `cancelled`, `model_error`, or `incomplete`.

Thinking blocks are retained inside Pi's model transcript but never rendered by this projection. No credential is copied into source, CLI arguments, or shell child environment. The tracer bullet does not yet persist an event log, implement replay/checkpoint, enforce a paid-call budget, compact Context, or recover from Context overflow. It performs no application-level history truncation.

## Deterministic checks

```bash
npm --prefix typescript run check
```

The test Adapter uses Pi's Faux Provider and makes no network, credential, balance, or paid-model call. It crosses the same `GeneralAgentSession` and tool seams as the real DeepSeek Adapter.
