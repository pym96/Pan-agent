# Draggable conversation scrollbar | WorkOrder #60

Status: Builder candidate, pending independent Regulator and Human review. [Criteria-Version 1.1](https://github.com/pym96/Pan-agent/issues/60#issuecomment-5663371121) prospectively repairs pointer capture/release compatibility on a new descendant of the retained 1.0 candidate `ab75ab0e3fa5f607b16e6f96c86551d36642f1a2`. The [1.0 activation](https://github.com/pym96/Pan-agent/issues/60#issuecomment-5658626204), Handoffs #1/#2, negative Apple Terminal trial, and evidence bundle `/Volumes/WD_BLACK/pan-agent/wo60-ab75ab0e3fa5/wo60-evidence-20260914.tar.gz` (SHA-256 `3f0c6949fd5ed8803894094d995c0b9cd3daa338d9540b3dec1b18c7ab65230d`) remain immutable historical inputs; they are not relabeled as 1.1 evidence.

## Design

TUI-local change driven entirely by the #62 rendered-row viewport (cached `contentRows`, source anchors, follow/detach state) — never by raw entry or tool-event counts:

- **Frozen geometry** ([`scrollbar.ts`](../../typescript/src/tui/scrollbar.ts)): pure `scrollbarGeometry(N, V, top)` / `scrollbarDragTop(N, V, y)` implement the frozen formulas verbatim: `maxTop = max(0, N-V)`; blank track and no thumb when `maxTop = 0`; `thumbSize = clamp(ceil(V×V/N), 1, T)`; `thumbStart = clamp(round((T-thumbSize)×top/maxTop), 0, T-thumbSize)`; drag mapping `thumbStart = clamp(p - floor(thumbSize/2), 0, T-thumbSize)`, `top = round(thumbStart×maxTop/(T-thumbSize))` with `top = 0` when `T = thumbSize`. `Math.round` is half-away-from-zero.
- **Reserved final column** ([`daily-workspace.ts`](../../typescript/src/tui/daily-workspace.ts)): at every supported viewport (`columns ≥ 40`, `rows ≥ 12`) all rows are clipped to `columns - 1`; transcript content wraps at `columns - 3` (the `│ ` prefix plus the reserved column), so the layout width never depends on whether overflow exists. The track occupies exactly the body rows, 1-based terminal `y = 2…bodyHeight+1`: `█` for thumb rows, `│` otherwise, painted at the final column after content is padded to `columns - 1` cells (`clipCells` adds one grapheme pass, not two).
- **Captured drag state (1.1)**: only an initial press at `x = columns` and inside the visible track begins capture. A press inside the thumb records `grabOffset = p - thumbStart` and does not jump; elsewhere it uses the frozen centered mapping and records `floor(thumbSize/2)`. While captured, drag reports accept any `x`, clamp `y` to the track, and map with the grab offset; horizontal pointer drift therefore cannot freeze the thumb. `3/m` and `0/m` primary releases both clear capture without repositioning. Ctrl-G/C, dispose, unsupported viewports and new runs also clear it. Wheel/keys retain #62 behavior. Blank track, overlays, uncaptured drags/releases and all other frames are inert for scroll state, draft and execution.
- **Framing grammar** ([`framed-input.ts`](../../typescript/src/tui/framed-input.ts)): exactly four declared SGR forms — press `\x1b[<0;x;yM`, drag `\x1b[<32;x;yM`, release `\x1b[<3;x;ym` or `\x1b[<0;x;ym` (1–6 digit coordinates, the existing 4096-byte frame ceiling and drop/quarantine rules unchanged). Every other button/terminator/shape remains unmatched and emits nothing; #47 framing behavior (paste, control strings, SS3, Ctrl-G drain, BEL/Ctrl-C/Ctrl-D physical commands) is untouched. Startup additionally requests DECSET 1002 (button-event motion) so terminals report drags; 1000/1006 and teardown ordering are unchanged.

### 1.1 compatibility boundary

Wheel/PageUp/PageDown/Ctrl-End retain #62 behavior even while captured. The product handles terminal-cell (not pixel) positions, so dragging remains one body-row granular. A terminal without button-motion reports still supports press-to-position plus normal wheel/keyboard navigation; capture motion is not promised there.

## Verification assets

- [`scrollbar.test.ts`](../../typescript/test/scrollbar.test.ts): C-SBAR-01 frozen geometry; C-SBAR-02@1.1 in-thumb/no-jump, captured horizontal drift, y clamp, both releases and cancellation; C-SBAR-03@1.1 byte-split invariance of all four forms plus negative grammar/quarantine/escaping probes; C-SBAR-04 unchanged archive/replay and #62 performance invariants.
- [`verify_scrollbar_pty.py`](../../scripts/verify_scrollbar_pty.py) with [`scrollbar-pty-driver.mjs`](../../scripts/fixtures/scrollbar/scrollbar-pty-driver.mjs): installed-package 120×40 PTY run with the 800-line streamed transcript; blank track before overflow; wheel detach; press-to-head; drag to middle/bottom; no-motion press+release positioning; 80×24/40×12/120×40 detached resize preserving the anchored source line; Ctrl-End; screen reconstruction of the final-column track; per-event timing samples; rebuild/visit counters; zero guard meters.
- [`demo_scrollbar.mjs`](../../scripts/demo_scrollbar.mjs): the same installed demo for the Human trial (C-SBAR-05).
- [`check_workorder_60_scope.py`](../../scripts/check_workorder_60_scope.py): exact inventory, byte-identical protection, 141 prior + 11 added obligations, TUI-local diff assertion.

## Results (candidate measurements)

Recorded at Handoff under `/private/tmp/wo60-evidence` (suite logs, scope output, PTY proof, demo bundle, `evidence-sha256.txt`; an absolute local Evidence locator, not a repository artifact). Headline candidate numbers: C-SBAR-04 harness p95 and the installed PTY per-event samples are reported there as raw data; both are algorithmic layout gates on Node 22.19.0 in this harness, not universal terminal-emulator latency claims.

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

macOS + Node 22.19.0. The track assumes SGR mouse reporting (1006) and requests button-motion reporting (1002); terminals without drag-motion reports still position on press and all #62 wheel/keyboard navigation remains usable. Capture recognizes only the two declared `3/m` and `0/m` releases. Overlay (modal preview) surfaces paint no track and ignore track reports. Drag/scroll interactions never rebuild the #62 layout cache; streaming growth still re-wraps the actively changing entry (unchanged #62 semantics). #61 tool-activity information design is untouched.
