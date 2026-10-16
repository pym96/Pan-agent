# Criteria1.5 — Explanatory captions

Builder evidence for [#56 Criteria1.5](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6206828599), baseline `e181a3ef00ad8b8bb55eb7aa74d984f0cb01a14b`. This is a media-only follow-up, not a resumed Runtime implementation. [Viewer instructions](../../demo/tui-release56/CAPTIONS.md) · [Manifest](caption-artifact-manifest.json).

## Source and changes

All 63 accepted Criteria1.4 source artifacts were checked against their preserved manifest. Raw PTY captures, canonical archive, task inputs, test results, and v0.1.0 runtime package remain unchanged. The accepted v0.1.1 video SHA256 is `817649d1d615f1f84755771ddea13bfb48e6bfd2d782f3c28bf164888fb83c0a`. No new task, model invocation, tool execution or replay invocation was made in this captioning work.

The new [caption map](../../demo/tui-release56/wal-caption-map.json) preserves all eleven scenes' source file, interval, speed, crop and live/archive labels. Each scene now has two Chinese lines plus an evidence reference. Source chronology and 129.8-second duration are unchanged. The layout reserves the header for captions, scales the wide terminal to 1368×866 (about 95%) and preserves enlarged detail crops. Existing command/output text is not rewritten.

The first scene introduces WAL; later captions explain checksum, endianness, checkpointing and replay. The checksum error alone is not claimed to establish its cause: the caption says further inspection is needed, followed by the recorded edit and passing result. The checkpoint caption summarizes the later backup-based verification in the same recorded run. The final checks are explicitly post-task, locally path-adapted checks rather than a new official benchmark score.

## Validation

`check_wal_captions.py` verifies the 63 source hashes, unchanged source mappings, eleven consecutive subtitle intervals, exact SRT text/times, 22 line-width bounds, 129.8-second video duration and full FFmpeg decode. It extracts each scene's first, middle and final frame (33 images) and a contact sheet. Builder inspected these sampled layouts: Chinese glyphs are present, captions remain above terminal content, and live/archive/speed labels remain visible. Independent Regulator remains responsible for the final presentation and factual check.

The burned text and UTF-8 SRT are generated from the same caption arrays and output timestamps. Rendering is repeated offline into a separate reproduction directory; the resulting byte comparison is recorded in the manifest. The rendering environment and font hashes are recorded privately. Local system font files are not redistributed. On another host, font/FFmpeg changes may alter pixels or bytes and require renewed layout review.

No privacy-relevant footage was added: source intervals/crops exactly match the previously accepted privacy-scanned edit. New prose contains no private paths, credentials or provider reasoning. Public artifacts are only the new MP4, SRT and SHA256SUMS. Original Apache-2.0 task attribution and Pan MIT licensing remain in the linked original demonstration documentation.

## Decision record (§17)

Human found the original video insufficiently explanatory. Builder initially added two lines per scene; Master shortened the opening to fit six seconds and corrected wording that could overinterpret a checksum mismatch. The revised captions describe action, feedback and evidence without changing the recorded task. A draft render remains private for traceability. The issue was viewer understanding, not a new runtime defect or a new benchmark achievement.

## Release boundary

Target v0.1.2 contains `pan-agent-wal-captioned.mp4`, `pan-agent-wal-captioned.srt` and `SHA256SUMS`; executable remains v0.1.0. Prior Releases and evidence are untouched. Candidate SHA/Handoff and private artifact directory are provided to Master and independent Regulator. Acceptance, integration and public download verification belong to them; Builder has not published or merged.
