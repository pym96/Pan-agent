# Explicit file input | WorkOrder #43

Contract: [activation, Criteria-Version 1.0](https://github.com/pym96/Pan-agent/issues/43#issuecomment-5581025788). Base `28b524deafaef3494a5c1865c5ad68c5635f1f74`. Builder candidate, pending independent review; the [obligation map](workorder-43-obligations.json) preserves every prior Product test and protects core implementation bytes.

## Use

Run the installed `pan-agent --kernel native --workspace /your/workspace`. At an idle draft boundary (start or after whitespace), type `@` and a literal substring. Up/Down choose a matching relative name; Enter selects that file without submitting the task. Type the prompt separately and press Enter again to submit. `a@b.test` stays ordinary text. Escape dismisses the picker and inserts literal `@query`; Ctrl-C dismisses it and retains the original draft and attachments. This explicit Escape path supports an ordinary standalone `@` without selecting or reading any file.

Ctrl-P or `:preview` displays full safe identities and snapshot content; Ctrl-R removes the last attachment; `:remove N` removes a one-based index. `:attachments` shows the current summaries. Selecting an existing path keeps one snapshot; remove/reselect is the explicit refresh operation. Commands retain attachments. Busy input remains a draft; Enter never queues a second task. `:details` and `:replay RUN_ID` inspect recorded snapshots after submission. The default display shows metadata, not file contents. All owned labels are English.

`--max-attachment-bytes 2097152` overrides the default **1,048,576 aggregate original bytes per draft**, inclusive. The public `maxAttachmentBytes` TUI option accepts a positive safe integer. Booleans, zero, negatives, fractions and unsafe integers fail before selection. This is the frozen v0 local resource policy, not a measured token or model-context limit. A selection failure retains the prior draft and attachments; no truncation, summarization, context compression or retry is added.

## Snapshot and selection boundary

The new [input module](../../typescript/src/input/README.md) discovers names/metadata only and captures bytes only after explicit selection. Git discovery uses `execFile` with literal arguments, `ls-files --cached --others --exclude-standard -z`, repository ignore metadata, disabled fsmonitor/untracked cache and no inherited global Git configuration. Hidden path components and symlinks are excluded even when tracked. Ignored untracked files are excluded; nonhidden tracked regular files remain eligible. Failed Git discovery fails closed. Git name output has a 16 MiB metadata ceiling; exceeding it is a local discovery error, without broader fallback.

Non-Git discovery visits nonhidden directories without following known symlinks. Selection rechecks eligibility and each path component, opens with `O_NOFOLLOW | O_NONBLOCK`, checks regular-file identity against pre-open metadata, and reads at most remaining budget + 1 in chunks up to 65,536 bytes. Oversize metadata is rejected before open. File and parent identities plus size/mtime/ctime are checked afterward; detected changes fail locally. Invalid UTF-8, NUL and nonregular paths fail with `AttachmentError.code`. UTF-8 decoding preserves BOM and requires original-byte roundtrip. The immutable snapshot holds relative path, original-byte SHA-256, byte count and text. Empty files are valid, including when the remaining byte budget is zero.

No submit/replay refresh occurs after edits or deletion. Names reflect filesystem enumeration (for example, host filesystem Unicode normalization); file content is never normalized. These are attachment-selection rules, not an OS sandbox or protection from an arbitrary concurrent malicious host user. Explicitly attaching sensitive contents sends and archives those contents; filtering names does not make that safe. No credentials or environment values are implicitly attached.

## Versioned user data

No-attachment tasks pass through byte-for-byte. Attached tasks are the literal prefix `PAN_AGENT_ATTACHED_TASK_V1\n` (one LF), followed by canonical `JSON.stringify` of an object in this order:

```json
{"format":"pan-agent/attached-task","version":1,"prompt":"original prompt","attachments":[{"path":"relative name","sha256":"64 lowercase hex characters","bytes":0,"text":"exact UTF-8 text"}],"integrity":"64 lowercase hex characters"}
```

The example hash placeholders are explanatory, not a valid recognized envelope. Attachment order is selection order. JSON string escaping preserves delimiter-like content, CR/LF, BOM and Unicode. `integrity` is SHA-256 over UTF-8 `JSON.stringify` of the same object **without** its final integrity field, with the same property order. Each attachment's SHA-256 and count must match UTF-8 encoding of its text. Recognition requires the exact full shape, version, distinct eligible paths, valid contents, count/hash checks and exact re-encoding equality. Anything else, including malformed or merely similar historical text, stays ordinary task data.

Integrity is a corruption/shape check, not a signature or proof of author identity. A fully valid user-authored envelope remains user data. The complete string goes through existing `GeneralAgentSession.runTask(string)`, canonical user content and `run.started.task`. No system role, ToolCall, private Provider field, record schema, Kernel, archive implementation or memory format changes. The input module imports only its own modules and Node builtins; the TUI consumes it above the unchanged session seam.

## Terminal boundary and review

All untrusted names, errors and contents pass through the existing reversible `terminalText` boundary. Multiline identities and content use controlled `framed` rows. Summaries visibly elide long identifiers; full safe identity and original hash/size are available by explicit preview/details. The UI's escaping is presentation only and does not alter Context bytes.

High-risk outputs **F-AUTH** and **F-DISPLAY** are written by [the real PTY verifier](../../scripts/verify_file_pty.py), with raw transcripts, control checkpoints, exact Adapter Context, per-file read targets, sealed archives and fresh-process replay hash checks at 40/80 columns. [Focused tests](../../typescript/test/file-input.test.ts) add denied paths, Git failure, filesystem races, bounded reads, invalid configuration and legacy envelopes. The independent Regulator must inspect those outputs and add probes. C-FILE-03/05 additionally need different-model-family review or explicit Human review of those named outputs before accepted. A Builder demo is not that acceptance.

## Reproduce and demonstrate

Use Node 22.19.0 and fresh output directories. `npm --prefix typescript run check` and `run conformance`; corresponding `references/pi` checks; historical Python full; unchanged without-Python gate; [current scope controls](../../scripts/verify_file_scope.py); unchanged #44 streaming, consumer and historical checks all remain required. Full command logs and artifact identities are retained in the SHA-bound Handoff.

```sh
python3 scripts/verify_streaming_consumer.py --node /absolute/node22.19 --output /fresh/consumer-proof
python3 scripts/verify_file_pty.py --node /absolute/node22.19 --package /fresh/consumer-proof/consumer/node_modules/pan-agent --guard /fresh/consumer-proof/consumer/verification/guard.mjs --output /fresh/file-pty
node scripts/demo_files.mjs --package /fresh/consumer-proof/consumer/node_modules/pan-agent
```

The demo creates a disposable Git workspace containing only two synthetic text files, injects a deterministic Faux Adapter, and streams a scripted acknowledgement of actual received snapshot count/bytes. It retains its archive. The Handoff supplies an executable wrapper that additionally verifies the full candidate SHA, Node binary, retained tarball, installed files and copied demo/guard hashes, then runs with an empty environment and offline guard. Human trial is voluntary; high-risk review is explicitly tied to F-AUTH/F-DISPLAY. Real Provider calls, real credential reads, balance queries and cost remain zero.
