# Python TUI three-view projections candidate Evidence — 2026-08-27

- Status: Working Agent candidate; pending independent WorkOrder #10 Regulator review
- Session role: Working Agent (Builder)
- Authorized baseline: clean `main @ 315ee111c43c635719fa9baa55c1c0c79b34c98d`
- WorkOrder: [GitHub Issue #10](https://github.com/pym96/workspace-agent-harness/issues/10), Agent Brief comment `5438183525`
- Paid or real Provider calls: `0`
- External benchmark or campaign calls: `0`
- Wiki, VPF, fact, resume, or PDF promotion: none

## Candidate interfaces

- Pure projection: `render_run_events(events, view=compact|expanded|trace)`
- Offline projection: `replay_run_event_log(path, view=...)`
- CLI selection: repeatable `--view compact|expanded|trace`
- Field policy: `FieldVisibility` plus `classified_event_field(...)`

All projections consume the same validated `run-event/v1` sequence. No view
owns a lifecycle transition or constructs a Gateway, tool, Context projector,
evaluator, persistence Adapter, or alternate transcript.

## Retained local Evidence

Ignored artifact root:

```text
.runs/workorder-10-candidate/
```

- `three-views.jsonl`: 42 ordered events, terminal `completed`, SHA-256 `682cca85d46b1fd07fd145689eee9970cbb748cb76507d56c4efb2691f02709c`;
- compact projection with compaction explanation: SHA-256 `45b374539555ac04929a30ecd1b8b58a9df07e1ccd883584236664fc12e8ffe9`;
- expanded projection with compaction explanation: SHA-256 `7f02d571dd4fe97325c90de6921f2e986dad1ad81ff838528ef91119fe05b747`;
- trace projection: SHA-256 `3962e59334298540a65698a1d770bb3755fc531f21560b0f6adb421616ac06e2`;
- exact 33,017-byte tool artifact: SHA-256 `1713632029f7a85a72ada8a4051cef0748a87fb9ab063455bebc55c3e46988bc`.

The long body appears in the views only as retained byte count and content
identity. The original body remains in both the Event Log and content-addressed
artifact; projection does not truncate or rewrite either source.

## Contract and negative coverage

The focused tests establish:

- compact, expanded, and trace views over one canonical sequence;
- explicit `IN_FLIGHT`, `CANDIDATE`, and `ADMITTED` separation;
- permitted model/tool/Context/compaction/retry/usage/timing/failure detail with stable causal IDs;
- public/expanded/restricted/secret-ref/never-display filtering in pure rendering and PTY replay;
- credential- and reasoning-shaped payload denial in every view;
- bounded content-addressed rendering of long visible text;
- repeated PTY view switching and byte-equal live/replay projection content;
- malformed view rejection before Run/log creation;
- Unicode, blank input, cancellation and exit `130`, proactive compaction, overflow retry success/exhaustion, failure terminal, and offline replay regression behavior;
- unchanged Gateway prepared turns, tool-call boundary, Event Log bytes, terminal result, and WorkOrder #9 evaluator verdict during view rendering and replay.

## Verification checkpoint

```text
python3 -m unittest tests.test_tui_views tests.test_evented_tui -v
13 tests: PASS

python3 -m unittest discover -s tests -p 'test_*.py'
143 tests: PASS

python3 -m unittest tests.test_package_identity -v
1 test: PASS

python3 -m compileall -q workspace_agent_harness tests
PASS

local Markdown link/path check
PASS

git diff --check
PASS

bash 80-监管与验收/自动检查/run_acceptance.sh
PASS (host 77/77; project 143/143)
```

Passing Builder checks does not grant independent acceptance.

## Boundary

This Evidence supports only the deterministic offline Python TUI projection
machinery. It is not a real-model result, benchmark score, production security
claim, project fact, resume fact, or authorization for #11–#16.
