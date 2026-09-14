# Bounded transcript-scroll layout | WorkOrder #62

Status: Builder candidate, pending independent Regulator review. [Activation](https://github.com/pym96/Pan-agent/issues/62#issuecomment-5658626204) freezes Criteria-Version 1.0, C-SCROLL-01…06, on accepted base `5f40438e84f92be1376a57230a49dea2074ca6e1`.

## Baseline and design

Measured baseline (activation input): ten wheel events at 120×40 cost 185.9 ms with 20 entries, 1,702.7 ms with 200, 8,448.3 ms with 1,000 — every wheel recomputed wrapped rows for the entire retained transcript.

The change is TUI-local, in [`daily-workspace.ts`](../../typescript/src/tui/daily-workspace.ts) only:

- **Per-entry wrap cache** (`layoutRows`/`layoutStarts`/`layoutStamps`/`entryStamps`): an entry's `sourceRows` are recomputed only when the width changes or that entry's stamp changes (active streaming entry, last tool status, appended entries). Wheels and no-op draws reuse the cache verbatim.
- **Appended-tail builds**: new entries are built once and appended; splice-rebuild covers only stamp-changed existing entries, with start-index deltas adjusted for successors.
- **Binary-search anchor resolution**: `findAnchorRow` resolves the detached reader's source anchor within one entry's row range in O(log n) — structural visits per wheel stay ≤ 2×bodyHeight+8 instead of proportional to retained history.

Semantics are unchanged: follow-tail, detached anchor, `newOutput`, Ctrl-End, PageUp/PageDown, clamping, overlay/picker/composer behavior, archive/event/replay behavior. Two defects found by my own probes during development are recorded honestly: an empty-entries build left `layoutStarts` empty so the first appended entries were spliced at an undefined start (append-only accumulation), and the first anchor resolution was linear within an entry — both fixed before Handoff and covered by tests.

## Verification assets

- [`scroll-layout.test.ts`](../../typescript/test/scroll-layout.test.ts): C-SCROLL-01 deterministic timing harness (1,000 mixed Tool/Pan entries, 500 visible chars each with Unicode rows, 120×40; 10 warm-up + 50 wheels; p95 ≤ 50 ms, zero post-warm-up rebuilds, visits ≤ 2×bodyHeight+8); C-SCROLL-02 clamp/anchor/newOutput/Ctrl-End/no-execution; C-SCROLL-03 resize invalidation matrix (40×12/80×24/120×40 round trip, unchanged-dimension no-rebuild, single-entry append build, draft/caret bytes unchanged); C-SCROLL-04 view-only invariance.
- [`verify_scroll_pty.py`](../../scripts/verify_scroll_pty.py) with [`scroll-pty-driver.mjs`](../../scripts/fixtures/scroll/scroll-pty-driver.mjs): installed-package 120×40 PTY run with an 800-line streamed transcript, 20 SGR wheel reports, 80×24/40×12/120×40 resizes and Ctrl-End; screen reconstruction, raw per-wheel timing samples, rebuild/visit counters, zero guard meters.
- [`demo_scroll.mjs`](../../scripts/demo_scroll.mjs): the same installed demo for the Human trial (C-SCROLL-05).
- [`check_workorder_62_scope.py`](../../scripts/check_workorder_62_scope.py): exact inventory, byte-identical protection, 137 prior + 4 added obligations, TUI-local diff assertion.

## Results (candidate measurements)

- C-SCROLL-01 harness: p95 **1.061 ms** (50 samples), zero post-warm-up rebuilds, max visits 11 per wheel (bound 76).
- Installed PTY: p95 **5.611 ms** over 20 wheel reports, builds unchanged across wheels, max visits 11, zero meters, follow restored after Ctrl-End.

These are algorithmic layout gates on Node 22.19.0 in this harness, not universal terminal-emulator latency claims.

## Criterion map

| Criterion | Evidence |
|---|---|
| C-SCROLL-01 | scroll-layout.test.ts timing harness (raw samples + p95 printed) |
| C-SCROLL-02 | scroll-layout.test.ts state/rendered-row assertions |
| C-SCROLL-03 | scroll-layout.test.ts resize/invalidation/anchor/draft assertions |
| C-SCROLL-04 | scroll-layout.test.ts zero-execution + entry immutability; archive/replay untouched by construction (no runtime/archive diff) |
| C-SCROLL-05 | verify_scroll_pty.py + PTY capture/summary; Human trial record |
| C-SCROLL-06 | scope audit, full Product/conformance/Reference/Python suites, host outer gate, `git diff --check` |

## Honest limits

macOS + Node 22.19.0; timing is a layout-algorithm gate, not a terminal-emulator guarantee; the change does not address streaming rebuild cost while content is actively growing (necessary re-wraps), drag/scrollbar UX (#60), or tool-activity information design (#61).
