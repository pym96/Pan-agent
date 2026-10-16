# TUI demonstration

[v0.1.6 credential guidance release notes](CREDENTIAL-RELEASE-NOTES.md)

[v0.1.5 real-time installed CLI recording](MARKDOWN-LIVE.md) · [Release notes](MARKDOWN-LIVE-RELEASE-NOTES.md)

[v0.1.4 Markdown display and offline comparison](MARKDOWN.md) · [Release notes](MARKDOWN-RELEASE-NOTES.md)

[Original Harbor evaluation demonstration](HARBOR-DEMO.md) · [v0.1.3 media release notes](HARBOR-RELEASE-NOTES.md)

[Criteria1.5：逐幕中文解释字幕](CAPTIONS.md)。原有版本和证据保留。

New: [Criteria1.4 database-recovery demonstration](WAL-DEMO.md). Earlier release evidence below is unchanged.

The 41-second video was independently accepted under Criteria1.2. [Watch/download the v0.1.0 video](https://github.com/pym96/Pan-agent/releases/download/v0.1.0/pan-agent-demo.mp4). Pan-authored code is MIT licensed.

The candidate records the actual installed TUI in a 112-column, 34-row PTY. It shows a benign JavaScript file task, shell approval, output, run listing and the same run's archive replay. Input is automated; it is not a fabricated terminal interface. Long idle waits may be shortened in the rendered MP4. Source `terminal.cast` preserves original timing and bytes.

Two modes are distinguished:

- **Offline scripted model**: `pan-agent demo`, with real NativeKernel and local tools, no API key/network. Expected file: `console.log("PAN_DEMO_OK");\n`.
- **Live Kimi Code**: one task through the normal installed CLI and provider. Expected file: `console.log("PAN_LIVE_OK");\n`. Only a completed recording can be represented as a successful live demo; failures remain disclosed.

Recording source: `scripts/verify_tui_release56.py` from the repository root. Usage: `python3 scripts/verify_tui_release56.py INSTALLED_EXECUTABLE NEW_RECORDING_DIRECTORY [--live]`. Live requires the already-configured environment credential; never include it in arguments or artifacts. The script uses isolated settings and a benign workspace. It does not alter the runtime.

Rendering: `python render.py RECORDING/terminal.cast OUTPUT.mp4` in an environment with Pillow, pyte and FFmpeg. Default font is the local macOS Menlo font; no font binary is shipped. Color support is a simplified terminal rendering; event text and cursor position come from recorded terminal bytes. The manifest identifies raw captures, package, archive and video hashes.

[License inventory](LICENSE-INVENTORY.md). Candidate evidence and release checklist: `docs/evidence/tui-release56/README.md` in the repository.

Finished candidate: `pan-agent-demo.mp4`, 41 seconds. Live task footage (first 27 seconds) is followed by a separately recorded same-run replay (14 seconds); headers distinguish the sections. This edit removes a failed overlay-navigation attempt from the showcase, not an unsuccessful model task. Raw captures are retained.

[Renderer](render.py) · [Video assembly](assemble.sh)

[Final release notes](RELEASE-NOTES.md) · [Final licensing/package evidence](../../evidence/tui-release56/FINAL-RELEASE.md)
