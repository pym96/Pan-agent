# Recording and editorial plan

## Stage A sample and commands

The sample is an 8-second still presentation of real historical event metadata captured through a private PTY, rendered to 1280×900 H.264/yuv420p MP4 at 15 fps, without audio. It is not screen recording, native interactive TUI footage, real-time playback or the new demonstration. The frame visibly labels these limits. No macOS screen/microphone/camera permission is used. No whole-desktop capture occurs.

Resolve ENTRY, ARCHIVE_COPY and RUN_ID from the private preparation Handoff. ENTRY is the hash-verified installed #103 product. ARCHIVE_COPY must contain exactly one sealed historical run. OUT must be a new local evidence directory. Run from the candidate root:

```sh
python3 scripts/demo/wo58/capture.py --entry "$ENTRY" --archive "$ARCHIVE_COPY" --run-id "$RUN_ID" --output "$OUT"
```

This starts a dedicated PTY containing ONLY `replay.mjs` under the network/child-process denial guard; it never launches a live evaluation. Capture stops at child EOF. Ctrl-C cancels capture; any partial output stays as evidence. The script invokes ffmpeg/ffprobe for rendering and complete decode. `pty.json` includes private argv paths and belongs in original evidence, not the release copy. Only reviewed MP4/captions are disclosure candidates. The sample uses English labels to avoid unavailable CJK font assumptions; final subtitles below are Chinese draft text.

For actual installed CLI compatibility verification (offline injected adapter/tool traps, real compact TUI command handler, not proof of interactive visual layout):

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin WO58_GUARD_LOG="$GUARD_LOG" \
  /opt/homebrew/bin/node --require ./scripts/demo/wo58/offline-guard.cjs \
  ./scripts/demo/wo58/check-replay.mjs "$ENTRY" "$ARCHIVE_COPY" "$RUN_ID" "$PRIVATE_CHECK_OUT"
```

The native output is private: it can contain paths and raw tool text. The auxiliary presentation uses a strict metadata allowlist; all free-form model text, tool arguments/results, arbitrary identifiers and reasoning are withheld. A synthetic canary-tainted projection input is labelled and stored separately from the untouched sealed source. It is a redaction test, not another run.

## Stage B planned edit (not executed)

| Target time | View and draft caption | Required source |
|---|---|---|
| 0–15 s | “Pan + Kimi Code：一次独立日志统计任务。题目参考日期为2025-08-12。” | Newly signed task identity + public instruction |
| 15–75 s | “以下是本轮真实工具调用；等待过程已跳剪/加速。” | Same-run tool events; reviewed stdout/stderr excerpts with personal paths/secrets removed |
| 75–110 s | “实际产物与官方验证；失败或未评分如实保留。” | Same-run artifact file hash + official reward/CTRF or null reason |
| 110–150 s | “运行已经结束，读取同一轮封存归档；不再调用模型、不执行工具、不恢复容器。” | Same-run sealed archive ID and event sequences |
| 150–165 s | “这一题不代表总体能力。已知/未知用量分别记录。” | Same-run ledger + package/runner identity |

Use a separate demo terminal. The live runner is headless; do not style it as native interactive TUI. Raw capture stays private. A signed run command is deliberately absent until SC-VID58-01 is resolved and Master supplies activation; do not use this storyboard as permission. After execution copy the sealed same-run archive read-only, verify hashes, and replay through the proven installed reader. This historical sample must not appear as new-run footage.

The current metadata-only renderer does not show command/result payloads or artifacts and is not sufficient for a final C-VID58-03 video. Stage B requires explicit reviewed excerpts mapped to original events, plus official-score evidence. Do not claim this gap is already solved by the sample.

## Edit/source map template

For each clip record: source media SHA256; source time in/out; output time in/out; speed; cut reason; campaign/activation run ID; product archive run ID; event sequence range; artifact hash; verifier evidence locator; redaction notes. Null verifier remains null, and product cancellation is not an official failure score. Every introduced still/overlay is marked as presentation, not a captured product action.

No automatic task retry for better footage. Stop at official global-stop rules, preserve partial footage and report. Final MP4, subtitles, source map and disclosure copy require independent review and the existing Human review before any separately authorized upload.
