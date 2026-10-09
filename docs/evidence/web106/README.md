# #106 Criteria1.0 — Builder candidate evidence

Contract [Criteria1.0](https://github.com/pym96/Pan-agent/issues/106#issuecomment-6074638346), [activation](https://github.com/pym96/Pan-agent/issues/106#issuecomment-6074673607). Frozen baseline `e8acfdb616f95b7b70c151d2da00b243f353e6e8`; branch workorder/106-candidate. Pending independent Regulator; no self-acceptance or verified-project/resume fact.

## Delivered and checked

[Runnable app](../../../apps/evidence-web/README.md) and [design](../../design/pan-web/README.md): Go/pgx API, PostgreSQL14 persistence and React19 UI. React was chosen for the small stateful upload/list/source view; PostgreSQL bytea keeps exact file bytes and bundle metadata in one import transaction. No user filename becomes a storage path. No Pan loop, model, Redis, task scheduling or benchmark execution.

Input identity: existing docs/evidence/terminal-bench-full-live-97-summary.json SHA256 `f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab`; read-only source copied by script, never edited. Classification is calculated from the top-level89rows only. success18, valid_failure5, unscored20, unknown_interrupted20, not_started26; valid scores23. Segment7 usage only: known1, unknown1, input470, output161. Null remains null; rawReward stays separate from validScore. JSON Pointer citations identify the exact uploaded file/hash and record. Imported reports are labelled as such, not newly validated runs.

Actual verification on Go1.27.1, Node26.7.0, PostgreSQL14.18 Homebrew, real loopback Go server and Chrome controlled by Playwright:

- C-WEB106-01: real page upload, exact counts and segment scope, row/usage source clicks; all89 JSON Pointer rows compared with immutable input; exact downloads/hash checked.
- C-WEB106-02: both invited accounts can import/read their own bundle; cross-account and anonymous detail/source/preview/download denied. Missing main input, bad JSON, duplicate JSON keys, manifest hash mismatch and path traversal rejected without a success row. Optional binary/invalid JSONL attachments retain warnings and original downloads. Real browser HTML/script text remained inert (zero dialogs/no canary execution). Foreign-Origin mutation denied; wrong-password errors do not echo credentials.
- C-WEB106-03: real database-backed imports survive stopping/restarting both the application and PostgreSQL; fresh login through API and browser can inspect the same bundle/89rows/null source and byte-identical file. Account ownership survives. Documented helper init/start/stop and input-copy generation were exercised; final app and owned database are stopped with data retained.

The final integration report contains36 recorded checks (two entries include the browser flows); browser report separately lists8 interaction checks and4 fresh-browser restart checks. These are checklist counts, not36independent experiments. Go's2unit tests run with race detection; `go vet ./...` passes. Frontend npm build, Python syntax, changed-file paths/links/JSON and Git whitespace checks are also recorded. No unrelated Pan/product/benchmark suites were rerun.

## Raw evidence and resource record

Private local root: `/Users/panyiming/.local/state/pan-agent/web106/`.

- evidence/integration-first.log and evidence/first/: initial API/browser success followed by local PostgreSQL restart configuration failure.
- evidence/setup-final.log, integration-final.log and integration-complete.log: clean runtime setup and subsequent successful final checks, including added B-own-import/wrong-password coverage.
- runtime-final/test-evidence/: integration.json, browser.json, browser-after-restart.json, screenshots, downloaded canary and process logs. Synthetic HTML canary is not a real instruction or user artifact.
- evidence/go-test-race.log, go-vet.log, resources-final.json, delivery-checks.json, inventory.json and SHA-bound Handoff.md.
- runtime and runtime-final hold private test databases/credentials; they are intentionally excluded from Git and public evidence inventory. No real provider secret was read. Runtime-generated random passwords/DSNs must stay private.

Resource accounting inherits Docker baseline48503971840, owned+max(0,Docker-baseline)<57982058496 and free>=21474836480. Final sample includes old Pan roots, #58 external media, existing Python/TS dependencies, new web106 state, actual PostgreSQL installation, and Go module/build caches. No Docker images/containers were started/pulled. See [summary](summary.json) for the timestamped sample; it is not a guarantee of future capacity or measured peak.

Development Token usage is unavailable from session tools and is recorded as unknown. No inferred Token/cost estimate. Observable timestamps, dependency/build logs, database/browser activity and initial failed attempt are retained; no artificial development-duration or attempt cap was introduced.

## Failure and correction

First persistence probe stopped and started the owned PostgreSQL cluster. Its initial command-line-only port54106 setting was not retained by `pg_ctl start`, which reopened on5432; the app correctly reported database unavailable. Existing database bytes were retained. Builder persisted port/socket/listen and memory/connection settings in the owned cluster config, then initialized a new clean runtime through the documented helper and passed app/database/browser restart checks. Both clusters and first logs are retained; the old cluster is stopped. This was a local setup-script defect, not evidence loss or a Pan benchmark incident.

Human chose product direction, architecture responsibilities and criteria; Coding Agent implemented the slice and tests. Independent Regulator must assess the submitted SHA. No performance improvement, benchmark score or Human sole-authorship claim is made.

## Limits

Only the frozen report shape is supported; no arbitrary log analysis or hidden answers.16MiB upload,32declared files,1MiB text preview. No public deployment, model/executor, Redis, restore of Pan execution, file editing, public signup, password reset, rate-limiting/HA claims or new server. The verified runtime is native PostgreSQL; no untested container deployment is advertised. DB administrators remain trusted. Browser tests use installed Chrome with a configurable executable path. Original private reports/screenshots are not uploaded to GitHub; repository holds code and sanitized summaries only.
