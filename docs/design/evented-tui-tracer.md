# Evented Python TUI tracer candidate

- Status: Working Agent candidate for WorkOrder #6; pending independent Regulator review
- Date: 2026-08-25
- Parent contract: [`agent-loop-behavioral-eval-v0.md`](agent-loop-behavioral-eval-v0.md) and accepted [ADR-0014](../adr/0014-evented-agent-loop-and-behavioral-eval.md)

## Manual entry and replay

From the repository root, run the credential-free deterministic slice with a new log path:

```bash
python3 -m workspace_agent_harness.tui --log /tmp/evented-demo.jsonl
```

Enter one non-blank Unicode task at `Task>`. The same process runs `workspace_agent_harness.evented.AgentLoop`, calls the injected `ModelGateway.exchange(...)`, admits one typed `echo` call, executes the deterministic local tool, returns its observation to Canonical History, performs the next model exchange, and admits a typed final result. The terminal trace is rendered only from the retained `run-event/v1` JSONL log. A log path is exclusive and is never overwritten. Blank input exits `2` without creating a Run or log.

Replay that exact retained projection with zero model and tool calls:

```bash
python3 -m workspace_agent_harness.tui --replay /tmp/evented-demo.jsonl
```

To exercise cancellation manually, choose a fresh log path, enter a task, then press Ctrl-C while the deterministic gateway is waiting:

```bash
python3 -m workspace_agent_harness.tui \
  --log /tmp/evented-cancel.jsonl \
  --wait-for-cancel
```

Cancellation exits `130` after retaining `control.cancel_requested` and exactly one `run.terminal(status=cancelled)` event.

## Module boundary

`workspace_agent_harness.evented.AgentLoop` owns state transitions, admission, Canonical History, limits, cancellation, tool execution, and terminal settlement. Its sole model operation is the typed `ModelGateway.exchange(PreparedModelTurn, cancel_signal)` Interface; Provider requests, credentials, transport, streaming, and wire roles are absent. `JsonlRunEventLog` owns append-only persistence, schema identity, monotonic sequence, diagnostic offset, event identity/hash linkage, causal-link validation, visibility, and the exactly-one-terminal invariant.

`workspace_agent_harness.tui` owns only manual task input, cancellation initiation, event projection, replay selection, and process exit mapping. Deleting the terminal consumer cannot change prepared turns, admitted actions, tool effects, retained log, or `RunResult`. The previously accepted root-package `workspace_agent_harness.AgentLoop` remains unchanged; migration beyond this bounded evented slice is not part of #6.

## Explicit boundary

This candidate makes no paid or Provider call. It does not implement semantic compaction (#7), Provider overflow recovery (#8), the 12-case Behavioral Eval (#9), compact/expanded/trace view switching (#10), steering, checkpoint/resume, or a project/Wiki/resume fact. Passing local tests is Builder Evidence, not independent acceptance.
