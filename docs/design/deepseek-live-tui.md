# DeepSeek Live Workspace TUI

Status: Working Agent candidate for WorkOrder #21; the one authorized smoke is retained as [candidate Evidence](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md), pending independent Regulator review.

## Product slice

The Live TUI turns the accepted evented Runtime into a reusable Human-driven workspace session. The terminal owns task input, view selection, replay, and presentation of already committed events. Every submitted non-empty task creates a fresh `AgentLoop`, `Run`, Canonical Context, append-only Event Log, DeepSeek v3 `ModelGateway`, and terminal result. The selected workspace persists across Runs; model conversation does not.

This is not an evaluation campaign. It contains no matrix scheduler, treatment comparison, task replacement, automatic rerun, cross-Run chat memory, shell, subagent, checkpoint, or fact-promotion path.

## Launch contract

From the repository root, choose an existing workspace and a new artifact path outside that workspace:

```bash
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
PYTHONPATH=. python3 -m workspace_agent_harness.tui \
  --live-deepseek \
  --workspace /absolute/path/to/workspace \
  --session-root /absolute/new/path/to/live-session
```

The command first prints the resolved `DeepSeek` / `deepseek-v4-flash` identity, resolved workspace, new session-artifact root, and tool boundary. It then requires `Confirm live provider/workspace [y/N]>`. Help, rejection of that confirmation, invalid arguments, an empty task, view changes, Run listing, and replay do not construct a Run or make an external call. `DEEPSEEK_API_KEY` is first read when a non-empty task is submitted.

Interactive commands are:

- `:help` — show the live boundary and command summary;
- `:view compact|expanded|trace` — select the pure Event Log projection used after a Run or during replay;
- `:runs` — list Runs created in this process;
- `:replay RUN_ID` — render one retained prior Run with no Provider or tool effects;
- `:exit` — close the session.

Ctrl-C during an active Run requests cancellation through the existing `AgentLoop` signal and waits for an attributable terminal event. A second Ctrl-C requests session closure after terminal settlement. Ctrl-C at an input prompt closes without creating a Run or fabricating success.

## Execution and observation seams

```text
Human task
  -> LiveTuiSession admission
  -> fresh AgentLoop.run(Task, RunLimits)
  -> SemanticContextProjector
  -> DeepSeek v3 Translation -> ModelGateway.exchange
  -> admitted typed workspace Tool
  -> append-only Run Event Log -> terminal result

read-only polling
  Run Event Log -> public progress projection / compact|expanded|trace / replay
```

`LiveTuiSession` does not implement model/tool transitions. Active progress polls events that the loop already committed; it never receives hidden reasoning, credentials, or an executable candidate. Removing the progress consumer does not change the prepared-turn identity, tool effect, terminal classification, or retained event sequence in deterministic tests.

Each Run retains:

- `runs/<run-id>/events.jsonl` — canonical append-only Event Log;
- `runs/<run-id>/provider-exchanges/` — secret-free exact request/response artifacts; raw Provider reasoning stays here and is not rendered;
- `runs/<run-id>/context-artifacts/` — exact large tool results externalized by the accepted semantic projector;
- `runs/<run-id>/summary.json` — Run ID, terminal class, model/tool counts, reported usage coverage, artifact locator, and changed workspace paths. Cost remains explicitly `unreported` unless a later accepted source supplies it.

## Workspace authority

The resolved workspace is the sole model-writable filesystem boundary. Session artifacts must be disjoint from it. The Live TUI installs four closed-schema typed tools through the existing `EventTool` / `ActionTool` seam:

| Tool | Effect | Boundary |
|---|---|---|
| `inspect_workspace` | list one directory | maximum 500 entries; symlinks are marked blocked and never followed |
| `read_file` | read one UTF-8 regular file | workspace-relative, no traversal/symlink, maximum 262,144 bytes |
| `write_file` | atomic replacement of one complete UTF-8 file | existing in-workspace parent, no traversal/symlink, maximum 262,144 bytes |
| `verify_workspace` | parse Python or JSON syntax | fixed `python-syntax` / `json-syntax` enum; workspace code is never executed |

There is no shell tool or arbitrary command carrier. Every path is rejected before the corresponding read/write effect when it is absolute, contains traversal, resolves through a symlink, leaves the root, or targets an unsupported file type. Writes use a same-directory temporary file plus atomic replacement, so an existing hard link is replaced rather than mutated through to an external inode.

## Context and Provider contract

The product reuses `locked_deepseek_v3_model_profile()` and `DeepSeekLiveTranslationAdapter`: stable Chat Completions endpoint, `deepseek-v4-flash`, Thinking enabled at high effort, request-level `tool_choice` omitted, one typed tool call or non-empty ordinary final admitted, and full assistant reasoning replay only inside restricted Provider history.

The `SemanticContextProjector` receives the accepted 1,000,000-Token profile window and 384,000-Token profile output room. Protocol/tool overhead is derived from the canonical Live TUI system prompt and closed Provider schemas with the existing estimator. No arbitrary text truncation or new output-token ceiling is introduced. Only a typed Provider context-overflow failure can enter the accepted one-retry semantic recovery path.

Per-Run lifecycle limits are `12` tool steps, `16` model calls, and `300` seconds. They bound loop work; they do not alter the accepted Provider output ceiling.

## Verification boundary

[`../../tests/test_live_tui.py`](../../tests/test_live_tui.py) uses only deterministic gateways and retained fake Provider responses. It covers the real CLI entry, zero-call help/view/replay/cancel/validation behavior, multiple Runs with fresh Context and shared workspace, the actual DeepSeek v3 Translation/Gateway seam, native tool-result replay, semantic overflow recovery, terminal failure return, cancellation, restricted-reasoning display denial, observer removal, traversal, absolute paths, symlink escape, malformed and unknown tools, atomic writes, and non-executing verification.

The WorkOrder's one real smoke is a separate release observation. After private Human maximum-spend authorization, it produced one formal Run and one Provider exchange. The Provider returned three parallel ToolCalls; the single-action admission contract rejected the response before any tool effect, so the exact-file oracle failed. The [candidate Evidence](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md) retains that result without prompt repair, task replacement, or rerun. It is not a benchmark, persistent Provider property, Verified Project Fact, Wiki fact, or resume claim, and it authorizes no further live call.
