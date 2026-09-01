# DeepSeek Live Workspace TUI

Status: repaired Working Agent candidate for WorkOrder #21. The earlier smoke is retained only as a [historical observation](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md) after the Regulator rejected its authorization qualification. The latest [Human/Master override](https://github.com/pym96/workspace-agent-harness/issues/21#issuecomment-5474512300) permits direct Human-operated use and forbids any further Builder Provider call.

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
  -> admitted typed workspace Tool turn (one call or one bounded batch)
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

There is no shell tool or arbitrary command carrier. Every path is rejected before the corresponding read/write effect when it is absolute, contains traversal, resolves through a symlink, leaves the root, or targets an unsupported file type. A multi-call response is validated as one unit for unique IDs, known tools, closed arguments, workspace authority, batch/step limits, and terminal ambiguity before the first effect. Any invalid call rejects the whole batch with zero effects. A valid domain-only batch executes serially in Provider order. Writes use a same-directory temporary file plus atomic replacement, so an existing hard link is replaced rather than mutated through to an external inode.

## Context and Provider contract

The product reuses `locked_deepseek_v3_model_profile()` and explicitly configures `DeepSeekLiveTranslationAdapter` for one to eight domain ToolCalls in one Provider response. The historical #19/#20 campaign contract remains singleton by default and keeps its frozen identity. The Live TUI additionally opts into an identity-bound ToolCall-content policy: absent, empty, or textual assistant `content` may accompany an otherwise valid `finish_reason="tool_calls"` response. That text is retained only in the exact Provider response artifact; it is non-authoritative, is not converted into an action or final answer, and is not replayed into canonical tool history. A non-text value remains a protocol failure. In the Live TUI, complete and abstain remain singleton-only; mixed terminal/domain and multiple-terminal responses fail closed. A valid batch becomes one canonical assistant turn followed by one ordered tool-result message per call, so one response remains one model exchange while each call remains one tool action. The stable Chat Completions endpoint, `deepseek-v4-flash`, Thinking at high effort, omitted request-level `tool_choice`, non-empty ordinary final admission, and restricted reasoning-history replay remain unchanged.

The `SemanticContextProjector` receives the accepted 1,000,000-Token profile window and 384,000-Token profile output room. Protocol/tool overhead is derived from the canonical Live TUI system prompt and closed Provider schemas with the existing estimator. No arbitrary text truncation or new output-token ceiling is introduced. Only a typed Provider context-overflow failure can enter the accepted one-retry semantic recovery path.

Per-Run lifecycle limits are `12` tool steps, `16` model calls, and `300` seconds. A batch cannot exceed eight calls or the Run's remaining step budget. These limits bound loop work; they do not alter the accepted Provider output ceiling.

## Verification boundary

[`../../tests/test_live_tui.py`](../../tests/test_live_tui.py) uses only deterministic gateways and synthetic retained Provider-response fixtures. It covers non-authoritative textual content beside a valid ToolCall; Provider-ordered three-call execution and paired native history; whole-batch rejection for a late workspace escape; terminal/domain ambiguity; duplicate IDs and batch limits; zero effects when the remaining step budget cannot admit a batch; semantic compaction of one assistant turn plus all paired results; the real CLI entry; zero-call help/view/replay/cancel/validation behavior; fresh Context with shared workspace; overflow recovery; cancellation; display denial; path boundaries; atomic writes; and non-executing verification.

The earlier candidate produced one formal Run and one Provider exchange whose three ToolCalls exposed the first-only defect. The Regulator later found that the Run lacked the required durable issue-level pre-call authorization, so the [historical observation](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md) is not accepted Evidence. The repaired candidate used no credential, balance query, Provider call, or replacement smoke. The Human may now use it directly under the latest override; the Builder may not run it on the Human's behalf.
