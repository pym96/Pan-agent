# Original Harbor task demonstration

[Watch the 2:31 Chinese-captioned video](https://github.com/pym96/Pan-agent/releases/download/v0.1.3/pan-agent-harbor-demo.mp4) · [UTF-8 subtitles](https://github.com/pym96/Pan-agent/releases/download/v0.1.3/pan-agent-harbor-demo.srt) · [Checksums](https://github.com/pym96/Pan-agent/releases/download/v0.1.3/SHA256SUMS)

Pan recovers the original Terminal-Bench `db-wal-recovery` task, then Harbor's unchanged verifier reports **7/7 passed, reward 1**. This is one fresh demonstration after an external-launcher correction, not an aggregate benchmark score. The earlier timeout/unscored attempt remains separately recorded in [failure evidence](../../evidence/tui-release56/HARBOR-ATTEMPT.md).

## What runs where

The unchanged installed v0.1.0 TUI and NativeKernel run on a Mac, with Kimi Code `k3-256k`, high thinking, Chat Completions. An external launcher injects four container-bound tools through the existing supported seam. SSH carries credential-free tool operations to the dedicated server container. The bridge uses the pinned Harbor **DockerEnvironment and Verifier APIs**, not Harbor CLI or Trial. Original `/app` paths and original tests are retained; tests and oracle are not provided to the model.

The stock TUI's local-tool wording describes its ordinary launcher. This demonstration's banner and video disclose the external container binding. Runtime authority checks remain enabled. A typed approval channel grants each request Allow once only for the bound session/run, workspace and container tools; all other identities and aborted/closed phases are denied. This is explicitly automated approval, not a recording of manual approval.

Resources: 1 CPU, 2 GiB, no GPU; independent original 900-second agent and verifier phases; published runtime's inherited 64-round limit retained. Verifier dependency downloads use a temporary relay bound only to the owned Docker bridge and accepting only that container IP. It starts after agent stop and closes during cleanup; it does not change shared Docker or proxy settings.

## What the video shows

The actual model inspects files, encounters one command error, inspects hexadecimal bytes, decodes the WAL and exports 11 records. After confirmed agent stop, the original verifier runs in the retained environment. The recording ends with its test result and cleanup. Trace details and replay were separately captured from **the same sealed run**, clearly labeled. The independent replay probe refused provider/tool/network execution and measured 0/0/0 calls with archive bytes unchanged.

- Run: `14386b01-4934-4e58-b981-615bc60d341c`.
- Execution: `bca1c272-72bf-4f9c-93fa-4da6bead62e6`.
- Six model turns, five tool executions; input 20,461 and output 1,547 tokens, total 22,008; no unknown usage turns.
- Agent phase 51.516 seconds; verifier phase 380.538 seconds, mostly dependency setup. These are observed durations, not performance comparisons.
- Container stop and removal confirmed; no task rerun was made.

## Source and reproducible editing

[Edit map](harbor-edit-map.json) maps all 15 scenes to raw PTY timestamps, crops, speed changes and explicit held frames. Chinese captions appear above the terminal and exactly match the SRT. No old task footage is spliced into this new result. Raw task recording is 446.542 seconds; final video is 151.5 seconds, 1920×1080 at 10 fps, silent.

With private review artifacts available as `ARTIFACT_ROOT/live`, render using Python with Pillow 12.3.0, pyte 0.8.2 and FFmpeg 7.1.1:

```sh
python render_harbor.py ARTIFACT_ROOT/live harbor-edit-map.json pan-agent-harbor-demo.mp4
```

The renderer uses locally installed Menlo and Hiragino Sans GB; font binaries are not distributed. Raw PTY and sealed archives, bindings, dependency probes, official logs, accounting and media hashes are inventoried in the [evidence manifest](../../evidence/tui-release56/harbor-completed-manifest.json). These review artifacts are not the public video download and may contain internal deployment paths.

Task: [Terminal-Bench db-wal-recovery](https://github.com/harbor-framework/terminal-bench-2/tree/main/db-wal-recovery), author Xiangning Lin, upstream Apache-2.0. Pan-authored code remains MIT. The demo uses frozen original inputs, not a fresh download of upstream main. [Detailed provenance and outcome](../../evidence/tui-release56/HARBOR-COMPLETED.md).
