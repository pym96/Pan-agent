# DeepSeek Live Workspace TUI

Status: WorkOrder #22 Working Agent candidate. Its repaired deterministic implementation checks pass (`48` focused Python tests, `233` full Python tests, `12` TypeScript/Pi checks, and changed-source `mypy`). The first Human-operated candidate smoke reached shell and PTY completion, then a later Run exposed cancellation blocked on a second pending handoff confirmation; the repair has its own red/green deterministic test and requires a new exact-candidate smoke before independent high-risk Regulator review. It extends the accepted #21 Python entry from base `4ebf660b7166724e604263e6c3d60a139bf0db8b`; the earlier #21 smoke remains only a [historical observation](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md).

## Product slice

The Live TUI turns the accepted evented Runtime into a reusable Human-driven workspace session. The terminal owns task input, view selection, replay, and presentation of already committed events. Every submitted non-empty task creates a fresh `AgentLoop`, `Run`, Canonical Context, append-only Event Log, DeepSeek v3 `ModelGateway`, and terminal result. The selected workspace persists across Runs; model conversation does not.

This is not an evaluation campaign. It contains no matrix scheduler, treatment comparison, automatic rerun, cross-Run chat memory, subagent, checkpoint, OS sandbox, or fact-promotion path. The default remains the accepted bounded no-shell profile. WorkOrder #22 adds a separate explicit trusted-local profile for behavioral prototyping; it makes no filesystem, network, privilege, or adversarial-task isolation claim.

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

To opt in to host-user command execution and Human-owned PTY handoff, add exactly one startup option:

```bash
PYTHONPATH=. python3 -m workspace_agent_harness.tui \
  --live-deepseek \
  --trusted-local \
  --workspace /absolute/path/to/workspace \
  --session-root /absolute/new/path/to/live-session
```

The trusted-local banner states that commands run with the current host user's authority and that workspace cwd is not containment, an OS sandbox, or a network boundary. Its confirmation expands to `Confirm live provider/workspace/trusted-local authority [y/N]>`. Without `--trusted-local`, neither trusted-local tool is installed in the AgentLoop or sent in the Provider schema, and the #21 behavior is unchanged.

The separate TypeScript/Pi real TUI remains directly runnable and is not migrated by #22:

```bash
npm --prefix typescript run agent -- \
  --workspace /absolute/path/to/workspace \
  --model deepseek-v4-flash \
  --thinking high
```

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

opt-in trusted-local only
  admitted shell -> host process group -> bounded Observation + lossless stream identities
  admitted PTY proposal -> exact command/cwd -> Human confirmation
    -> terminal ownership transfer -> typed settlement -> model Observation
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

In the default profile there is no shell tool or arbitrary command carrier. Every path is rejected before the corresponding read/write effect when it is absolute, contains traversal, resolves through a symlink, leaves the root, or targets an unsupported file type. A multi-call response is validated as one unit for unique IDs, known tools, closed arguments, workspace authority, batch/step limits, and terminal ambiguity before the first effect. Any invalid call rejects the whole batch with zero effects. A valid domain-only batch executes serially in Provider order. Writes use a same-directory temporary file plus atomic replacement, so an existing hard link is replaced rather than mutated through to an external inode.

### Opt-in trusted-local tools

The trusted-local profile adds two closed-schema tools. Both accept a required `command` and an optional integer `timeout_seconds` from `1` through `120`; the default is `30` seconds. Commands execute through `/bin/sh -c` with the selected workspace as cwd and a small ordinary-variable environment allowlist. `DEEPSEEK_API_KEY` and other ambient Provider credentials are not inherited. This is an accidental-disclosure reduction, not protection against a trusted command reading host files or contacting the network.

`trusted_local_shell` is non-interactive. It starts a new process group, treats nonzero exit as a typed Observation, checks cancellation while running, and escalates group termination from `SIGTERM` to `SIGKILL`. Model-visible stdout/stderr use bounded head-tail previews plus byte count and SHA-256; lossless streams remain under `runs/<run-id>/tool-artifacts/shell/` and their relative locators/identities remain in lifecycle events. Shell state does not persist between calls; a single command may create and use workspace-local state such as `.venv`.

