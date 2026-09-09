# Native daily workspace — TUI A

Product candidate for [#47 Criteria-Version 1.0](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5596601510), [promotion](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5596609195), accepted base `7ade169b276fd68198ca4461d07c5589c273253f`. Formal body SHA-256 `b9b868effb6086bb7deea6a8fbca50a78f43463a669117e8fac21ce83a2cc858`. This is a candidate design, not a verified project fact. #46 remains paused; none of its source or pending configuration is used.

## Presentation boundary

Native TTY uses [DailyWorkspace](../../typescript/src/tui/daily-workspace.ts); pipe/non-TTY retains explicit line submission through the original compact interface. Legacy/Reference entry points remain compatible. Internal projection registration uses the existing presentation attach-function identity; the public CompactPresentation interface, index exports, CLI configuration, GeneralAgentSession, Runtime, providers, tools, snapshot authorization and archive implementation are unchanged.

The workspace holds only draft/caret, execution display state, focus, selected immutable snapshots, local overlays, conversation entries and scroll position. Observation selects public task/text/tool fields; provisional text replaces the active Pan block, and authoritative settlement replaces that same block. Incomplete output is labelled Partial response; transient text is never written to the archive. Details/replay use existing permitted projections and read-only archive operations.

Execution state and focus are independent. Busy Enter retains the next draft with no queue. A new explicit idle Enter is required after settlement. Cancellation transitions to cancelling before calling Session.cancel, so repeated Ctrl-C cannot request it again. Ctrl-C in a picker/preview closes that UI only. Idle Ctrl-C retains the draft and hints :exit. EOF/Ctrl-D closes, cancelling an active run first. Shell mode/cursor/bracketed paste/alternate screen are restored at exit with a concise run/archive locator.

## Input and display

The editor stores full Unicode text and a grapheme-boundary caret. Display escaping preserves the existing reversible control policy. Extended grapheme navigation, CJK, combining marks and emoji-ZWJ are covered. Screen width uses a deterministic conventional terminal-width table; ambiguous-width fonts, unusual emoji shaping and terminals with different Unicode tables may render differently. This is not pixel parity with a particular terminal application.

Supported width >=40, height >=12. The full screen is redrawn using renderer-owned CUP/EL/SGR sequences. With one draft row and no overlay, body height is height minus six (at least floor(height/2)). Composer height is min(wrapped lines, max(1,floor(height/3))); only its caret-visible slice is displayed, underlying text is intact. Picker rows shrink first and contain no more than five candidate lines. Below minimum size, Resize terminal appears and new submission is rejected; cancellation remains available and retained state returns on resize.

You blocks have the user background token and explicit role; Pan/Tool roles have their own trusted header. External text is escaped and prefixed, preventing it from owning confirmation/composer rows. Focus has both text and cyan presentation. NO_COLOR or TERM=dumb disables color while retaining roles and state. Default tokens: background #1e1e1e, foreground #e6e6e6, secondary #9b9b9b, user #303030, cyan focus.

PageUp/PageDown move conversation position and suspend tail-follow. New output shows New output without moving the reading position; Ctrl-End resumes follow. Overlay navigation is separate from transcript scrolling. The alternate screen does not promise complete shell scrollback. Native terminal text selection is terminal-dependent and can be disturbed by redraw; mouse selection is not implemented. Use explicit preview/details and retained archives for complete text.

- Enter: idle nonblank composer sends once; busy composer retains; picker selects only; preview closes only; attachment opens preview; transcript opens existing details.
- Alt-Enter: composer newline. Up/Down: draft lines or candidate/overlay/chip navigation; no task recall. Left/Right: grapheme movement in draft/query.
- Tab/Shift-Tab: cycle available composer/attachment/transcript focus, or candidate navigation without wrapping. Empty focus regions are skipped.
- Escape: return to composer; picker returns literal @query; preview closes. Backspace edits a grapheme or removes the focused chip, never transcript data.
- Ctrl-P previews; Ctrl-R removes last. Preview shows complete path, bytes, SHA-256, content, and send/archive notice. Chips disambiguate duplicate basenames with the shortest distinguishing parent suffix; elision is visibly marked.

Bracketed paste markers are parsed before key dispatch; complete pasted content is inserted as draft, including newlines, @ and colon text. No picker, capture, command or admission occurs during paste. Ctrl-V explicitly enables visible SAFE PASTE / EDIT for sources without markers; Enter then inserts newline. Escape (or Ctrl-V) leaves the mode; a later explicit Enter sends. Unmarked keystrokes cannot in general be identified as paste. Separate Enter events in the same input delivery are suppressed at confirmation/selection/preview transitions; unsupported repeat/control escape sequences are ignored. Ordinary repeated Enter on terminals that do not report repeat identity cannot be distinguished from a new physical key action across separate deliveries. Tests use separate PTY/state barriers for genuine sends.

Picker discovery and capture have object identity plus abort control. A completion after cancellation/replacement cannot change selected snapshots, focus or draft. Capture policy/byte limits and send-time envelope creation remain in protected input modules. Send never rereads a selected file. Capture failure retains the draft and an English diagnostic category.

## Verification and installed trial

[Obligation mapping](workorder-tui-a-obligations.json) records every prior Product test, without changing/removing any old assertion. The old line/projection tests still cover the retained non-TTY path and execution contracts; new daily-workspace tests and installed PTY grid checks cover the new TTY layout. Historical scope-only checkers execute on their original accepted snapshots, never weakened to accept a different UI.

[scripts/verify_tui_a_pty.py](../../scripts/verify_tui_a_pty.py) launches the installed package through a real PTY and existing unchanged credential/network guard. A separate [VT oracle](../../scripts/fixtures/tui-a/screen.py) decodes actual bytes into cells, attributes, cursor and modes. It does not import the renderer. The driver exposes read-only state barriers and deterministic Faux/filesystem pauses. A negative control blanks visible confirmation while leaving correct internal state, and must fail the screen assertion. Raw failed development runs remain separately identifiable.

Handoff supplies full source SHA, two build/package/runtime identities, consumer installation, scope/public-API/regression records, named A-LAYOUT/A-DRAFT/A-SAFETY/A-PACKAGE indexes, and a direct installed offline trial command. [demo_tui_a.mjs](../../scripts/demo_tui_a.mjs) uses synthetic files and the same installed Product, an eight-second Faux response, existing guards and local records. It does not call a real model, read credentials or start #46.

Human review sheet (same candidate/package; use 80x24 and 40x12, including resize; retain terminal identity and recording/screenshots):

1. Are submitted You blocks and Pan replies distinguishable without diagnostic history? Yes / No.
2. Do caret and draft remain visible during streaming/long output? Yes / No.
3. Do @ choices refresh inline without history spam? Yes / No.
4. Is a selected/previewed attachment visibly not sent, and is sending discoverable without large metadata blocks? Yes / No.
5. After narrow/resize, are busy/send/cancel states discoverable and can editing recover? Yes / No.

Builder PTY does not answer these on the Human's behalf. C-TUI-A-G03 remains NOT_EVALUABLE until attributable Human answers exist. C-TUI-A-G02 additionally requires same-SHA A-SAFETY independent review plus explicit Human confirmation or a different-model-family review. No earlier #46 Human decision is reused for this new output.
