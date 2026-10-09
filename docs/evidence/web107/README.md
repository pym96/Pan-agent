# #107 Criteria1.0 — Builder evidence

Baseline `6a0c0ec161af8f03489337aed70983e3b04d87f4`; branch `workorder/107-candidate`. [Contract and activation](https://github.com/pym96/Pan-agent/issues/107#issuecomment-6075583845). Product candidate; independent Regulator pending, with different-model-family review required for C-WEB107-02.

## Delivered

[App and reproducible commands](../../../apps/evidence-web/README.md), [design](../../design/pan-web/README.md), [executor boundary](../../../apps/evidence-web/executor/README.md). PostgreSQL tasks/events/artifacts, single Go Worker, public Native Pan consumer and a real network-disabled Docker analysis tool; React question/status/answer/source/CSV/trace view. Original #106 imports/accounts/source views retained. Thin consumer does not replace the Pan loop, change core TypeScript or parse Provider reasoning.

Input: historical report `docs/evidence/terminal-bench-full-live-97-summary.json`, SHA256 `f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab`. Container Python calculates89 top-level rows:18success,5valid_failure,20unscored,20unknown_interrupted,26not_started;23valid scores. Segment7 only:1known/1unknown,470input/161output. CSV preserves rawReward/validScore/null and per-row file/hash/JSON Pointer. These are imported report statistics, not new official scores.

## Builder checks

- C-WEB107-01: real HTTP/DB queued task, actual Native Pan tool call and Docker result, sealed archive/run identity, calculated counts and exact89CSV rows/pointers. Actual browser submission, source click and CSV download. Account B's intentionally modified synthetic input yields24scores/6valid failures, demonstrating input-dependent calculation.
- C-WEB107-02: account/anonymous admission, task/result/event/source/artifact denial; input hash unchanged; actual container configuration and harmless write/network/host/socket/credential canaries; traversal and symlink artifact rejection; browser script text inert. This is Builder evidence, not the independent high-risk verdict.
- C-WEB107-03: exit7 tool feedback reaches Pan, followed by successful tool execution; terminal model error remains failed with unavailable usage; actual Worker SIGKILL produces interrupted/unconfirmed state, then owned stop reconciliation without replay; second Worker rejected; app/PostgreSQL restart retains byte-identical successful result/CSV and interrupted status.
- Original #106 integration regression passes. `go test -race ./...`, `go vet ./...`, frontend build and public Pan copy build pass. Worker configure/start/stop helper exercised with no queued work.

Raw private root `/Users/panyiming/.local/state/pan-agent/web107/evidence/`: `first-real/result.json` contains31 checklist entries (including repeated ownership combinations), `first-real/` retains task/event/error/interrupt/config/process evidence; `browser/` has7checks and screenshots; `isolation.log` points to retained canary outputs in runtime/isolation; `regression106/`, build logs, Go logs and final delivery checks are preserved. Inventory binds evidence and task inputs/archive/output; private PostgreSQL credentials/DSNs are excluded from public summaries. The Handoff binds the exact candidate SHA and raw inventory hash.

Runtime `/Users/panyiming/.local/state/pan-agent/web107/runtime/` retains the owned PostgreSQL cluster, runtime app, task copies and public Pan build. Compiled identity, full build inventory, pinned image and resource sample are retained privately. Existing #97/#106 evidence and cached images were not deleted. No original report or activation was modified.

## Boundaries, usage and cases

Faux is deterministic scripted integration input, clearly labelled in UI and usage; it cannot establish natural-language quality or live-model accuracy. Real Provider sends0, official benchmark/scoring calls0. Coding Agent Token/cost usage is unavailable and recorded unknown. Resource gates include previous owned roots, Go caches, PostgreSQL, new task state and Docker growth against the original48503971840baseline; limit57982058496 cumulative bytes and minimum21474836480free. Timestamped samples are observations, not a claim of measured peak. Default container2CPU/4GiB, no Desktop allocation changes. Fixed Python standard-library image avoids networking in analysis or a dynamic dependency installer.

The initial harness command used a duplicated app-relative path and did not run; it was corrected and the failed log retained. Final helper checking initially mistyped the image SHA at the shell; image inspect refused, no task started. Configuration then resolved the actual image ID and helper start/stop passed. Implementation review corrected cleanup-context lifetime (allocate at cleanup rather than task start) and included failed-but-unconfirmed tasks in restart reconciliation before the successful lifecycle suite. These are local development corrections, not benchmark incidents.

Human supplied direction/architecture/criteria; Coding Agent implemented and tested. No performance gain or Human sole-implementation claim. Model-provider errors and process loss retain honest unknowns; there is no automatic continuation, distributed takeover, cancellation UI, conversation context, Redis or public deployment. Local operators/DB admins are trusted. Raw trace contains private evidence and stays local. Same-SHA independent verification remains required.
