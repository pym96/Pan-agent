# Terminal presentation

- [tui.ts](tui.ts): preserved legacy renderers and `runTui`; omitted optional presentation keeps Reference behavior.
- [presentation.ts](presentation.ts): compact/details/replay projection, safe external text, 80-code-point identifier policy and count provenance.
- [terminal-input.ts](terminal-input.ts): one editable draft, cursor movement and progress redraw; no task queue.
- [compact-tui.ts](compact-tui.ts): confirmation, local commands, Session lifecycle and retained archive inspection.

The Native [CLI](../cli.ts) explicitly constructs and attaches the compact presentation. Its observation boundary catches synchronous display errors so Session cannot misclassify them as archive failure. No module here implements a model/tool loop or writes an archive.

See the [#42 guide](../../../docs/design/native-compact-tui.md) for the offline demo and review requirements.

#44 [streaming policy](../../../docs/design/native-streaming-tui.md) adds framed provisional public text, surrogate-safe incremental escaping and bounded visual-line redraw above the editable draft. Product-owned labels are English; data language and legacy renderers are unchanged.

[attachment-picker.ts](attachment-picker.ts) owns idle selection/preview/removal and calls [input preparation](../input/README.md); TerminalInput provides an optional idle key interceptor. Presentation decodes only intact recorded snapshots.

[Criteria 1.1 repair](../../../docs/design/native-file-input-repair.md): picker navigation aliases and Node grapheme cursor; TerminalInput renders an optional persistent composer hint. Snapshot/Context/execution semantics stay in their existing modules.

[TUI A contract](../../../docs/design/native-daily-workspace.md): [daily-workspace.ts](daily-workspace.ts) owns the Native TTY view and focus; [daily-editor.ts](daily-editor.ts) owns grapheme draft editing and visual wrapping. The earlier compact input remains the non-TTY path.

#47 repair navigation: [Criteria-Version 1.1](https://github.com/pym96/Pan-agent/issues/47#issuecomment-5597954262) covers SGR wheel, source-content reflow anchors, admitted prompt recall and Tab attachment. Startup y remains; old 1.0 evidence is retained.

#47 Criteria-Version 1.2 adds timer-free compatibility framing (Ctrl-G Back, ESC prefix only) and immutable raw-prefix screen evidence. Old 1.1 grids remain historical failed evidence.
[framed-input.ts](framed-input.ts) owns bounded incremental compatibility input framing.
