# #119 Criteria1.0 — Builder candidate

Baseline `5bdfc4d5a87a6b9431cb94d34f2c0db4de180949`. [Formal contract/activation](https://github.com/pym96/Pan-agent/issues/119#issuecomment-6096287219). [Design, interfaces, dependency graph and compatibility mapping](../../design/pan-web/packages119.md). [Development failures and corrections](development-notes.md). [Navigation](SOURCE_OF_TRUTH.md).

The candidate separates Go responsibilities, makes execution authority explicit, and moves owner revocation/stopping out of read endpoints into independent supervised maintenance. SQL transaction ownership, migrated SQL bytes, HTTP business fields, fixed report classification and bounded cache behavior are retained. This is a Builder handoff, not an independent acceptance or a verified-project-facts entry.

## Evidence routing

Raw evidence/runtime: `/Users/panyiming/.local/state/pan-agent/web119/`. Public evidence bindings are recorded in [verification.json](verification.json) and [inventory-binding.json](inventory-binding.json); exact runtime files remain private for independent local review. The inventory covers failed as well as successful probes, installed package/binary identities and the stopped own services. Git candidate bytes are bound by Handoff commit SHA rather than included in a self-referential runtime hash.

| Criterion | Implementation / oracle |
|---|---|
| C-GO119-01 | `check119-structure.py`: actual compiled import graph, exported operations and byte-identical migration hashes. `TestProductConfiguration`: namespaces do not change mode; invalid modes/limits rejected. `TestExplicitAuthorityEveryEffect`: missing/zero/foreign/stale identities cause no child start, admission, checkpoint/receipt, event or result effect; valid authority still works. |
| C-GO119-02 | `TestQueriesReadOnlyAndMaintenanceBarrier`: actual PG SQL recorded for hit/miss/off, all SELECT-only while coordinator paused, then explicit cycle completion without HTTP reads; unknown stop and revoked-owner nonrevival. Actual #112 fault/live-stop/control probes exercise live Node/container, PG/backend loss, reconnection, cancel/replace and multiple coordinators. |
| C-GO119-03 | Final binary: conversation/order/isolation/restart, real double-container overlap, browser, #111 sealed archive/reconciliation/negative/boundary probes, #106 import/page/restart, unchanged SQL migration fixtures, Redis/PG service failures, complete cache JSON/tail tests, race/vet/build. Fixed 89 classifications = 18/5/20/20/26, valid=23, five-row filtered CSV. |

Go schema tests run with `-p 1` so the database-wide migration/Worker advisory guard is preserved; actual dual-Worker concurrency is exercised separately. `TestCacheCrashChild` is skipped in the parent test invocation by design, while `TestCacheCommittedProcessCrash` starts/kills the real child and verifies committed PG state. No parent skip is represented as an independently executed child test.

## Scope and interpretation

Only offline deterministic Faux passes through the real unchanged Native Pan package and actual local PG/Redis/Node/Docker. Real Provider calls, official benchmark/scoring, deployment and resume disclosures are zero. TypeScript source/package is reused; no new TypeScript suite is claimed. No old 800-query performance experiment was rerun and no speedup is claimed.

The overlap test deliberately holds two real containers at a tool barrier that emits no analysis result. Its failed analyses and blocked successor remain in the task ledger; the passed assertion is real overlap/resource isolation/order. Successful report semantics are demonstrated by separate completed tasks and browser downloads.

The long-held stop/reconciliation transactions still consume connections and delay competing controls. Maintenance failures are observable, bounded per cycle and retried only after the configured interval; an expired lease is never treated as stop proof. Namespace-specific files/labels remain operator configuration, not authorization supplied by HTTP clients.

Final usage, resource bounds, all failed development runs and final checks are summarized in the generated verification record. [Compiled interfaces](interfaces.json) and [exact path changes](changed-paths.json) accompany it. Coding token usage remains unknown; Faux settlement tokens are synthetic and are not billed Provider usage. Master/Regulator retain the independent acceptance and integration decision.


## Final Builder check summary

- Final candidate Go race: 18 top-level tests passed; one parent-only child-entry skip, with actual crash children exercised by their parent test. Vet/build, UI build and path/scope checks pass.
- Own task ledger: 116 tasks — 57 completed, 25 interrupted, 10 failed, 11 cancelled, 10 blocked, 3 superseded. All are retained; pending execution cleanup = 0. These include deliberate fault fixtures and failed development runs, not benchmark successes.
- 110 attempts; 195 model / 113 tool admissions. 182 reported Faux settlements = 364 synthetic tokens, 9 explicitly unavailable settlements, 12 unsettled starts; coding tokens unknown. Real Provider/official benchmark/scoring calls = 0.
- Final sampled cumulative resource bytes: 54,554,103,808 < 57,982,058,496; host free 27,601,477,632 >= 21,474,836,480. Original Docker baseline 48,503,971,840 is unchanged. Own PG, Redis, API, Worker, Node and analysis/sentinel containers are stopped/absent.
- Both #113 inventories remain unchanged: 3,770 original + 1,350 repair entries, zero mismatches. TypeScript Product sources and 82 installed dist files are reused unchanged; no new TypeScript test claim.

The verification matrix identifies the CLI binary for each run. The last narrow refinement makes the read/cache receiver incapable of calling task commands and maps typed domain outcomes in HTTP; the final binary reruns HTTP-facing workflows and real-PG/cache tests. Preserved earlier binaries carry the independent-worker/live-stop and operation recovery records, whose task/executor logic is unchanged by that refinement. Independent Regulator still reviews the exact remote candidate SHA.
