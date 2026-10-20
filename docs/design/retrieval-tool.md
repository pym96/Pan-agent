# Selected-source retrieval — #144 Criteria1.0

This adds one `retrieve({query, limit?})` tool to the ordinary installed Native TUI. It uses the existing GeneralAgentSession → NativeKernel → AgentTool → observation/archive path. The CLI configuration command makes no provider call. A scripted model verifies integration; no live-model effectiveness is claimed.

## Operator selection and permission

Retrieval is off until the operator runs `pan-agent retrieval configure --workspace DIR --from selection.json`. The selection contains workspace-relative `documents` directories and optional `history` archive root, `ledger: true`, and `runbook` file named `RUNBOOK.md`. No automatic home, account, browser, other-project or chat-store discovery. Settings persist at the selected workspace's `.pan-agent/retrieval.json`; provider credentials/settings remain separate. `retrieval show` inspects the selection; `retrieval disable` clears it. Reconfigure to remove or replace sources. An interrupted/invalid config fails closed.

Source roots and workspace are pinned by path/device/inode. Directory contents can change; replacement of a selected root (including atomic replacement of a directly selected Runbook/ledger file) requires explicit reconfiguration. Every tool call reloads config, requests **Allow once** through the existing approval UI, and binds the decision to invocation/run/call/query, config revision, source identities and policy revision. Denial, revocation, cancellation or config/root replacement invalidates it. Shell trust does not authorize retrieval.

Each document read additionally applies existing protected-path policy (`.git`, `.ssh`, `.pan-agent`, `.env`/variants, `.npmrc`, configured protected paths), rejecting protected or uncertain resources rather than prompting per file. The narrowly selected own-memory lane may cross the workspace boundary and `.pan-agent` ancestor **only** for `runs/<safe-run-id>/manifest.json`, `events.jsonl`, the selected `retrospective-ledger.jsonl`, or selected `RUNBOOK.md`. This does not permit provider settings, arbitrary memory files, `.ssh`/`.git` or configured protected paths. Hardlinks, symlinks and ambiguous/nonregular objects are unsupported. Existing no-follow file handles verify identities before reads; new bounded reads check size and changes during reading. Checks are application checks, not an atomic filesystem transaction or OS sandbox.

Retrieved text cannot invoke configuration, grant permissions or execute commands. It is marked untrusted in both tool description and system prompt. The model may reference it; any later tool use still needs its own normal authority. Selected ordinary documents/history can contain sensitive prose; there is no generic secret detector or redaction claim. Select only material suitable for the chosen provider. Credential-pattern files are excluded, but arbitrary text is not automatically safe to disclose.

## Data flow and freshness

No persistent derived index is written. Each call scans a bounded fresh in-memory snapshot, chunks and ranks it, validates config/authority again, and discards it after returning. Thus restart, deletion and deselection do not require cache invalidation. Old result IDs cannot read stale content: there is no read-by-ID operation. A citation denotes bytes observed in that call, not a globally atomic filesystem snapshot. Re-query for freshness; source hashes distinguish revisions.

History ingestion uses `verifyArchiveBytes` on bounded handle-read bytes and requires a valid seal, matching identity/count/hash chain and terminal-state shape. It never calls ArchiveStore.open/recover or edits source memory. Only `run.started.task` and `model.turn_settled.text` are ingested; raw provider reasoning, checkpoints, tool-output dumps and arbitrary unknown fields are not. Unsealed/corrupt/unreadable runs produce partial diagnostics. Interrupted/cancelled/failed histories remain labelled with their settled status.

Ledger rows are independently validated, not trusted merely because `RetrospectiveLedger.list()` can parse them: schema, sequence, unique entry identity, body, kind, verified archive head reference, and backward supersedes reference. Cycles, dangling/foreign hashes, malformed rows and ambiguous blank-line layouts fail the whole ledger source. Explicitly superseded entries are returned as `superseded`; remaining entries are `retrospective_not_current_guidance`. Runbook is `current_guidance`. Neither lane invents semantic conflict resolution or event timestamps; no creation-time claim is made from order/mtime.

## Ranking and provenance

A small `Ranker` interface separates ranking from ingestion. Default ranking lowercases Unicode text, extracts letter/number/underscore terms, requires **all terms** in a chunk, and scores term count plus occurrence frequency. Contiguous Chinese phrases are exact terms. No stemming, embeddings, paraphrase recall or fuzzy semantic match. Long-distance terms split across chunks may not match. Hash-ID tie breaking is deterministic for the same paths/bytes. No match returns explicit `empty`; incomplete scans return `partial` even when no match appears.

Each result contains source kind/path, SHA-256 revision of complete file bytes, `ret-` identity, exact snippet, UTF-16 `[start,end)` offsets and status. Archive/ledger fields additionally carry 1-based JSONL line, field selector, run ID and/or entry ID/supersedes. Reconstruct a citation by hashing the original UTF-8 file, selecting its declared decoded field (or whole decoded file), then slicing offsets. Filenames alone do not establish truth. Binary/invalid UTF-8 is rejected; a UTF-8 BOM is retained for document hash fidelity.

## Fixed limits

| Limit | Value |
|---|---:|
| Selected sources | 8 |
| Directory entries across scan | 1024 |
| Attempted source files | 128 |
| Aggregate decoded UTF-8 bytes | 4 MiB |
| Ordinary file / Runbook / ledger | 256 KiB |
| Sealed events file | 1 MiB |
| Manifest / config | 16 KiB |
| Recursion depth | 12 |
| Derived chunks | 4096 |
| Chunk length | 800 UTF-16 code units |
| Query length | 256 UTF-16 code units |
| Returned results | default5, max8 |
| Model-visible result JSON | 64 KiB |
| Diagnostic samples | 32, path preview256 code units |

Counts include attempted files, bytes, derived chunks, matches, returned results and total diagnostics. `resultTruncated`, `diagnosticsTruncated`, sampled reasons and `pathTruncated` expose limits; no complete-success claim is made for skipped/failed required sources. Directory traversal is sorted within admitted entries; exceeding the entry budget reports incompleteness (the admitted subset may depend on filesystem enumeration). Ranking determinism applies to the same admitted snapshot, not an oversized changing tree. Cancellation yields between source items and checks before every bounded read; there are no post-cancel index writes. Scan cost is paid each call. A sealed run with events larger than1MiB is excluded with `source_too_large`, so this version does **not** search all long-task histories. Use existing archive replay/inspection for that run; never truncate or rewrite a sealed archive to fit retrieval. Narrow directory selection when file/aggregate limits are reached. Raising caps or streaming very large archives is a future change, not an implicit fallback.

## Verification and distribution

[Predeclared synthetic query manifest](../evidence/retrieval-tool/queries.json), focused negative tests and installed-package demo cover the vertical path. The demo uses real installed CLI, DailyWorkspace permission keystrokes, NativeKernel and sealed archives with only a scripted offline adapter. Replay sends no new request. The package has no new runtime dependency. Full Product regressions and clean production-only install are required. C-RET-03 additionally needs independent and Human/different-family boundary review before integration.
