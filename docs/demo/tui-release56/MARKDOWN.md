# v0.1.4 — assistant Markdown display

Install the [v0.1.4 package](https://github.com/pym96/Pan-agent/releases/download/v0.1.4/pan-agent-0.1.4.tgz) using the root README. Compare the same archived response in the [previous TUI](https://github.com/pym96/Pan-agent/releases/download/v0.1.4/markdown-before.png) and [updated TUI](https://github.com/pym96/Pan-agent/releases/download/v0.1.4/markdown-after.png). Both images are actual PTY replay captures of an explicitly **offline scripted fixture**, not a new model evaluation.

Assistant responses now display headings, bullet and numbered lists, bold, inline code and fenced code with language labels. The final response in archive replay uses the same display projection. Tool details, approval prompts, user text and non-TTY transcripts keep their literal presentation. Archived text is unchanged. `NO_COLOR` or `TERM=dumb` keeps text and structural markers while disabling styles.

This is a small Markdown subset, not a complete CommonMark implementation. Unsupported constructs remain readable; tables/HTML/links are not rendered as interactive UI. Nested inline styles and escape processing are not implemented. Code blocks do not syntax-highlight individual tokens. Incomplete delimiters remain readable during streaming; open fences show their remaining content as code.

## Reproduce the offline comparison

`markdown-fixture.mjs` uses the installed public CLI seam with a Faux adapter and rejects network/tools. `capture_markdown.py` records an actual 120×38 PTY and rasterizes its terminal state; it needs Python, pyte and Pillow only for capturing, not for using Pan. The helper labels the fixture and provides raw `.cast`/`.raw` evidence.

```sh
python capture_markdown.py /path/to/installed/node_modules/pan-agent /tmp/new-markdown-demo live /absolute/path/markdown-fixture.mjs
python capture_markdown.py /path/to/installed/node_modules/pan-agent /tmp/new-markdown-demo replay-after /absolute/path/markdown-fixture.mjs
python capture_markdown.py /path/to/old/node_modules/pan-agent /tmp/new-markdown-demo replay-before /absolute/path/markdown-fixture.mjs
```

The first command generates one offline scripted response and its archive; subsequent commands only replay that archive and verify byte identity, with zero provider/tool/network effects. Public before/after images use the same sealed run. Font/emoji appearance depends on terminal; the pyte screenshot emulator may show the base glyph for a joined emoji while raw output retains the whole sequence. Local system fonts are not distributed.

[Builder evidence](../../evidence/tui-release56/MARKDOWN.md). Older video/package releases remain unchanged; v0.1.3 still demonstrates the earlier runtime performing the original Harbor task.
