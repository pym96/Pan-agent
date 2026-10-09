# #110 Builder report — Criteria1.0 Stage A

Candidate branch: `workorder/110-candidate`. Baseline: `11cf0e621004c8702408dfafd305dfd9e3ff8172`. Full candidate SHA is bound by the immutable issue Handoff after commit/push. No main change or self-acceptance.

[Machine-readable results and exact evidence hashes](validation.json) · [Design / pending Kimi policy](../../design/pan-web/checkpoint110.md) · [Decisions and failures](learning-notes.md).

## C-WEB110-01 observations

The controlled probe terminates the first Node after a committed tool boundary and before its next exchange; the actual Worker confirms its stop. A fresh Node imports canonical messages plus adapter-owned synthetic state, continues the same Web task, and does not append another user or repeat stage1. New attempt/run/archive identities are separate. The final positive/control probe passes19 checks:89 rows (18 success /5 valid_failure /20 unscored /20 unknown_interrupted /26 not_started),23 valid scores, five CSV rows with exact source pointers/null/rawReward/validScore, and deterministic equality with an uninterrupted run. The resumed total is3 model exchanges/2 tool calls; distinct settlement accounting is3 known,0 unknown,6 synthetic tokens. It is not another benchmark result.

The actual browser passes9 checks for explicit restore, task continuity, attempt/accounting display, source navigation and CSV. An unrelated owned process/container survives interruption and resume. Screenshots and downloaded bytes remain private Evidence. The UI states Faux and unsupported real Kimi recovery.

## C-WEB110-02 observations

The commit and invalidation transactions are awaited barriers. An unsettled exchange, partial multi-tool round, persistence failure, missing/corrupt state or required files, and identity mismatch cannot trigger rollback execution. The negative suite passes40 checks; control/unsupported/input-identity probes9; live-PID heartbeat-loss/cancel probes4; concurrent identical resume plus changed-file bytes3. The latter verifies `checkpoint_file_hash` and no additional sends. The Product checkpoint tests3 are part of all206 passing current Product tests and typecheck.

RunArchiveStore performs only its existing interrupted recovery/sealing; original pre-seal bytes are separately retained. Sealed archives stay unchanged and are never reused. User resume is idempotent and consumes the point transactionally; cancellation/replacement and actual stop fence new admission. Final readback covers80 local test tasks, all terminal (33 completed,3 failed,15 interrupted,20 cancelled,4 blocked,5 superseded), with no queued/running/cancelling tasks.

Compatibility: #10938 controls and6 retention checks, #10837 checks, #10731 checks, #10636 checks, #109 browser8, real additive migration005, Go race/vet pass. No old assertions removed. A supplemental frozen #41 graph classifier fails identically on baseline and candidate for existing `attachments.ts`; it is retained as a non-applicable diagnostic. Source/path navigation and package verification are separate checks.

## C-WEB110-03 observations and review boundary

Account/conversation/task/attempt/bundle ownership comes from authoritative DB records; HTTP cannot import checkpoint bytes, hashes, paths, PIDs or container names. Anonymous/foreign/wrong-task/wrong-conversation cases are rejected. Private Faux state stays in protected checkpoint files/DB payload, with no synthetic marker in public API/Trace/log/archive/CSV scans. Real Docker remains network-none, read-only input/root, bounded, unprivileged, with task output only; six isolation checks plus symlink/traversal negatives pass. A known corrupt payload is not advertised recoverable.

This does not defend against the trusted local host/DB administrator and does not implement real Kimi private reasoning persistence. The storage-policy questions and ADR-0015 boundary are in the design. Independent Regulator must inspect the full remote SHA and primary Evidence; the high-risk boundary still needs the contract's different-family or finite Human review. Builder automation is not that gate.

## Delivery and retained originals

All original logs, fixture failures, stopped owned PostgreSQL state, archives, screenshots, checkpoint payloads and resource samples remain under `/Users/panyiming/.local/state/pan-agent/web110/`. The authoritative final inventory is `evidence/inventory-final.json` (2903 entries), SHA256 `ef6673a9829b79d046f2039d268316dc2b153cbe01b5952d1108178ea065a6f1`. Earlier `inventory.json` is retained as a pre-supplement snapshot; its live DB physical bytes necessarily changed on the documented final fixture restart.

Independent package `pan-agent-web110-890173ae8d63.tgz` SHA256 `890173ae8d630ac5c89f23bcf33134d961ce0874078d7ec827c066146615f2e2`; all82 extracted distribution files match the actual runtime distribution. The pinned Python image and Go binary/toolchain hashes are in validation.json. Final app/Worker/PostgreSQL and owned containers are stopped.

Real Provider/official benchmark/scoring calls:0. Coding-token total:unknown, not zero. Faux usage is explicitly synthetic. Cumulative host budget retained, no prune/reset; final measured bytes and thresholds are in validation.json. Human/Master set scope, Builder implemented/tested, independent acceptance remains pending. No project/resume fact promotion.
