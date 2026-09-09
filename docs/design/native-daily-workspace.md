# Native daily workspace — TUI A

Original Product candidate for [#47 Criteria-Version 1.0](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5596601510), [promotion](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5596609195), accepted base `7ade169b276fd68198ca4461d07c5589c273253f`. Formal body SHA-256 `b9b868effb6086bb7deea6a8fbca50a78f43463a669117e8fac21ce83a2cc858`. This is a candidate design, not a verified project fact. #46 remains paused; none of its source or pending configuration is used.

Current additive repair: [Criteria-Version 1.2](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5601235744), [activation](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5601244605), parent `f2b6c611a6bf9c5463c4d5dc7beecbb97caaf30c`. Amendment body SHA-256 `a55a393e1f95ddb436a0f9c6c79957ec9500e5dcd523bff5aecfbfa4fbcc6fe6`. Inherits 1.0/1.1 except the explicit input and evidence repairs. Old evidence remains immutable, including failed utility and aliased 1.1 grids. Startup confirmation stays: clear the draft, type only `y`, then Enter before writing a task. #48/#49 are not implemented.

## Presentation boundary

Native TTY uses [DailyWorkspace](../../typescript/src/tui/daily-workspace.ts); pipe/non-TTY retains explicit line submission through the original compact interface. Legacy/Reference entry points remain compatible. Internal projection registration uses the existing presentation attach-function identity; the public CompactPresentation interface, index exports, CLI configuration, GeneralAgentSession, Runtime, providers, tools, snapshot authorization and archive implementation are unchanged.

The workspace holds only draft/caret, execution display state, focus, selected immutable snapshots, local overlays, conversation entries and scroll position. Observation selects public task/text/tool fields; provisional text replaces the active Pan block, and authoritative settlement replaces that same block. Incomplete output is labelled Partial response; transient text is never written to the archive. Details/replay use existing permitted projections and read-only archive operations.

Execution state and focus are independent. Busy Enter retains the next draft with no queue. A new explicit idle Enter is required after settlement. Cancellation transitions to cancelling before calling Session.cancel, so repeated Ctrl-C cannot request it again. Ctrl-C in a picker/preview closes that UI only. Idle Ctrl-C retains the draft and hints :exit. EOF/Ctrl-D closes, cancelling an active run first. Shell mode/cursor/bracketed paste/alternate screen are restored at exit with a concise run/archive locator.

## Input and display

The editor stores full Unicode text and a grapheme-boundary caret. Display escaping preserves the existing reversible control policy. Extended grapheme navigation, CJK, combining marks and emoji-ZWJ are covered. Screen width uses a deterministic conventional terminal-width table; ambiguous-width fonts, unusual emoji shaping and terminals with different Unicode tables may render differently. This is not pixel parity with a particular terminal application.

Supported width >=40, height >=12. The full screen is redrawn using renderer-owned CUP/EL/SGR sequences. With one draft row and no overlay, body height is height minus six (at least floor(height/2)). Composer height is min(wrapped lines, max(1,floor(height/3))); only its caret-visible slice is displayed, underlying text is intact. Picker rows shrink first and contain no more than five candidate lines. Below minimum size, Resize terminal appears and new submission is rejected; cancellation remains available and retained state returns on resize.

You blocks have the user background token and explicit role; Pan/Tool roles have their own trusted header. External text is escaped and prefixed, preventing it from owning confirmation/composer rows. Focus has both text and cyan presentation. NO_COLOR or TERM=dumb disables color while retaining roles and state. Default tokens: background #1e1e1e, foreground #e6e6e6, secondary #9b9b9b, user #303030, cyan focus.

SGR mouse wheel reports over the conversation move exactly three rendered rows. Up detaches from tail; new output never restores follow. Down reaching the tail or Ctrl-End restores follow. PageUp/PageDown remain keyboard fallbacks. Detached reading holds a stable append-only entry index, header/text identity and original grapheme offset. Width/height/chrome changes find the first row containing that source location, with end-of-content clamping; below-minimum rendering preserves that anchor. Overlay scrolling is separate. Trackpads work only when the terminal delivers SGR wheel reports; record terminal identity and mouse-reporting settings in the Human trial. Native gestures without reports cannot be detected. Mouse modes 1000/1006 are enabled in the alternate screen and disabled on exit. Native text selection depends on terminal settings (often a terminal-specific modifier to bypass mouse reporting); selection/drag support is not provided and redraw can disturb selection. Explicit preview/details and retained archives provide full text.

- Enter: idle nonblank composer sends once; busy retains; picker displays Tab Attach / Ctrl-G Back only; preview closes only; attachment opens preview; transcript opens existing details.
- Alt-Enter: composer newline. Up/Down first moves across visual draft lines, including soft wraps. At the first/last visual line, an additional arrow browses admitted prompt history. Left/Right moves by grapheme.
- Tab/Shift-Tab: outside picker, cycle composer/attachment/transcript focus. In picker, Tab captures the highlighted snapshot and returns to composer; Shift-Tab moves to the previous candidate. Loading, empty and capturing states never capture again. Enter never captures. Only a later independent Enter sends.
- Ctrl-G: return to composer; picker returns literal @query; preview closes. Backspace edits a grapheme or removes the focused chip, never transcript data.
- Ctrl-P previews; Ctrl-R removes last. Preview shows complete path, bytes, SHA-256, content, and send/archive notice. Chips disambiguate duplicate basenames with the shortest distinguishing parent suffix; elision is visibly marked.

Prompt history is in-memory and receives only run.started prompt text, decoded without the attachment envelope. Cancelled/failed admitted tasks and repeated submissions remain entries. Startup confirmation, commands, denied/busy/blank submissions, unsent paste, queries and replay are excluded. First recall stashes the exact draft, caret and snapshot objects, and presents only recalled text with empty active attachments. Down past newest or Ctrl-G restores the stash; successful recalled submission appends a new entry and restores the stash as the next unsent draft. Navigation discards local edits to recalled entries without changing canonical admitted tasks. No history scan, persistence or implicit file reread occurs.

Bracketed paste markers are parsed before key dispatch; complete pasted content is inserted as draft, including newlines, @ and colon text. No picker, capture, command or admission occurs during paste. Ctrl-V explicitly enables visible SAFE PASTE / EDIT for sources without markers; Enter then inserts newline. Ctrl-G (or Ctrl-V) leaves the mode; a later explicit Enter sends. Unmarked keystrokes cannot in general be identified as paste. Separate Enter/Tab events in the same input delivery are suppressed at confirmation/selection/preview transitions; unsupported repeat/control escape sequences are ignored. Ordinary repeated Enter on terminals that do not report repeat identity cannot be distinguished from a new physical key action across separate deliveries. Tests use separate PTY/state barriers for genuine sends.

### Compatibility framing contract

[FramedInput](../../typescript/src/tui/framed-input.ts) is an incremental parser with no timers, readline decoder or enhanced-keyboard negotiation. Bare ESC is reserved indefinitely: delays, delivery boundaries, redraw and resize never turn it into a key or text. The footer displays `Input sequence pending · Ctrl-G Back`. Ctrl-G (BEL) is the explicit Back command outside paste; Ctrl-C cancels and Ctrl-D exits even during a pending frame. Back quarantines the remaining frame; its late completed event cannot act. After an accidental ESC, raw typing may be consumed until protocol resynchronization. This compatibility grammar cannot recover ambiguous human intent losslessly.

| Frame | Supported action / recovery |
| --- | --- |
| CSI A/B/C/D/H/F, Z, 1~ through 6~, 1;2 or 1;5 plus A/B/C/D/H/F | Navigation; unknown CSI drains through the first ASCII final byte @–~. |
| ESC followed by CR/LF | Alt-Enter newline; other Alt-style two-codepoint sequences are discarded. |
| CSI `<64;x;yM` or `<65;x;yM` | Vertical wheel; coordinates have 1–6 digits. Unknown/malformed mouse frames drain through M/m. |
| CSI `200~` … exact ESC `[201~` | Literal bracketed paste; fragmented delimiters supported. BEL, ESC and Ctrl-C inside payload are text. A quarantined start drains its entire paste without actions. |
| SS3 (`ESC O`) | Unsupported; drain through first ASCII final byte. |
| OSC/DCS/SOS/PM/APC (`ESC ]/P/X/^/_`) | Unsupported; drain through ESC backslash. OSC also ends at BEL, which simultaneously performs explicit Back. Other strings retain quarantine after BEL. |

A repeated ESC outside a control string restarts prefix framing in quarantine, never produces Escape. Retained control-frame payload is at most 4096 UTF-8 bytes. Overflow clears stored payload and keeps only finite parser state until terminator/EOF; subsequent bytes cannot leak into draft or commands. Paste payload and ordinary draft are outside this control-frame ceiling. This is a declared compatibility subset, not a universal terminal protocol decoder.

Picker discovery and capture have object identity plus abort control. A completion after cancellation/replacement cannot change selected snapshots, focus or draft. Capture policy/byte limits and send-time envelope creation remain in protected input modules. Send never rereads a selected file. Capture failure retains the draft and an English diagnostic category.

## Verification and installed trial

[Obligation mapping](workorder-tui-a-obligations.json) records every prior Product test, without changing/removing any old assertion. The old line/projection tests still cover the retained non-TTY path and execution contracts; new daily-workspace tests and installed PTY grid checks cover the new TTY layout. Historical scope-only checkers execute on their original accepted snapshots, never weakened to accept a different UI.

[scripts/verify_tui_a_pty.py](../../scripts/verify_tui_a_pty.py) launches the installed package through a real PTY and existing unchanged credential/network guard. A separate [VT oracle](../../scripts/fixtures/tui-a/screen.py) decodes actual bytes into cells, attributes, cursor and modes. It does not import the renderer. The driver exposes read-only state barriers and deterministic Faux/filesystem pauses. A negative control blanks visible confirmation while leaving correct internal state, and must fail the screen assertion. Raw failed development runs remain separately identifiable. Screen snapshots deep-copy cells, nested attributes, cursor, modes and metadata. Capture offsets refer to bytes actually consumed by the oracle, not bytes asynchronously received. Each checkpoint records its exact raw prefix and ordered initial-size/resize event index; all retained checkpoints are replayed and compared. Received but unconsumed bytes stay buffered. The 1.1 retained grids alias live arrays and cannot prove prior screen contents; they remain unchanged for audit, superseded as evidence by fresh 1.2 package captures.

Handoff supplies full source SHA, two build/package/runtime identities, consumer installation, scope/public-API/regression records, named A-LAYOUT/A-DRAFT/A-SAFETY/A-PACKAGE indexes, and a direct installed offline trial command. [demo_tui_a.mjs](../../scripts/demo_tui_a.mjs) uses synthetic files and the same installed Product, an eight-second Faux response, existing guards and local records. It does not call a real model, read credentials or start #46.

Human retest sheet (new candidate/package, both 80x24 and 40x12, resize and streaming; retain terminal identity/configuration and screenshots/recording):

1. Does wheel/trackpad move history without incoming output stealing the reading position? Yes / No.
2. Does resize preserve the content I am reading, or retain tail-follow when already at tail? Yes / No.
3. Do Up/Down recall admitted prompts with multiline priority and restore the draft/attachments with Ctrl-G? Yes / No.
4. Does @ → arrows → Tab attach and return, then a separate Enter send, with understandable hints and Ctrl-G closing picker/preview? Yes / No.
5. Are roles, caret, status, long-output editing, cancellation, Compat/pending hints and Ctrl-G safe-edit exit understandable at both sizes? Yes / No.

Startup y remains pending #49; it is not scored as removed. Builder PTY cannot answer on behalf of Human. C-TUI-A-G03 remains NOT_EVALUABLE until attributable new-SHA answers exist. C-TUI-A-G02 additionally needs independent review plus explicit Human confirmation or a different-model-family review of the same A-SAFETY outputs.

The unchanged #45 utility run in [Handoff #1](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5597621621) remains FAIL / 35 of 36: expected needs_human / human_evidence_missing, observed needs_reconciliation / pid_identity_mismatch; the mismatching ps sample was not captured. Only prospective 1.1 replaces utility execution with exact protected-byte preservation and Product dependency isolation. #48 owns investigation; #46 remains paused. No claim of a diagnosed race or a passing utility suite is made.
