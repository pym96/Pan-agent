# DeepSeek Live Workspace TUI

Status: WorkOrder #22 Working Agent repair candidate after a rejected independent Verdict ([issue #22 comment 5508347506](https://github.com/pym96/workspace-agent-harness/issues/22#issuecomment-5508347506)). Its current deterministic implementation checks pass (`65` focused Python tests, `242` full Python tests, `12` TypeScript/Pi checks, and changed-source `mypy`). Human-operated candidate attempts exposed five development defects — pending-confirmation cancellation blocking, the tight `12`-step budget, empty-reasoning rejection, the `60`-second Thinking-stall timeout, and Human-paced waits expiring the `300`-second Run clock — all repaired with deterministic coverage. The rejected Verdict then established four repair blockers, fixed in the latest commit without any new Provider or balance call: (1) the raised Run/transport limits and optional-reasoning admission are now scoped to the explicit trusted-local profile while the default-off profile restores the accepted #21 values (`12`/`16`/`300`, `60` seconds, reasoning-required); (2) the PTY confirmation renders command and cwd as escaped JSON strings so control bytes cannot forge the display; (3) cancellation is rechecked after the answer arrives, before acceptance, and before PTY spawn, closing the affirmative-answer/cancel race fail-closed; (4) the Evidence was recomputed from all 13 raw Run logs and 54 retained HTTP responses. It extends the accepted #21 Python entry from base `4ebf660b7166724e604263e6c3d60a139bf0db8b`; the earlier #21 smoke remains only a [historical observation](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md).

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

`human_interactive_pty` is distinct. The model may propose a command, but the controller prints the exact command, resolved cwd, and authority and requires a new Human `y/yes` decision. Command and cwd render as escaped JSON strings (control bytes such as ESC/CR/LF become visible text and cannot clear the screen or inject spoofed display lines). Rejection creates no child and returns a typed rejected Observation. Cancellation is fail-closed at every point: while the decision is pending, after an answer line arrives, between acceptance and the PTY-start seam, and inside the POSIX adapter before any fd, terminal mutation, or spawn — each records `human_handoff_cancelled` with the crossing phase and starts no child. Acceptance attaches `/bin/sh -c <command>` to a POSIX pseudo-terminal, forwards terminal size and raw keyboard bytes while attached, restores terminal attributes on settlement, and returns only status/exit/duration/transcript identity to model Context. Human input is never copied into the model Observation or Event Log as a separate field. The local combined PTY transcript is retained for provenance and may naturally contain application echo; it is not replayed to the model.

## Context and Provider contract

The product reuses `locked_deepseek_v3_model_profile()` and explicitly configures `DeepSeekLiveTranslationAdapter` for one to eight domain ToolCalls in one Provider response. The historical #19/#20 campaign contract remains singleton and reasoning-required by default and keeps its frozen identity. The Live TUI opts into the identity-bound admission policy that absent, empty, or textual assistant `content` may accompany an otherwise valid `finish_reason="tool_calls"` response; this text remains non-authoritative, stays only in the exact Provider response artifact, and is never converted into an action, final answer, or canonical tool history. Only the explicit trusted-local profile additionally admits absent, null, or empty-string `reasoning_content` as canonical `None` (non-empty text remains restricted reasoning replayed through the Provider carrier, and a non-text value remains a protocol failure); the default-off profile remains reasoning-required.

These policies make Provider expression permissive without making execution permissive. JSON decoding, unambiguous finish/content shape, unique call IDs, registered tool names, closed argument schemas, workspace authority, batch limits, and terminal/domain separation still run before any effect. In the Live TUI, complete and abstain remain singleton-only; mixed terminal/domain and multiple-terminal responses fail closed. A valid batch becomes one canonical assistant turn followed by one ordered tool-result message per call, so one response remains one model exchange while each call remains one tool action. The stable Chat Completions endpoint, `deepseek-v4-flash`, Thinking at high effort, omitted request-level `tool_choice`, and non-empty ordinary final admission remain unchanged.

The `SemanticContextProjector` receives the accepted 1,000,000-Token profile window and 384,000-Token profile output room. Protocol/tool overhead is derived from the selected no-shell or trusted-local system prompt and its exact closed Provider schemas with the existing estimator. No arbitrary text truncation or new output-token ceiling is introduced. Only a typed Provider context-overflow failure can enter the accepted one-retry semantic recovery path.

Per-Run lifecycle limits depend on the selected profile. The default-off profile keeps the accepted #21 values: `12` tool steps, `16` model calls, `300` seconds, a `60`-second per-call HTTP timeout, and reasoning-required admission. The explicit trusted-local profile raises them to `100` tool steps, `160` model calls, `3600` seconds, and a `240`-second per-call HTTP timeout, and admits absent/empty Provider reasoning as canonical `None`. A batch cannot exceed eight calls or the Run's remaining step budget. These limits bound loop work; they do not alter the accepted Provider output ceiling. WorkOrder #22's human-operated attempts motivated the trusted-local raises: the earlier budget terminated a legitimate multi-part trusted-local task with `step_limit`; a `60`-second per-call timeout caused a terminal `transport_unavailable` while a real exchange stalled in server-side Thinking during whole-file generation; and the `300`-second Run clock expired during a `768`-second Human confirmation wait even though every model exchange and tool call had already succeeded — Human confirmation and PTY attach time count against the Run clock. In the trusted-local profile the per-call transport ceiling and Human cancellation remain the binding inactivity guards.

## Verification boundary

[`../../tests/test_live_tui.py`](../../tests/test_live_tui.py) uses only deterministic gateways and synthetic retained Provider-response fixtures. It covers the accepted #21 behavior plus trusted-local opt-in/non-exposure, default-profile preservation of the accepted limits/transport timeout/reasoning-required admission (including fail-closed rejection of an empty-reasoning ToolCall with zero effects), trusted-local-profile raised limits and empty-reasoning admission with its next-turn replay, shell and PTY schemas, fake-model write/execute/observe/final flow, all-before-effects shell preflight, Human PTY acceptance/rejection, lifecycle causality, bounded model Observation, and replay inertness. [`../../tests/test_trusted_local.py`](../../tests/test_trusted_local.py) crosses the real host process/PTY seams without Provider calls: nonzero exit, lossless streams, secret-free child environment, `.venv`, cancellation of a pending confirmation without extra input, an affirmative-answer/cancellation race won by cancellation, post-acceptance pre-spawn cancellation with no artifact dir or adapter call, POSIX adapter pre-spawn fail-closed cancellation, escape-safe confirmation display against ANSI/CR/newline injection, timeout/cancellation process-group cleanup, terminal restoration, and a content-bound terminal `snake.py` fixture that receives `q` through a real pseudo-terminal and quits.

The earlier #21 candidate produced one formal Run and one Provider exchange whose three ToolCalls exposed the first-only defect. The Regulator later found that the Run lacked the required durable issue-level pre-call authorization, so that [historical observation](../evidence/deepseek-live-tui-smoke-candidate-2026-08-31.md) is not accepted Evidence. WorkOrder #22 supplies a new durable issue-level authorization bounded to `deepseek-v4-flash`, exact candidate bytes, at least one real trusted-local tool execution, Human-operated snake PTY interaction, all attempts retained, and CNY 2.00 total. Deterministic completion precedes that call; the result remains a development observation rather than a benchmark, model-quality, or security claim.
