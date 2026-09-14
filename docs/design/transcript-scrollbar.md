# Draggable conversation scrollbar | WorkOrder #60

Status: Builder candidate, pending independent Regulator review. [Activation](https://github.com/pym96/Pan-agent/issues/60#issuecomment-5658626204) freezes Criteria-Version 1.0, C-SBAR-01…06, on accepted base `6dc0efe7b605cf54d626091c2c790bb1b88c219d` (#62 landed).

## Design

TUI-local change driven entirely by the #62 rendered-row viewport (cached `contentRows`, source anchors, follow/detach state) — never by raw entry or tool-event counts:

- **Frozen geometry** ([`scrollbar.ts`](../../typescript/src/tui/scrollbar.ts)): pure `scrollbarGeometry(N, V, top)` / `scrollbarDragTop(N, V, y)` implement the frozen formulas verbatim: `maxTop = max(0, N-V)`; blank track and no thumb when `maxTop = 0`; `thumbSize = clamp(ceil(V×V/N), 1, T)`; `thumbStart = clamp(round((T-thumbSize)×top/maxTop), 0, T-thumbSize)`; drag mapping `thumbStart = clamp(p - floor(thumbSize/2), 0, T-thumbSize)`, `top = round(thumbStart×maxTop/(T-thumbSize))` with `top = 0` when `T = thumbSize`. `Math.round` is half-away-from-zero.
- **Reserved final column** ([`daily-workspace.ts`](../../typescript/src/tui/daily-workspace.ts)): at every supported viewport (`columns ≥ 40`, `rows ≥ 12`) all rows are clipped to `columns - 1`; transcript content wraps at `columns - 3` (the `│ ` prefix plus the reserved column), so the layout width never depends on whether overflow exists. The track occupies exactly the body rows, 1-based terminal `y = 2…bodyHeight+1`: `█` for thumb rows, `│` otherwise, painted at the final column after content is padded to `columns - 1` cells (`clipCells` adds one grapheme pass, not two).
- **Drag state**: a participating press (`x = columns`, `y` inside the track, transcript visible and overflowing) starts the drag and positions; matching drags and the matching release reposition by the frozen mapping; any release report and any Ctrl-G/C key clears the drag state. A target at `maxTop` restores `follow` and clears `newOutput`; any other detached position keeps the #62 source anchor. Blank track, modal overlay, out-of-track coordinates, missing press, and unmatched button/terminator frames are inert for scroll state, draft and execution.
- **Framing grammar** ([`framed-input.ts`](../../typescript/src/tui/framed-input.ts)): extended solely by three frozen SGR reports — press `\x1b[<0;x;yM`, drag `\x1b[<32;x;yM`, release `\x1b[<3;x;ym` (1–6 digit coordinates, the existing 4096-byte frame ceiling and drop/quarantine rules unchanged). Every other button/terminator/shape remains unmatched and emits nothing; #47 framing behavior (paste, control strings, SS3, Ctrl-G drain, BEL/Ctrl-C/Ctrl-D physical commands) is untouched. Startup additionally requests DECSET 1002 (button-event motion) so terminals report drags; 1000/1006 and teardown ordering are unchanged.

### Interpretation notes for the Regulator

Two frozen sentences required a documented reading:

1. **Wheel during an active drag.** C-SBAR-01 requires wheel/PageUp/PageDown/Ctrl-End to "remain behaviorally identical to #62" unconditionally, while C-SBAR-02 lists wheel among variant probes. Reading chosen: non-participating mouse reports never drive the *scrollbar* (no formula repositioning, no draft/execution effects), while wheel retains its #62 scroll behavior at all times and does not alter drag state. The alternative reading (wheel suspended during a drag) would contradict the unconditional C-SBAR-01 wording and would dead-end navigation on terminals whose release encoding differs from the frozen one.
2. **Release encoding.** The frozen primary release is exactly SGR `button=3` with the `m` terminator. Terminals that report primary release with a different button code (for example `button=0` with `m`) produce no participating report: the drag remains active, press/drag positioning and all keyboard/wheel navigation keep working, and Ctrl-G/C ends the drag. This is the declared supported-terminal limitation, disclosed rather than generalized.

## Verification assets

- [`scrollbar.test.ts`](../../typescript/test/scrollbar.test.ts): C-SBAR-01 literal formula table plus a wider grid cross-checked against an independently restated oracle, rendered-frame track/column assertions at 120×40/80×24/40×12, no-overflow blank track, #62 navigation identity; C-SBAR-02 drag mapping at head/middle/tail, follow/newOutput restoration, out-of-track/blank-track/overlay inertness, release/Ctrl-G/Ctrl-C drag termination, draft/caret preservation and zero execution counters; C-SBAR-03 split-invariance at every byte position, button/terminator/coordinate variants, malformed/oversized quarantine, OSC/DCS/SS3/paste containment, hostile-text escaping on painted frames; C-SBAR-04 real multi-tool Faux run with sealed-archive byte/record identity across wheel+drag+resize, zero-effect replay, and the #62 timing harness bounds extended over drags (p95 ≤ 50 ms, zero post-warm-up rebuilds, visits ≤ 2×bodyHeight+8).
- [`verify_scrollbar_pty.py`](../../scripts/verify_scrollbar_pty.py) with [`scrollbar-pty-driver.mjs`](../../scripts/fixtures/scrollbar/scrollbar-pty-driver.mjs): installed-package 120×40 PTY run with the 800-line streamed transcript; blank track before overflow; wheel detach; press-to-head; drag to middle/bottom; no-motion press+release positioning; 80×24/40×12/120×40 detached resize preserving the anchored source line; Ctrl-End; screen reconstruction of the final-column track; per-event timing samples; rebuild/visit counters; zero guard meters.
- [`demo_scrollbar.mjs`](../../scripts/demo_scrollbar.mjs): the same installed demo for the Human trial (C-SBAR-05).
- [`check_workorder_60_scope.py`](../../scripts/check_workorder_60_scope.py): exact inventory, byte-identical protection, 141 prior + 11 added obligations, TUI-local diff assertion.

## Results (candidate measurements)

Recorded at Handoff in [`/private/tmp/wo60-evidence`](file:///private/tmp/wo60-evidence) (suite logs, scope output, PTY proof, demo bundle, `evidence-sha256.txt`). Headline candidate numbers: C-SBAR-04 harness p95 and the installed PTY per-event samples are reported there as raw data; both are algorithmic layout gates on Node 22.19.0 in this harness, not universal terminal-emulator latency claims.

## Criterion map

| Criterion | Evidence |
|---|---|
| C-SBAR-01 | scrollbar.test.ts formula table + rendered-frame assertions; resize/anchor matrix |
| C-SBAR-02 | scrollbar.test.ts drag/inert/cancellation integration tests through the real parser |
| C-SBAR-03 | scrollbar.test.ts split/variant/quarantine/escaping probes; independent Regulator adversarial probes plus Human capture review still required (high-risk GateLevel) |
| C-SBAR-04 | scrollbar.test.ts archive/replay invariance + #62 bounds; verify_scroll_pty.py rerun on the same installed candidate |
| C-SBAR-05 | verify_scrollbar_pty.py + PTY capture/summary; Human trial record |
| C-SBAR-06 | scope audit, full Product/conformance/Reference/Python suites, host outer gate, `git diff --check` |

## Honest limits

macOS + Node 22.19.0. The track assumes SGR mouse reporting (1006) and requests button-motion reporting (1002); terminals without drag-motion reports still position on press (click-to-jump) and all #62 wheel/keyboard navigation is unaffected. The release report recognized is the frozen `button=3`/`m` encoding only; other release encodings leave the drag active until Ctrl-G/C without harming navigation. Overlay (modal preview) surfaces paint no track and ignore track reports. Drag/scroll interactions never rebuild the #62 layout cache; streaming growth still re-wraps the actively changing entry (unchanged #62 semantics). #61 tool-activity information design is untouched.
