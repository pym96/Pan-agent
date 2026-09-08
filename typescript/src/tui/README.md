# Terminal presentation

- [tui.ts](tui.ts): preserved legacy renderers and `runTui`; omitted optional presentation keeps Reference behavior.
- [presentation.ts](presentation.ts): compact/details/replay projection, safe external text, 80-code-point identifier policy and count provenance.
- [terminal-input.ts](terminal-input.ts): one editable draft, cursor movement and progress redraw; no task queue.
- [compact-tui.ts](compact-tui.ts): confirmation, local commands, Session lifecycle and retained archive inspection.

The Native [CLI](../cli.ts) explicitly constructs and attaches the compact presentation. Its observation boundary catches synchronous display errors so Session cannot misclassify them as archive failure. No module here implements a model/tool loop or writes an archive.

See the [#42 guide](../../../docs/design/native-compact-tui.md) for the offline demo and review requirements.

#44 [streaming policy](../../../docs/design/native-streaming-tui.md) adds framed provisional public text, surrogate-safe incremental escaping and bounded visual-line redraw above the editable draft. Product-owned labels are English; data language and legacy renderers are unchanged.