`human_interactive_pty` is distinct. The model may propose a command, but the controller prints the exact command, resolved cwd, and authority and requires a new Human `y/yes` decision. Rejection creates no child and returns a typed rejected Observation. Cancellation while that decision is still pending interrupts the confirmation wait, records `human_handoff_cancelled`, and likewise starts no child. Acceptance attaches `/bin/sh -c <command>` to a POSIX pseudo-terminal, forwards terminal size and raw keyboard bytes while attached, restores terminal attributes on settlement, and returns only status/exit/duration/transcript identity to model Context. Human input is never copied into the model Observation or Event Log as a separate field. The local combined PTY transcript is retained for provenance and may naturally contain application echo; it is not replayed to the model.

## Context and Provider contract

The product reuses `locked_deepseek_v3_model_profile()` and explicitly configures `DeepSeekLiveTranslationAdapter` for one to eight domain ToolCalls in one Provider response. The historical #19/#20 campaign contract remains singleton by default and keeps its frozen identity. The Live TUI additionally opts into an identity-bound ToolCall-content policy: absent, empty, or textual assistant `content` may accompany an otherwise valid `finish_reason="tool_calls"` response. That text is retained only in the exact Provider response artifact; it is non-authoritative, is not converted into an action or final answer, and is not replayed into canonical tool history. A non-text value remains a protocol failure. In the Live TUI, complete and abstain remain singleton-only; mixed terminal/domain and multiple-terminal responses fail closed. A valid batch becomes one canonical assistant turn followed by one ordered tool-result message per call, so one response remains one model exchange while each call remains one tool action. The stable Chat Completions endpoint, `deepseek-v4-flash`, Thinking at high effort, omitted request-level `tool_choice`, non-empty ordinary final admission, and restricted reasoning-history replay remain unchanged.

The `SemanticContextProjector` receives the accepted 1,000,000-Token profile window and 384,000-Token profile output room. Protocol/tool overhead is derived from the selected no-shell or trusted-local system prompt and its exact closed Provider schemas with the existing estimator. No arbitrary text truncation or new output-token ceiling is introduced. Only a typed Provider context-overflow failure can enter the accepted one-retry semantic recovery path.

Per-Run lifecycle limits are `12` tool steps, `16` model calls, and `300` seconds. A batch cannot exceed eight calls or the Run's remaining step budget. These limits bound loop work; they do not alter the accepted Provider output ceiling.

## Verification boundary

[`../../tests/test_live_tui.py`](../../tests/test_live_tui.py) uses only deterministic gateways and synthetic retained Provider-response fixtures. It covers the accepted #21 behavior plus trusted-local opt-in/non-exposure, shell and PTY schemas, fake-model write/execute/observe/final flow, all-before-effects shell preflight, Human PTY acceptance/rejection, lifecycle causality, bounded model Observation, and replay inertness. [`../../tests/test_trusted_local.py`](../../tests/test_trusted_local.py) crosses the real host process/PTY seams without Provider calls: nonzero exit, lossless streams, secret-free child environment, `.venv`, cancellation of a pending confirmation without extra input, timeout/cancellation process-group cleanup, terminal restoration, and a content-bound terminal `snake.py` fixture that receives `q` through a real pseudo-terminal and quits.

The earlier #21 candidate produced one formal Run and one Provider exchange whose three ToolCalls exposed the first-only defect. The Regulator later found that the Run lacked the required durable issue-level pre-call authorization, so that [historical observation](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md) is not accepted Evidence. WorkOrder #22 supplies a new durable issue-level authorization bounded to `deepseek-v4-flash`, exact candidate bytes, at least one real trusted-local tool execution, Human-operated snake PTY interaction, all attempts retained, and CNY 2.00 total. Deterministic completion precedes that call; the result remains a development observation rather than a benchmark, model-quality, or security claim.
