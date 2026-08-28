# Python TUI three-view projections candidate

- Status: Working Agent candidate for WorkOrder #10; pending independent Regulator review
- Date: 2026-08-27
- Baseline: independently accepted WorkOrder #9 landing at `315ee11`
- WorkOrder: [GitHub Issue #10](https://github.com/pym96/workspace-agent-harness/issues/10)

## One pure projection seam

The terminal interface now consumes one immutable `Sequence[RunEvent]` through
`render_run_events(...)`. A caller selects `compact`, `expanded`, or `trace`;
the renderer returns text and owns no Gateway, tool, Context, evaluator, event
log, or artifact Adapter. `replay_run_event_log(...)` loads the retained JSONL
and crosses the same projection seam.

The CLI accepts a repeatable `--view` option. For example, the following renders
three views in order from the same retained events:

```bash
python3 -m workspace_agent_harness.tui \
  --replay /tmp/evented-demo.jsonl \
  --view compact \
  --view expanded \
  --view trace
```

Omitting `--view` selects `compact`. An unknown value is rejected by argument
validation before task input, Run creation, or log creation.

## View contract

| View | Includes | Deliberately excludes |
|---|---|---|
| `compact` | task, admitted tool actions, concise or content-addressed observations, compaction/recovery notices, terminal result | exchange plumbing, full payloads, Provider failure messages, usage/timing detail |
| `expanded` | permitted model, tool, Context, compaction, retry, usage, timing, response identity, cost, and failure payloads with causal and correlation IDs | restricted, secret-reference, credential, and prohibited-reasoning content |
| `trace` | ordered `run-event/v1` envelope, full event/previous/cause identities, phase, sequence, turn/exchange/candidate/tool/compaction IDs, visibility, and permitted Evidence references | the same forbidden content as every other view |

The expanded lifecycle labels are semantic, not cosmetic aliases:

- `IN_FLIGHT` means an operation has started but has not produced a candidate;
- `CANDIDATE` means a model exchange settled with a candidate that has not been admitted;
- `ADMITTED` appears only for `candidate.accepted`;
- `FAILED`, `SETTLED`, and `TERMINAL_EVENT` preserve the retained event phase.

Compact output never presents an in-flight or settled model candidate as an
executable action. Only the admitted event becomes `ACTION`.

## Visibility policy

`FieldVisibility` and `classified_event_field(...)` attach display policy to a
retained payload field without changing its retained identity.

| Classification | Compact | Expanded | Trace |
|---|---|---|---|
| `public` | value | value | value |
| `expanded` | omitted | value | value |
| `restricted` | omitted | redaction marker | redaction marker |
| `secret-ref` | omitted | redaction marker | redaction marker |
| `never-display` | omitted | redaction marker | redaction marker |

The marker exposes only the classification, never the value. Event-level
`expanded`, `restricted`, and `secret-ref` policy follows the same rule.
Credential- and reasoning-shaped field names fail closed to `never-display`
even when a producer omits a wrapper. This protection is Provider-independent.

Permitted text over 1,024 UTF-8 bytes is rendered as exact retained byte count
plus SHA-256 rather than dumped into expanded or trace output. The append-only
Event Log and any content-addressed artifact remain unchanged and recoverable;
the display reference is not a replacement truth.

## Execution invariants

View selection occurs only after an AgentLoop Run has settled or after an
existing log has been validated. Rendering one or many views therefore cannot
change prepared turns, admission, tool effects, Context policy, event bytes,
terminal result, or a Behavioral Eval verdict. Live terminal output and offline
replay call the same renderer over the same retained event sequence.

Focused tests exercise this deletion property with a real WorkOrder #9 case:
all views and replay remain identical while the tool Adapter is patched to fail
if called, and the Gateway turns, Event Log bytes, and evaluator report remain
unchanged.

## Credential-free manual proof

Choose a fresh path and enter `Record all three stages, then finish.`:

```bash
python3 -m workspace_agent_harness.tui \
  --log .runs/workorder-10-candidate/three-views.jsonl \
  --semantic-compaction-demo \
  --explain-compaction \
  --view compact \
  --view expanded \
  --view trace
```

Replay the same Run by replacing `--log` and the demo option with:

```bash
--replay .runs/workorder-10-candidate/three-views.jsonl
```

## Explicit boundary

This candidate adds terminal projections and selection only. It makes zero real
or paid Provider calls and runs no external benchmark. It does not add a
frontend, Runtime daemon, authentication, themes, session trees, subagents,
#11 live evaluation, #12–#16 persistence/recovery work, Wiki/VPF/fact/resume/PDF
promotion, a benchmark claim, or disclosure.
