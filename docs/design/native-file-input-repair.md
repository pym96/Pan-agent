# File input repair | Criteria-Version 1.1

[Prospective activation](https://github.com/pym96/Pan-agent/issues/43#issuecomment-5583617915) adds C-FILE-R01/R02 to C-FILE-01…06. Accepted main is `28b524deafaef3494a5c1865c5ad68c5635f1f74`; this additive candidate descends from `4cc479a16cd2767efda06c46f3d006f281e4c324`. The [1.0 design](native-file-input.md), [old obligation map](workorder-43-obligations.json), Handoff, source worktree, installed packages and evidence remain historical inputs. No old Verdict is transferred. The [repair map](workorder-43-repair-obligations.json) accounts for the exact 99 existing Product tests and new obligations.

## Keyboard behavior

In the picker, Tab/Down move to the next match and Shift-Tab/Up to the previous match; selection stops at boundaries and navigation with zero matches is a no-op. Navigation neither inserts text nor reads a file. Enter selects only. Outside the picker, existing key behavior remains unchanged.

The picker owns a UTF-16 insertion offset that always lies on a Node `Intl.Segmenter` extended-grapheme boundary. Left/Right move one cluster, Backspace removes the preceding cluster, Home/End move to boundaries. Printable input inserts at that position; combining marks and ZWJ may merge clusters, so insertion then resolves to the next cluster boundary. An edit recomputes matches and resets selection to the first; pure cursor moves retain selection. Unknown non-text keys and C0/C1/control encodings are ignored. A separate safe `Query cursor: K/N graphemes` line means exactly K of N clusters precede the insertion point; zero is before the first, N is after the last. The query itself is framed and remains unmodified by that marker.

During listing, the query and its position remain visible and editable; Enter cannot capture absent results. During capture, further navigation/editing/confirmation is ignored. Escape and Ctrl-C preserve their original dismissal/cancellation behavior, with state identity and existing capture abort checks preventing late attachment. No snapshot, envelope, byte policy or file-selection authority changes.

## Unsubmitted composer

An optional TerminalInput hint callback is rendered as part of the editable prompt, included in its cursor/erase accounting and redrawn after output. It is not a one-off scrollback log. In idle state, nonblank task text shows `Not submitted · Enter Send`; blank or local-command input shows `Not submitted · Write a task`. Busy runs with a retained draft show `Not submitted · Busy`. Selection, duplicate selection, removal, inline preview and local commands return to this same prompt rendering. This retains the existing single-line composer and existing local-command draft-clearing semantics.

Blank composer Enter never submits, including with attachments. It preserves those attachments and asks for task text. A later nonblank composer Enter remains the only task send action. Empty details/history explicitly state `No submitted run yet`; the old details wording is retained after that clarification so existing public display expectations remain covered. Model/Tool/archive execution and cancellation remain untouched.

No fullscreen layout, in-place candidate redraw, multiline editor, Markdown/theme work, observed duration or Run History is implemented. A/B/C remain unactivated.

## Evidence and reproduction

[Focused test](../../typescript/test/file-repair.test.ts) starts with the physical-Tab defect and covers navigation boundaries, selection preservation and combining/CJK/ZWJ editing. [Installed PTY verifier](../../scripts/verify_file_repair_pty.py) uses a [verification-only driver](../../scripts/fixtures/file-repair-driver.mjs) and [bounded terminal screen oracle](../../scripts/fixtures/file-repair-screen.py) at 40×24 and 80×24. Each key is sent independently and acknowledged after its handler and actual output bytes. The oracle tracks visible cells, cursor, scrollback and wrap separately; it consumes terminal bytes rather than Product internal state. Expected queries/cursor counts and selected file names are independently specified by the fixture.

R-KEYS retains per-key bytes, internal query/grapheme cursor/read/admission counters, actual visible cells, controlled listing/capture completion and cancellation. R-SUBMIT retains stable visible prompt-adjacent hints after long previews/commands/blank input and busy/cancelled draft state. The driver separately injects a wrong selected-path display with correct internal state and suppresses the current prompt hint while an old hint remains in scrollback. Both screen-oracle failures must be observed at both widths. Instrumentation is test-only and absent from Product.

```sh
python3 scripts/verify_file_repair_pty.py --node /absolute/node22.19 --package /fresh/consumer/node_modules/pan-agent --guard /fresh/consumer/verification/guard.mjs --output /fresh/repair-pty
node scripts/demo_file_repair.mjs --package /fresh/consumer/node_modules/pan-agent
```

The Handoff supplies an executable wrapper binding the full new SHA, retained tarball, normalized runtime inventory, Node binary and copied demo/guard hashes. It creates synthetic fixtures and injects Faux only. All six inherited checks remain required, including old installed consumer/streaming/file/replay obligations, current protected bytes and full regressions. [Repair scope controls](../../scripts/verify_file_repair_scope.py) run the unchanged 1.0 scope checker in a fresh exact-4cc479a historical worktree; no old location is edited.

Host validation uses only a fresh candidate-mode copy, excluding the four expressly named root extras and the existing untracked user-tool omissions. Screenshot contents are not published as Product evidence. Original host BLOCK, exact copy inventory, exclusions/hashes and unchanged validator checks are separate outputs. F-AUTH/F-DISPLAY are updated for the new affected display/input surfaces; independent Regulator plus different-family or explicit Human high-risk review remains required.
