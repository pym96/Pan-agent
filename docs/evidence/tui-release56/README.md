# TUI release preparation — Builder candidate

[Criteria1.7 completed original-task demonstration](HARBOR-COMPLETED.md) · [Artifact manifest](harbor-completed-manifest.json)

[Criteria1.7 repair preparation](HARBOR-REPAIR.md)

[Criteria1.6 consumed attempt: timeout, unscored](HARBOR-ATTEMPT.md) · [Harbor preparation](HARBOR-PREP.md)

[Criteria1.5：逐幕中文解释字幕](CAPTIONS.md)。原有版本和证据保留。

New: [Criteria1.4 database-recovery demonstration](WAL-DEMO.md). Earlier release evidence below is unchanged.

Later MIT/licensed package preparation: [Criteria1.3 final release evidence](FINAL-RELEASE.md). The Stage A observations and hashes below remain unchanged historical evidence.

Contract: [#56 Criteria1.2](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6187219818). Base: `0acdaef8af20ea36243dcd1c47b1765b3db98978`. This is Builder evidence, not an acceptance Verdict or public release.

## Candidate delivery

- A packaged `pan-agent demo` command uses the existing installed `runCli`/Faux seam, NativeKernel, tools and TUI. No runtime/kernel/provider implementation changes.
- Root README separates install, configure, trusted-local authority, offline demo, real mode, video and pending license. Legacy classification/source-route assertions remain in a collapsed developer appendix rather than the user flow.
- One live Kimi task completed, with write/bash/read and exact `console.log("PAN_LIVE_OK");\n`. Run ID: `cc0089e2-73a1-494a-a96a-d07074a3a4b7`.
- Four model exchanges reported input **4624**, output **257**, total **4881** tokens; no unknown usage in this run. These are run observations, not capability or benchmark claims.
- The same saved live run was replayed in a separately captured installed TUI process. A fresh-process seam probe refused provider/tools/network and measured **0/0/0** calls, with archive bytes unchanged.
- Offline clean-consumer run `6ba00f78-46bc-49b5-80e9-aa7dbbeb702d`: four scripted exchanges, three real tool executions, zero fetch calls; same-run replay preserved these counts and archive bytes. Expected file: `console.log("PAN_DEMO_OK");\n`.

## Reproduction and artifact identity

Artifacts remain in the private review directory supplied by the Handoff. [Artifact manifest](artifact-manifest.json) binds the package, captures, run archives, probes and video by SHA-256. The package was installed with `npm install FILE.tgz --offline --omit=dev --ignore-scripts --no-audit --no-fund` against an empty npm cache. It carries no runtime npm dependencies.

Recorded environment: macOS arm64, Node v26.7.0, 112×34 `xterm-256color` PTY. Node >=22.19.0 is the declared engine requirement; the exact minimum version and Linux/Windows are not independently tested by this candidate.

- `scripts/verify_tui_release56.py`: actual installed PTY capture. `--replay-of` opens a prior live recording's workspace/archive and submits only local view commands; no new live task.
- `typescript/scripts/verify-release56-replay.mjs`: installed fresh-process replay probe with provider/tool/fetch counters and archive hashes.
- `docs/demo/tui-release56/render.py`: renderer of captured bytes using pyte/Pillow/FFmpeg; model/tool output is not invented.
- `npm --prefix typescript run check`: typecheck and all **209 tests passed**.
- Clean configuration with fresh HOME: `configure`, Kimi Code, environment credential source; successful preferences persist without secret values.
- Malformed CLI argument exits 2; an existing `demo --directory` exits 1 without overwrite.

## Recording edits and known limitations

`pan-agent-demo.mp4` concatenates the first 27 seconds of rendered live task footage and 14 seconds of separately recorded replay of that same run (41 seconds total). Headers identify live versus replay-only. Input was automated, long idle gaps shortened; no fake UI or second real-model attempt. The original live capture's attempted replay was swallowed by the run-list overlay; that tail is excluded from the finished video and retained in source evidence. The later capture explicitly closes the overlay before issuing replay.

The renderer approximates colors and uses local Menlo. Original live UTF-8 capture decoded read chunks separately, so a divider contains a replacement glyph in some frames; task/result text remains readable. Subsequent captures use an incremental decoder. Raw PTY bytes are retained unchanged. This is a terminal capture, not a screen recording of a desktop terminal application.

Private incidental user data and the configured credential were not included. The shown paths name only the newly created disposable demo workspace; the final release should receive independent media inspection before upload. No provider reasoning text is published by these artifacts.

## Decisions and failures retained (§17)

Human chose a TUI learning artifact and constrained closeout, Builder implemented packaging/docs/capture. An initial `npm --prefix typescript pack` invocation did not pack that directory; the documented command now changes into `typescript` explicitly. Two capture defects were found before handoff: manifest completion uses `settled_state`, and `:runs` requires closing its overlay before another command. An exit-time PTY EIO race was handled in the recorder. No product behavior was changed to hide these failures; no second live task was made. Early offline attempts remain diagnostic only.

## Release checklist

- [x] Build and clean install supported host package.
- [x] Actual installed live task, output and same-run replay video.
- [x] Package/capture/archive/video hashes in manifest; checks and limitations retained.
- [ ] Independent Regulator acceptance of pushed SHA.
- [ ] Human license choice; approved LICENSE/NOTICE/package inclusion and fresh review if changed.
- [ ] Master PR integration and public GitHub Release/video upload.

No npm publication, public Release, tag or main push was made by Builder. No project/resume facts are promoted. [Demo](../../demo/tui-release56/README.md) · [Licensing inventory](../../demo/tui-release56/LICENSE-INVENTORY.md).
