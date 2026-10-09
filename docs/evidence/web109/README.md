# #109 Criteria1.0 — Builder candidate evidence

Baseline `db822cc0f353f998da7221ef5d6ed6a68aa5019a`; branch `workorder/109-candidate`. [Contract/activation](https://github.com/pym96/Pan-agent/issues/109#issuecomment-6078562012). Independent Regulator pending, including C-WEB109-03's additional independence. No self-acceptance or project/resume fact registration.

## Delivered behavior

[Runnable app/API](../../../apps/evidence-web/README.md), [design](../../design/pan-web/README.md), [executor](../../../apps/evidence-web/executor/README.md). Persistent control intentions, distinct append/cancel/replace UI, Pan cancellation through an owned structured Node channel, confirmed-stop admission, revision links and withdrawn old suffix. Context comes only from the valid completed active prefix. Old questions, artifacts, trace/archive and known/unknown usage stay attached to old tasks. No core TypeScript, Provider, TUI or Run Archive protocol changes.

Queued cancel is atomic with no model/tool execution. Running cancel stays cancelling until the owned child exits and its labelled Docker container is confirmed absent. Replacement has a new task/sequence/replaces identity and does not run early. Same control request returns its original response; conflicts reject. Conversation and task transaction locks decide completion/cancellation order. If completion wins, success stays; if cancellation wins, late completed envelopes remain attemptResult, never replacement success. Unknown stop pauses admission; restart only checks stops and can then admit waiting new work, never replays old execution.

## Evidence and verification

Private root `/Users/panyiming/.local/state/pan-agent/web109/`; raw evidence, build inventory and SHA-bound Handoff in evidence/. Task directories retain input copies, context metadata, stdout/stderr, archives, outputs and per-tool resource samples. Private database/credentials remain outside the public inventory. The issue Handoff binds exact candidate and file hashes.

- `evidence/final/`:38finite API/DB/Pan/Docker checklist entries. Actual controlled Docker tool is cancelled, Pan receives cancellation, child/container stop precedes replacement start. Valid completed prefix survives, old queued suffix becomes superseded without execution, actual replacement calculates5valid failures/CSV from the fixed report. Unauthorized controls, wrong conversation and client PID/container injection denied; a separately labelled non-analysis sentinel container and local process survive. Same/different replacement IDs, two concurrent replacement contenders, both completion/cancel orders, unknown stop, API restart, rejected unconfirmed restart and Worker death during cancellation are exercised with explicit event/file/process barriers.
- `evidence/browser-final/`: actual page replacement impact disclosure, cancelling response, cancelled/superseded history, actual replacement89row/23score computation and CSV/source link, inert script text, separate cancel action. Screenshots retained and inspected. Initial cancelled task was before any valid prefix, so replacement correctly starts from empty public history.
- `evidence/retention/`: late completed envelope plus unconfirmed stop; repeated cancelling and terminal cancel identities; artifact download denied before stop confirmation, exact original CSV and known Faux usage available after stop-only recovery. The late result remains an old attempt.
- `evidence/migration.log`: real old schema and synthetic legacy result/source/artifact rows,004 and replay003/004, preserved bytes and cancellation state; rolled-back private schema. Ordinary app/Worker restarts exercise the new migration hash ledger.
- `evidence/regression108/`, `regression107/`, `regression106/`: existing conversation/context/idempotency/restart and task/import/isolation behavior. Test changes only select the owned issue namespace and recognize cancelling as nonterminal; old external assertions retained.
- Go race/vet, frontend build, final API state/interval readback, isolated Docker canary, build/image identity, paths/links/append-only scope and final resource observation are indexed in the Handoff.

Input remains historical `docs/evidence/terminal-bench-full-live-97-summary.json`, SHA256 `f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab`. Statistics89rows,18/5/20/20/26 and23valid scores; follow-up5valid failures preserves exact rawReward/validScore/null/pointers. No new benchmark evaluation or root-cause invention. Existing synthetic B contrast stays synthetic.

## Failures and design corrections

Initial startup replayed migration003's old state constraint over a newly cancelled row, preventing Worker startup. Builder added serialized transactional migration receipts with SQL hashes and made pre-ledger003 replay recognize the newer state marker. Existing failed rows were retained and the same owned database was upgraded, not reset.

The next probe found a missing control.stop_confirmed event: PostgreSQL could not infer a jsonb_build_object parameter type. The actual child/container had stopped; the explicit text cast restored the audit event. Another probe found terminal cancel returned an error because an earlier no-row lookup error remained in the local variable; clearing it before the no-op terminal branch restored the required preserved terminal response. Both failures and the real prior execution remain in evidence.

The first late-result test treated cancelling as terminal via an inherited wait helper. The helper now continues until a real terminal state. The initial browser test used an asynchronous wait predicate whose Promise was accepted before the intended event was observed; it now explicitly reads and verifies running state plus the waiting event. Its leftover owned queued task was cancelled through the API, with a receipt, and history kept. These test corrections do not erase failed records or bypass behavior assertions.

Graceful cancel gets5seconds before a possible owned-child force stop; this bounds waiting rather than asserts completion. Container cleanup has30second context and requires real identity/absence checks. A stop failure remains unknown regardless of elapsed time. Single Worker/global admission protection is preserved instead of promising distributed recovery. Revisions retain history and only change which branch supplies future public context. Human direction/architecture, Agent implementation and Regulator verification remain separate.

## Scope and usage

Zero real Provider, benchmark and scoring calls. Faux usage is test data; missing settlement is unknown, not zero. Coding Agent Token/cost unavailable. Observable timestamps, raw model/tool events and intermediate failures retained; checklist counts are not independent experiment counts. Only own new database/ports8109/54109, processes, analysis containers and explicit sentinel were managed. No old runtime/activation, shared prune, Desktop allocation or main changes.

Cumulative accounting keeps original Docker baseline48503971840bytes and all old/new owned roots: owned+max(0,Docker-baseline)<57982058496 and free>=21474836480. Default analysis2CPU/4GiB, networknone, read-only input, task-only output; no host home/DB/credential/socket mounts. The sentinel was a separate non-analysis control at0.1CPU/32MiB and was removed only after verifying its identity/survival. Timestamped samples are not measured peaks.

Offline/Faux only; no language-quality, Provider continuation, checkpoint recovery, exactly-once, multi-Worker, Redis or public deployment claims. Local operators/DB administrators remain trusted. Test barriers/stop-denial marker are private operator fixtures, not HTTP/model capabilities. Independent high-risk review remains required.
