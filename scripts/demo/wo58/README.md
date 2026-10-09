# #58 offline presentation helpers

- `replay.mjs`: installed RunArchiveStore verification/read followed by metadata-only auxiliary projection; accepts one sealed copy and refuses unsealed/symlink inputs.
- `offline-guard.cjs`: rejects network and child-process calls in the replay/check process, records attempts on exit. Defense for these offline helpers, not a general-purpose OS sandbox.
- `check-replay.mjs`: real installed CLI compact TUI :replay test with injected model/tool traps, zero-call assertions, synthetic canary projection test, corrupt-byte negative and archive hash conservation. Private CLI text stays outside Git.
- `capture.py`: one private PTY capture of the auxiliary reader, safe still-frame MP4 rendering, ffprobe and full decode. No arbitrary live command, desktop, microphone or camera capture. Existing ffmpeg/font paths are macOS-specific.

See [recording procedure](../../../docs/demo/wo58/recording-plan.md), [source navigation](../../../docs/demo/wo58/SOURCE_OF_TRUTH.md) and [scope gap](../../../docs/demo/wo58/scope-challenge.md). These tools do not implement a model loop, modify product code, sign activations or launch tasks. Raw paths/logs/media are local only.
