# Real-time Markdown in the ordinary installed TUI

[Watch the 29-second live video](https://github.com/pym96/Pan-agent/releases/download/v0.1.5/pan-agent-markdown-live.mp4) · [Chinese subtitles](https://github.com/pym96/Pan-agent/releases/download/v0.1.5/pan-agent-markdown-live.srt) · [Checksums](https://github.com/pym96/Pan-agent/releases/download/v0.1.5/SHA256SUMS)

Markdown rendering is **embedded in v0.1.4**, enabled by default in the ordinary interactive TUI. Install the public v0.1.4 tarball following the root README, run `pan-agent configure`, choose your provider and credential source, then start the native TUI:

```sh
./node_modules/.bin/pan-agent configure
mkdir -p workspace archives
./node_modules/.bin/pan-agent --kernel native \
  --workspace "$PWD/workspace" --memory-root "$PWD/archives"
```

A real provider credential is required to submit real tasks. Markdown itself needs no plugin, Python renderer, extra service or special launcher. The separate `pan-agent demo` command is optional and explicitly offline/scripted. The offline screenshots in v0.1.4 were a deterministic test of the installed feature, not its only entry point.

## What this recording proves

This video starts the clean-installed public package's `bin/pan-agent.mjs` directly under a real PTY, using ordinary Kimi Code environment-credential configuration. There is no adapter, provider, `startTui` or session injection. One harmless text-only request asks for a bilingual report with varied Markdown; the model writes text without executing tools.

At 5.544 seconds, a formatted heading is already visible while the TUI says the assistant is responding provisionally. The response continues to grow. The first completed-state frame appears at 24.462 seconds. The recording includes final output and navigation to previous lines. The source route is real provider `delta.content` → presentation progress → DailyWorkspace → Markdown rows. The display transforms text; archives retain the original Markdown.

- Run `9d9a8c9d-5e57-45f9-9538-2fbe36c697e8`.
- Kimi Code `k3-256k`, high thinking, streaming Chat Completions.
- One model turn, zero tool calls; input 1,092 / output 734 / total 1,826 tokens.
- Video is contiguous raw PTY time 0–28.9 seconds at 1×, with explanatory captions. No artificial token pacing, replay, held frames or replacement response.

This is a media/documentation v0.1.5 release; runtime v0.1.4 and older releases remain unchanged. Supported Markdown is still the documented limited subset. Mac arm64 was tested; this does not certify other platforms or establish model/benchmark performance.

## Reproduction and attribution

`record_markdown_live.py` launches the public CLI directly and records original terminal bytes. It uses existing environment credentials without printing them. Recording helpers are evidence tooling, not required for users. `render_markdown_live.py` renders the captured bytes using pyte/Pillow/FFmpeg and local Menlo/Hiragino fonts; font binaries are not distributed. [Edit map](markdown-live-edit-map.json) binds captions to the original timeline. [Evidence and recorder limitation](../../evidence/tui-release56/MARKDOWN-LIVE.md).

Human clarified the ordinary-user requirement; Builder installed, recorded and documented it; the real model generated the answer. No product source changes were required.
