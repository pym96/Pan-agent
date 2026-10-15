# Recovering a SQLite WAL through the installed TUI

[Watch/download the database-recovery demonstration](https://github.com/pym96/Pan-agent/releases/download/v0.1.1/pan-agent-wal-demo.mp4).

A database exposes five rows although later records remain in its write-ahead log. Pan, using Kimi Code k3-256k, investigates the bytes, writes a recovery script, corrects a checksum-endianness mistake after a real tool failure, and exports eleven records. A second inspection fails because SQLite has already checkpointed and removed the WAL; the model returns to its preserved original to verify the missing rows. Both errors remain in the saved trace.

The video uses the **unchanged v0.1.0 installed executable**. Its live section is followed by separately recorded **archive detail** views and replay of the same run. Labels distinguish the sections and speed changes. The terminal display is rendered from original PTY bytes, not reconstructed dialogue or a replacement UI. Cuts omit waiting and navigation; annotations explain observed evidence.

## Scope and provenance

The task is adapted from [Terminal-Bench 2.0 db-wal-recovery](https://github.com/harbor-framework/terminal-bench-2/tree/main/db-wal-recovery), authored by Xiangning Lin, under the benchmark's [Apache-2.0 license](https://github.com/harbor-framework/terminal-bench-2/blob/main/LICENSE). Pan's MIT license does not replace the benchmark license. Original task/input/test files remain in the private review evidence; this repository does not redistribute them.

The historical benchmark run passed its seven official tests. This fresh demonstration is **not an official benchmark run or score**: it runs on macOS in a disposable directory instead of the task container. `/app/` is replaced by that directory; the encrypted input is copied to the task's expected `main.db-wal` name. The agent sees the task and inputs, not the upstream test source or an oracle solution. After completion, the seven upstream test functions are run with only that path replacement; all pass.

## Observed result

- One new live attempt; run `2f9d0adb-ba86-47fe-8b38-f34d24db34ba`.
- Eleven model exchanges and eleven tool results: eight shell operations, two writes, one edit. Two tool errors were corrected during the same run; no manual implementation edits.
- Eleven usage records: 49,050 input tokens and 3,806 output tokens; zero unknown usage records.
- Originals preserved byte-for-byte; recovered JSON contains eleven sorted records. Independent adapted checks: seven passed.
- Same-run replay probe: zero provider, tool or network calls; saved archive unchanged. This verifies replay, not continuation of execution.

## Reproducing the recording

Install the v0.1.0 tarball from the main README into a fresh `consumer` directory. Prepare disjoint `workspace`, `archives` and `home` directories. Copy the original database and encrypted WAL without opening them with SQLite; keep source copies outside the workspace. Put the adapted original instruction in `prompt.txt` and configure the isolated home for Kimi Code with an environment credential. Never place credentials in the prompt or arguments.

`scripts/record_wal_demo56.py ARTIFACT_ROOT live` starts the installed executable in a real PTY. The operator inspects each pending shell/write approval, then creates the matching `approve-REQUEST_ID` marker; the recorder selects **Allow once**. It does not implement the task. `details3` opens only archived views with credential variables removed. The recorder leaves all raw captures and failures intact.

After settlement, run `python3 scripts/verify_wal_demo56.py ARTIFACT_ROOT ORIGINAL_TEST_OUTPUTS_PY` against the original upstream tests outside the agent workspace. `scripts/verify_wal_replay56.mjs` checks the installed replay seam with provider/tool/network counters. Render with `render_wal.py ARTIFACT_ROOT EDIT_MAP OUTPUT.mp4` using Pillow, pyte and FFmpeg; local Menlo is used without distributing the font. Colors are approximated, while terminal text and positions come from PTY bytes.

[Edit map](wal-edit-map.json) · [Evidence and artifact identity](../../evidence/tui-release56/WAL-DEMO.md). Source paths in the video identify only the disposable demonstration directory. The original v0.1.0 video remains available unchanged.
