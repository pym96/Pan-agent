# #108 Criteria1.0 — Builder evidence

Baseline `f1df4b8e2de3de7850fa99db951943384c4ebbea`; branch `workorder/108-candidate`. [Contract/activation](https://github.com/pym96/Pan-agent/issues/108#issuecomment-6076378783). Product candidate; independent Regulator pending. C-WEB108-03 requires the contract's extra independence; this report does not replace it or repeat #107's historical Human review.

## Delivered

[App/API/setup](../../../apps/evidence-web/README.md), [design](../../design/pan-web/README.md), [executor](../../../apps/evidence-web/executor/README.md). Bundle-bound conversations, transaction-allocated order and idempotent request identity, append while running, execution-time public context, missing-prerequisite blocking and restartable history. New Pan session per task; existing public initialMessages carries completed public questions/answers/sources. No core/Provider/TUI/Run Archive changes. Old tasks remain legacy, not fabricated conversations.

The fixed historical report SHA256 is `f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab`. First real offline computation returns89rows,18success/5valid_failure/20unscored/20unknown_interrupted/26not_started,23valid scores. Follow-up Python reads the same input, checks the prior answer and calculates5valid_failure rows with original pointers/hash, score/null distinctions and CSV. Synthetic B input changes one unscored row to valid_failure; first answer24scores and follow-up6rows are explicitly synthetic, not official results. Segment7 usage remains scoped to that segment; no invented root cause.

## Evidence

Private root `/Users/panyiming/.local/state/pan-agent/web108/`. The SHA-bound Handoff and inventory in evidence/ bind raw outputs and task archives; no credentials or private traces are uploaded to GitHub.

- `evidence/first/`: actual HTTP/PostgreSQL/Pan/Docker lifecycle. Signal-controlled first task stays running while12concurrent duplicate follow-ups produce one task identity; different content409, different IDs allowed, sequences stable. Frozen snapshot includes only completed preceding turns; actual adapter-received messages prove the answer reached Pan. Different conversation starts with empty context; B's changed input computes different results. Cross-account/anonymous conversation/task/source/artifact and append checks pass. API restart during held execution preserves queue/order. Model failure and Worker kill block successors with identified prerequisite and no tool/model events; an independent conversation proceeds. Database/app restart preserves exact result/context/CSV.
- `evidence/browser-final/`: real Chrome page append while first held, queued state, controlled release,5rowCSV, source click, visible context, inert script text and history after reload. Screenshots retained and inspected. The actual Pan input snapshot also includes current task/question/sequence identity.
- `evidence/migration-final.log`: old001/002schemas + explicitly synthetic legacy account/bundle/task/result/CSV rows, migration003 applied twice, content/state identity preserved, no fake legacy context; schema rolled back. No #106/#107 runtime data operated on.
- `evidence/regression107/`: all existing31checklist assertions retained, including real Docker configuration, failure/retry, interrupted cleanup, no replay and persistent results. Only test container namespace is configurable for the new issue.
- `evidence/regression106/`: original import/account/source/download/browser/database restart checks. Existing tests remain available.
- `evidence/edges/`: explicitly synthetic missing-answer and over262144byte answer fault injection into owned test database; descendants blocked before model/tool invocation. No silent truncation or fabricated prior answer.
- Go race/vet, frontend build, final identity/path/link/scope checks and resource sample are retained alongside the full build/evidence inventory.

Check counts are checklist entries, including endpoint/account combinations, not independent experiment counts. The Handoff states final command outcomes and exact hashes. Raw task directories keep input copies, context-bearing metadata, sealed archives, outputs, resource samples and stderr. The private PostgreSQL cluster remains intact; config/password files are excluded from the public inventory.

## Decisions and failed attempts

A conversation row lock was chosen to cover duplicate detection and sequence allocation in one transaction. It is sufficient for this single-Worker slice and does not claim distributed execution. The context freezes at claim time rather than submission, so queued follow-ups see the real completed predecessor. A262144byte limit blocks explicitly; no history is silently discarded. Keeping legacy tasks separate avoids inventing provenance. Container ownership became issue-configurable with defaultweb107 compatibility; core sandbox policies are unchanged.

The first browser probe observed stale queued UI state from the first task before the polling update and read its ID as the second task. It failed before release; test shutdown interrupted the held task, with data retained. The corrected probe waits for both the new ID and queued state, then releases explicitly. This was a test synchronization error, not evidence of overlapping execution. The initial migration probe supplied a connection URI through PGDATABASE alone; psql attempted its default socket. Explicit parsed PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE fixed the test connection. Both original failure logs and records are retained; no old evidence was erased or reused as a success claim.

Human supplied architecture/direction/criteria; Coding Agent implemented and tested; independent Regulator decides acceptance. No Human sole-implementation, new benchmark, performance gain or resume disclosure claim.

## Usage and boundaries

Zero real Provider/benchmark/scoring calls; all model outcomes are labelled deterministic Faux. Coding Agent Token/cost unavailable, recorded unknown. Own native PostgreSQL, Go/Web/Node processes and real Docker tests only. Existing Docker baseline48503971840bytes and all owned roots remain in cumulative accounting: owned+max(0,Docker-baseline)<57982058496, free>=21474836480. Default2CPU/4GiB, networknone, read-only input, task-only output, no credential/home/DB/socket mounts. Per-tool resource samples and final observation are retained; no measured-peak claim.

No public deployment, Redis, multi-Worker, continuous Provider-private reasoning, automatic execution recovery, cancellation/replacement or infinite context. Faux follow-ups demonstrate a fixed filtering scenario; they do not establish natural-language understanding. DB/local operators remain trusted. Historical Run Archives are sealed evidence, never continuation checkpoints. Unconfirmed stop still blocks new execution. Independent high-risk review is pending.
