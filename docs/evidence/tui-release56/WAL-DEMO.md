# Criteria1.4 — WAL recovery demonstration evidence

Builder candidate for [#56 Criteria1.4](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6191007497), based on `e7645d97fbd06b0d93186414c7de491d662d2f70`. No acceptance or publication is asserted here. [Viewer explanation](../../demo/tui-release56/WAL-DEMO.md) · [Artifact manifest](wal-artifact-manifest.json) · [Edit map](../../demo/tui-release56/wal-edit-map.json).

## Identity and task boundaries

The installed tarball is the published v0.1.0 package: SHA256 `28c20fe51a2d99f8a03d635c6ba373fc6fdf6e81032ad0985769777afe77596a`. Runtime source, installed TUI and provider implementation are unchanged. Installation used a fresh consumer directory with an empty npm cache. The new v0.1.1 delivery is media/documentation only; v0.1.0 artifacts remain immutable.

Historical source: `docs/evidence/terminal-bench-full-live-97-summary.json`, leaf `previousCriteria112Launch/previousCriteria111/previousCriteria19/previousCriteria18/aggregate/rows/18`. Run `eecf5765-a6fe-47ab-9286-aa825fa0aba7`, task db-wal-recovery, official seven tests passed. A private hashed extraction preserves this historical identity.

New run: `2f9d0adb-ba86-47fe-8b38-f34d24db34ba`, model Kimi Code k3-256k/high, actual installed TUI, macOS arm64, Node v26.7.0, 120×38 PTY. Original archived task inputs were copied without SQLite opening. The Dockerfile's encrypted-WAL destination mapping is preserved; `/app/` becomes the disposable workspace. This is an adapted demonstration, not a new official score. Tests and oracle solutions were not exposed to the agent.

## Observations and verification

One live task, eleven model exchanges and eleven tool results (bash 8, write 2, edit 1). Two tool errors are retained. Usage records: eleven known, zero unknown; input 49,050, output 3,806, total 52,856. Raw capture duration 371.137 seconds includes operator approvals and local replay/navigation, not just model execution. The edited video is 129.8 seconds with explicit speed/cut mapping.

The model preserved original files, decoded the XOR-obfuscated WAL, corrected checksum endianness after a failed assertion, and extracted eleven records. A later WAL read failed after SQLite checkpointing; the model inspected its preserved encrypted original and confirmed the missing names in the last commit frame. No Builder edits to model implementation/output.

After settlement, the original seven upstream test functions were executed with only `/app/` replacement, all passing. Original tests SHA256 `88dc5c2a3abba75bca0e0f9136223ae5bb585d5984b8d9eba51a7829c1d2ba49`; both original/adapted files and report are retained privately. Model-created `.orig` backups match original input hashes.

The replay probe imports the installed executable's replay seam and rejects provider/tool/network sends, measuring zero in each category. Archive hashes before/after are equal. Separate credential-free TUI captures inspect that same sealed run; these are labeled archive detail rather than live execution. The earlier detail captures remain diagnostic evidence, not extra model attempts.

## Presentation and privacy

The edit map identifies every source interval and crop. Three zooms expose the checksum failure, exact model edit, and passing checksum output; wider views restore task context. The second failure is shown rather than removed. A final annotation distinguishes independently adapted checks from official scoring. Frames are generated from real captured terminal bytes using pyte, not a mock UI. Private ls owner output remains only in raw evidence and is excluded from public footage. Disposable paths contain no user identity.

Only the MP4 and its checksum are intended for public release. Raw captures, task originals, test files and run archives remain private review material. Benchmark task attribution remains Apache-2.0, separate from Pan MIT. Reproduction helpers require local Python rendering packages; the installed product does not.

## Decisions and limitations (§17)

Human requested a substantial real task and emphasized readable key points. Master selected a historically successful task; Kimi produced all recovery code, Builder prepared inputs, inspected approvals, recorded and edited, and ran post-task checks. No manual recovery solution was substituted.

Initial archived-detail navigation advanced only five lines per PageDown, producing mostly metadata. A later capture advances six PageDown keys and pauses on useful pages. Earlier captures are retained. This capture’s repeated detail-page navigation stopped changing near the second error; final completion is therefore shown in the main run view, while the full canonical archive remains independently inspectable. This is a presentation limitation, not evidence that later steps did not occur.

Both model mistakes occurred naturally. The first is verified by the failed assertion and exact subsequent edit; the checkpoint explanation is supported by the successful extraction, missing WAL file, and subsequent backup-based verification. No production reliability gain or aggregate benchmark improvement is inferred from this one task. Linux/Windows portability and another model's reproduction are not tested.

## Handoff / release

Private artifact root is supplied directly in Handoff. Manifest paths are relative to that root. Regulator reviews the exact pushed candidate SHA without repeating the billed task. Master alone integrates after acceptance and publishes v0.1.1 `pan-agent-wal-demo.mp4` and `SHA256SUMS`, then verifies downloaded hashes. Pending acceptance/publication status belongs here and in Handoff, not in the user-facing install flow.
