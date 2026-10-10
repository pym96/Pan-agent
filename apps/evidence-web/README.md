# Evidence Web · #106

An independent **Product candidate**: invited accounts import a private copy of the frozen #97 report, inspect classifications and segment7 usage, follow JSON Pointer citations, and download immutable inputs. Go owns HTTP/auth/import/persistence; React renders the page; PostgreSQL is authoritative for accounts, sessions, bundles and file bytes. No model, Pan execution, Redis, benchmark or public deployment.

## Local quick start (verified native PostgreSQL)

Requirements: Go1.24+, Node22+ and npm, Python3, PostgreSQL14 binaries (`initdb`, `pg_ctl`, `createdb`). Verified versions and evidence are in [web106](../../docs/evidence/web106/README.md). Use a **new, empty issue-owned runtime directory**, not a shared PostgreSQL data directory. Default loopback ports:8106 app,54106 database. Change at init with `--port`/`--db-port` if occupied.

From `apps/evidence-web` in the candidate checkout:

```sh
(cd web && npm ci --no-audit --no-fund && npm run build)
python3 scripts/local-dev.py init \
  --runtime "$HOME/.local/state/pan-agent/web106/my-runtime" \
  --pg-bin /opt/homebrew/opt/postgresql@14/bin
python3 scripts/local-dev.py start \
  --runtime "$HOME/.local/state/pan-agent/web106/my-runtime" \
  --pg-bin /opt/homebrew/opt/postgresql@14/bin
```

Open `http://127.0.0.1:8106`. `init` compiles the Go executable, creates a new persistent database and invited accounts `a@web106.test` / `b@web106.test`. Random passwords and DATABASE_URL are written only to runtime/config.json (0600 in a0700 directory). Read that private file locally to log in; do not paste it into reports or commit it. No password is printed by scripts. Existing account creation refuses duplicates; there is no public signup/reset endpoint.

Prepare the input **copy** in a new directory:

```sh
python3 scripts/make-bundle.py "$HOME/.local/state/pan-agent/web106/input-copy"
```

On the page choose its manifest.json in Manifest, and summary.json under 报告与附件. Click 导入并查看. Counts use only top-level classifications, not previous snapshots; task buttons and the source buttons open immutable file/hash/pointer records. Source text is rendered as data. Select files listed in the manifest together; optional unsupported files remain downloadable with a warning. File hashes must match the exact original bytes, including whitespace.

Stop/restart only this runtime (database/files persist):

```sh
python3 scripts/local-dev.py stop --runtime "$HOME/.local/state/pan-agent/web106/my-runtime" --pg-bin /opt/homebrew/opt/postgresql@14/bin
python3 scripts/local-dev.py start --runtime "$HOME/.local/state/pan-agent/web106/my-runtime" --pg-bin /opt/homebrew/opt/postgresql@14/bin
```

The process helper checks the runtime ownership marker and the recorded app PID's executable before signalling. It never deletes clusters, volumes or historical evidence. Database port/socket/memory settings persist in its postgresql.conf. Rebuild the binary only while the app is stopped: `go build -o "$HOME/.local/state/pan-agent/web106/my-runtime/evidence-web" .` PostgreSQL data must stay outside disposable build directories. No container images are needed for this slice; the native local route above is the verified deployment, not a Docker deployment claim.

## Direct process configuration

`go build -o evidence-web .` then configure:

| Variable | Meaning |
|---|---|
| DATABASE_URL | Required private PostgreSQL connection string; never logged |
| LISTEN_ADDR | Default127.0.0.1:8106; keep this slice loopback-only |
| APP_ORIGIN | Exact browser origin; defaults to http://LISTEN_ADDR. Mutations require matching Origin. |
| WEB_DIR | Built assets directory, default web/dist |
| ACCOUNT_EMAIL / ACCOUNT_PASSWORD | For `./evidence-web account` only; password12–72bytes, bcrypt stored |

`./evidence-web account` creates an invited account; `./evidence-web` migrates idempotently and serves. PostgreSQL migrations run before account creation or serving. Each import validates all files before one transaction inserts the bundle and its bytea files. No user filename becomes a filesystem path. No mutation/deletion API for imported bundles. Content addressing is SHA256 of each input's exact bytes; imported records are not independently verified benchmark facts.

Sessions use random tokens, only token hashes in PostgreSQL,12-hour expiration, HttpOnly/SameSite=Strict cookies, and Secure when APP_ORIGIN is HTTPS. Every list/detail/source/download query checks account ownership. Responses forbid caching; CSP forbids inline scripts/framing and browser rendering uses React text. Service errors are generic. This is a local invited-user slice, not a production identity service: no password recovery, brute-force rate limiter, HA or public TLS ingress is claimed.

## Manifest v1

```json
{
  "version": 1,
  "title": "My imported report",
  "summary": "summary.json",
  "files": {"summary.json": "<64 lowercase hex SHA256>", "notes.txt": "<SHA256>"}
}
```

Names must be simple ASCII filenames, at most120characters, no slashes, backslashes, `..`, absolute paths or duplicates. manifest.json is reserved and retained alongside inputs. At most32 declared files, total multipart upload16MiB. Main adapter expects issue97,89 classifications with supported states and explicit score fields, and the segment7 single-task usage record. JSON duplicate keys are rejected to keep citations unambiguous. JSONL/text attachments are previews, not commands; malformed/unsupported attachments generate warnings and retain download bytes. Preview limit1MiB. No archive extraction or arbitrary historical adapter.

## Verification

```sh
go test -race ./...
go vet ./...
```

For full real HTTP/DB/browser/restart checks use an initialized **test-only** runtime, with app stopped. Tests insert bundles and retain them. The helper starts/stops its own app and restarts its own database; existing imported evidence is not deleted.

```sh
python3 scripts/local-dev.py test --runtime "$HOME/.local/state/pan-agent/web106/my-runtime" --pg-bin /opt/homebrew/opt/postgresql@14/bin
```

Browser tests use Playwright plus installed macOS Chrome. Set CHROME_PATH to another installed compatible Chromium executable when necessary. Browser automation is a dev dependency, not used by the application. Logs and screenshots go to runtime/test-evidence; copy them before rerunning if needed. Exact API inputs, malformed imports, both account directions,89source pointers, inert script text, downloads and app/database restart are exercised. [Scripts](scripts/README.md), [migrations](migrations/README.md), [frontend](web/README.md), [design](../../docs/design/pan-web/README.md).

Implementation references: [pgx connection pool](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool) and [PostgreSQL14 pg_dump](https://www.postgresql.org/docs/14/app-pgdump.html). This slice does not implement backup automation; operators retain the owned database directory and can separately arrange PostgreSQL backups.

## #107 single-question offline analysis

The independent Web consumer now adds a PostgreSQL task queue, one Go Worker and a thin Node consumer of public Native Pan exports. The page is explicitly **Offline/Faux**. Deterministic scripted code runs in actual Docker and the real tool result returns through Pan before an answer is produced. This is not a natural-language-quality or live-model demonstration. Current single-question scope has no conversational context, cancellation/replacement UI, distributed workers, Redis or auto-resume.

From a clean candidate checkout, use a **new** issue-owned runtime. Retain the #106 data and runtimes; do not repoint this helper at them.

```sh
# From apps/evidence-web
(cd web && npm ci --no-audit --no-fund && npm run build)
python3 scripts/local-dev.py init --issue 107 \
  --runtime "$HOME/.local/state/pan-agent/web107/runtime/app" \
  --pg-bin /opt/homebrew/opt/postgresql@14/bin --port 8107 --db-port 54107
# Copy/build the public Pan package without changing its source in the checkout.
cp -R ../../typescript "$HOME/.local/state/pan-agent/web107/runtime/pan-source"
npm ci --prefix "$HOME/.local/state/pan-agent/web107/runtime/pan-source" --no-audit --no-fund
npm run build --prefix "$HOME/.local/state/pan-agent/web107/runtime/pan-source"
# Fixed standard-library image; pull has no user-evidence mounts.
docker pull python:3.11-slim
python3 scripts/worker-control.py configure \
  --runtime "$HOME/.local/state/pan-agent/web107/runtime/app" \
  --pan-entry "$HOME/.local/state/pan-agent/web107/runtime/pan-source/dist/index.js" \
  --image python:3.11-slim
python3 scripts/local-dev.py start --issue 107 --runtime "$HOME/.local/state/pan-agent/web107/runtime/app" --pg-bin /opt/homebrew/opt/postgresql@14/bin
python3 scripts/worker-control.py start --runtime "$HOME/.local/state/pan-agent/web107/runtime/app"
```

For exact evidence reproduction, use the digest/image identity in the #107 Handoff rather than assuming the mutable tag has not moved. configure resolves and stores the actual local image ID. Current worker settings are in private runtime/worker.json; provider secrets are not settings. Pin PAN_ENTRY and do not edit it while the worker runs. Initialization credentials remain private runtime/config.json; accounts retain a@web106.test / b@web106.test for compatibility with the existing invited-account test flow.

Open loopback8107, import the generated source copy as before, select the bundle and submit the analysis question. Inspect status, answer, citations, CSV, usage/Run Archive identity and canonical tool/error trace. Faux usage values are labelled test values; real sends0. Unknown model-error usage is not filled with zero. Queued tasks persist without a Worker. Running tasks lose authoritative liveness after10s without the database heartbeat; no automatic retry occurs. Restarting a Worker reconciles owned Node/container stops before claiming new queued tasks. An ambiguous stop prevents admission; preserve logs, do not delete leases/tasks/archives to bypass it.

Stop explicitly in this order:

```sh
python3 scripts/worker-control.py stop --runtime "$HOME/.local/state/pan-agent/web107/runtime/app"
python3 scripts/local-dev.py stop --issue 107 --runtime "$HOME/.local/state/pan-agent/web107/runtime/app" --pg-bin /opt/homebrew/opt/postgresql@14/bin
```

Worker process exit is not a claim that every prior container stopped. API cleanupConfirmed and retained diagnostics express that separately. SIGTERM stops admission and settles active work as interrupted if it cannot finish normally; SIGKILL is an interruption, not a cancellation protocol. Later #109/#110 own user cancellation and durable execution recovery. Task directories preserve archive/event/diagnostic records even for interrupted runs; they are never reopened to continue that run.

Testing: [executor boundary/probes](executor/README.md), scripts/check107.py and scripts/run-browser107.py. Set WEB107_RUNTIME to the initialized app directory, PAN_IMAGE to the pinned local ID, EVIDENCE_DIR to a new private output directory; browser runner also needs PREVIOUS_RESULT pointing to check107 result.json. Each harness starts/stops only its own app/Worker. check107 restarts the owned database; do not run against a shared cluster. #106 integration.py remains the core regression. [#107 evidence](../../docs/evidence/web107/README.md).

## #108 persistent ordered conversations

Current slice adds conversations bound permanently to one owned bundle. Create a conversation, submit a first question, then append follow-ups while it runs. The page always accepts append; it does not cancel or replace an active task. Select a saved conversation to read its ordered history; “查看旧任务” keeps legacy independent tasks visible. A failed/interrupted predecessor blocks later questions with its task ID; create a new conversation to continue. Offline/Faux first questions calculate all classifications; follow-ups demonstrate filtering valid_failure using the completed prior answer and the same input. This is an integration fixture, not general language understanding.

Use the #107 setup sequence above with **new** runtime `$HOME/.local/state/pan-agent/web108/runtime/app`, `--issue 108`, app8108 and DB54108; copy/build Pan into the sibling web108/runtime/pan-source. Do not operate on #106/#107 runtime data. worker-control.py recognizes the web108 ownership marker and writes `WEB_ISSUE=web108`; inherited WEB107_TASK_ROOT/WEB107_EXECUTOR variable names remain supported for compatibility. Container names and labels follow WEB_ISSUE (web107 default, web108 explicit). PostgreSQL lock/heartbeat singleton stays database-local; each issue runtime has its own database. Stop Worker before app/database exactly as documented, using the new runtime and --issue108.

```sh
python3 scripts/local-dev.py init --issue 108 --runtime "$HOME/.local/state/pan-agent/web108/runtime/app" --pg-bin /opt/homebrew/opt/postgresql@14/bin --port 8108 --db-port 54108
# After building Pan and preparing the fixed image as above:
python3 scripts/worker-control.py configure --runtime "$HOME/.local/state/pan-agent/web108/runtime/app" --pan-entry "$HOME/.local/state/pan-agent/web108/runtime/pan-source/dist/index.js" --image python@sha256:0dd364ba7e10242f07755449e3a3d0e35f9efd987952737b90def6709ab0c5ce
python3 scripts/local-dev.py start --issue 108 --runtime "$HOME/.local/state/pan-agent/web108/runtime/app" --pg-bin /opt/homebrew/opt/postgresql@14/bin
python3 scripts/worker-control.py start --runtime "$HOME/.local/state/pan-agent/web108/runtime/app"
```

API (same login/Origin requirements as #106):

- POST `/api/conversations` with `{bundleId}`; GET `/api/conversations?bundleId=…` lists only owned conversations. No change-bundle endpoint.
- POST `/api/conversations/{id}/messages` with `{question,requestId}`. question1–4000UTF-8bytes, opaque stable requestId1–128UTF-8bytes. Server locks the owned conversation row, allocates a monotonic sequence and inserts atomically. Same account/conversation/requestID + same exact question returns the original task (200); different question409. A fresh requestID represents a new submission, including identical text. IDs may repeat in other conversations/accounts. Clients retain IDs across network retries; the page retains the pending ID on an error and generates a fresh one after acknowledged success.
- GET `/api/conversations/{id}` returns ordered messages/task states; existing task/result/events/files endpoints remain account-gated. `/api/tasks/{id}` additionally exposes exact contextText/contextSHA256, conversation/sequence and start/finish timestamps.

Each claim freezes a public context snapshot transactionally: current task/question/sequence, bound bundle/summary hash and every completed prior question/answer/task/sequence/result hash, in order. Result hashes cover PostgreSQL's serialized JSON result bytes read by the Worker; context hashes cover exact UTF-8 contextText. The adapter receives these prior turns through public initialMessages; the current question goes through runTask. It also records actual first-exchange messages for audit. Sources remain in the public answer. No Provider reasoning, archive continuation, unfinished tools, future or foreign conversation turns are used. Context maximum262144bytes; exceeding it blocks visibly, with no truncation. There is no infinite-context promise.

Migration003 adds nullable conversation fields to existing tasks and keeps legacy bytes/state/results/CSV intact. Old tasks are displayed as legacy; no fabricated history or new context is attached to already completed tasks. New legacy API submissions remain independent and get an empty-prior context when claimed. Single Worker serializes all execution; failed predecessors are marked blocked before selecting other eligible work. Existing stop reconciliation remains mandatory.

Testing: set WEB108_RUNTIME and a fresh EVIDENCE_DIR, PAN_IMAGE to the pinned local ID; run `python3 scripts/check108.py`. `run-browser108.py` also takes PREVIOUS_RESULT pointing to check108's result.json. `check-migration108.py` applies old schemas, inserts explicitly synthetic legacy rows, applies003 twice and verifies byte preservation inside a rolled-back private schema. #106 integration.py and #107 check107.py remain regression entrypoints (for #107 tests in a web108 runtime also set WEB_ISSUE=web108). Barrier tests set WEB_FAUX_BARRIER=1 on the Worker and wait for `fixture.waiting`; the trusted test writes an owned task-root/release file. No HTTP/model interface exposes this control. It is disabled by default and bounded by the existing executor timeout.

[#108 evidence](../../docs/evidence/web108/README.md). No real Provider, benchmark, scoring, automatic continuation, Redis, multi-Worker or public deployment.

## #109 durable cancellation and replacement

Current page separates append, cancel and replace. Select a task; cancel targets that task. Before replacement, the page explains that the current task will be cancelled and its existing unexecuted follow-up suffix withdrawn. Enter the new question in the existing textarea and choose replace. Old questions, diagnostics, files and usage remain historical. A completed target cannot be replaced; append instead. A queued cancellation needs no executor; a running cancellation shows cancelling until stop is confirmed.

Initialize a **new** runtime `$HOME/.local/state/pan-agent/web109/runtime/app` with `--issue 109 --port 8109 --db-port 54109`. Use the same pinned Python digest and public Pan build procedure above, copied/built under web109/runtime/pan-source. worker-control.py detects web109-owner.json and configures WEB_ISSUE=web109. Keep legacy variable names WEB107_TASK_ROOT/WEB107_EXECUTOR for compatibility. All start/stop commands take this new runtime; app/database helper takes --issue109. Never repoint it at old databases or shared processes. Worker, app, database stop order stays unchanged.

POST `/api/conversations/{conversation}/tasks/{task}/cancel` with `{requestId}`; POST the same path ending `/replace` with `{requestId,question}`. IDs1–128UTF-8bytes, replacement question1–4000bytes, JSON body<=8192bytes. Unknown fields including PID/container/bundle are rejected. Exact Origin/login/ownership applies. Control identities are scoped to account+conversation in a separate operation ledger; same ID with different target/action/content conflicts409. Successful retry returns its original decision/replacement ID; poll the target for current state. New cancel IDs against terminal tasks preserve that terminal result.

Replace only the active running task or, with no running task, first active queued task. Already replaced/completed/stale targets conflict. Conversation row lock serializes revision, append and control identities; task row lock arbitrates result publication. Replacement atomically retires the target from active context, marks its unexecuted queued/blocked suffix superseded, allocates a new monotonic sequence and records replaces. Valid completed active prefix remains; later appends follow the new revision. Cancel without replacement leaves the unavailable predecessor active, so its followers block under #108 rules. History rows are never deleted or repurposed.

Running cancel persists cancelling first. Worker polls at100ms and sends structured cancel on its already-owned Node stdin; Node invokes existing GeneralAgentSession.cancel. After5seconds, if graceful exit is still incomplete, the Worker may kill its own recorded child process group, then waits for process exit. Docker cleanup still checks exact task name+issue/task labels and verifies absence. Cleanup commands have30second context; a timeout is an unknown stop, never proof. Unknown stops pause all admission and keep replacement queued. Restart only rechecks the recorded Node identity and labelled container; it never reruns the cancelled task. Five seconds bounds graceful waiting for this local single-tool slice; it does not bound Docker stop success.

The task response exposes cancelRequestedAt, stopConfirmedAt, activeBranch, replaces and attemptResult. Pan cancellation and control.stop_confirmed events support audit. Completion committed first stays completed. Cancel intent committed first fences late completion: final envelope/known usage/archive/artifacts remain an old attempt, not result. Late artifact bytes are retained in database; after stop-only recovery they can also be served from a validated retained envelope, using the same fixed names, hash/size checks and owner gate. Unknown usage stays unknown. Raw executor stdout/stderr is private retained evidence.

Migrations are now serialized by a database transaction/advisory lock and recorded with SQL hashes in ew_migrations. Pre-ledger databases apply idempotent files once; migration003 recognizes the newer state-column marker and does not narrow the state constraint after004. Startup detects changed applied SQL hashes. This prevents replaying older state vocabularies over cancellation records and avoids concurrent API/Worker DDL races. No old database needs to be operated on to test this: check-migration109.py creates a rolled-back private schema.

Tests: check109.py uses WEB_TEST_ISSUE=109, WEB108_RUNTIME pointing to the owned new runtime, EVIDENCE_DIR fresh per attempt, and PAN_IMAGE pinned. run-browser109.py also takes PREVIOUS_RESULT from the passed check109 result.json. Old check108/check107/integration checks remain; use WEB_TEST_ISSUE=109 and WEB_ISSUE=web109 where relevant. Production defaults have no fixtures enabled. Trusted test-only WEB_TOOL_BARRIER lists task IDs: Python signals output/tool-ready then awaits output/tool-release. WEB_RESULT_BARRIER=1 holds a finished envelope until task-root/result-release. The owned root marker stop-unconfirmed simulates inability to confirm stop; it only denies admission, never grants execution. No HTTP/model input can set these environment controls or write that root marker. Preserve failed evidence; remove only an owned test marker to demonstrate stop-only recovery.

[#109 evidence](../../docs/evidence/web109/README.md). Single Worker/analysis container, offline/Faux, no Provider continuation/checkpoint recovery, Redis, deployment or exactly-once claim.

## #110 same-task checkpoint recovery (Stage A)

Initialize a fresh web110 runtime with `--issue 110 --port 8110 --db-port 54110`; build/package the candidate TypeScript Product independently under web110/pan-source. Configure the worker with the pinned image and that entry, `WEB_ISSUE=web110`, `WEB_CHECKPOINT_MODE=1`. The default core API and non-checkpoint application mode preserve existing callers. Do not reuse old runtime DBs/packages. No real Kimi configuration belongs here.

Only a fully settled tool boundary creates a point. The page shows recoverable only after confirmed stop; choose “从确认检查点恢复”. POST `/api/conversations/{id}/tasks/{task}/resume` with `{requestId,checkpointId}`; no paths/state/hash accepted. Same request returns its original attempt. Admission queues the same task with a new attempt, then validates all private dependencies before any send; a validation failure remains interrupted/unrecoverable. Cancel/replace can retire a queued resume. A cancelled point cannot resume. Other legacy terminal cancellations remain no-ops.

`recovery.attempts` links actual PIDs, source checkpoint, terminal result and stop times. Native result counters/usage are cumulative; `recovery.accounting` independently sums distinct model settlements and explicitly counts unknown/unsettled exchanges, so cumulative attempt totals must not be added together. The feature is Faux-only confirmed-boundary recovery, not arbitrary tool recovery, exactly-once or real Kimi continuation.

Tests: `check110.py`, `check110-negative.py` with WEB_TEST_ISSUE=110, WEB108_RUNTIME, fresh EVIDENCE_DIR and pinned PAN_IMAGE. Trusted fault settings are `WEB_CHECKPOINT_FAULT=before-commit|after-commit|after-exchange|partial-tools`; they are not HTTP/model inputs and normal configuration does not enable them. Test Node termination targets its actual owned attempt PID. Failures and unknowns remain in the private evidence root. #106–109 regressions run with checkpoint mode disabled.

[Design/private-state policy](../../docs/design/pan-web/checkpoint110.md), [evidence](../../docs/evidence/web110/README.md).

## #111 trusted operation reconciliation

Use a new `--issue 111 --port 8111 --db-port 54111` runtime, candidate-built installed Pan package and the pinned Python image. worker-control enables `WEB_CHECKPOINT_MODE=1` and `WEB_OPERATION_MODE=1`. The page offers “核对并恢复 · 重建环境” only for a stopped, active, owned pending point. It reconciles before allocating a new attempt; insufficient evidence stays unknown. The request body remains `{requestId,checkpointId}`. Single-tool completed receipts reuse results; durable pre-dispatch proof permits the pending call; dispatched without valid receipt never replays. Real Kimi and partial multi-tool gaps remain unsupported.

All #111 test scripts use `WEB_TEST_ISSUE=111`, `WEB108_RUNTIME`, a fresh `EVIDENCE_DIR` and pinned `PAN_IMAGE`. #106–110 regressions run in this isolated runtime with operation mode disabled, preserving prior assertions. [Design](../../docs/design/pan-web/operations111.md) / [evidence and reproduction](../../docs/evidence/web111/README.md).

## #112 concurrent local Workers

Use `WEB_ISSUE=web112` for two independent Workers with durable ownership generations. [Design](../../docs/design/pan-web/ownership112.md) and [evidence](../../docs/evidence/web112/README.md) define the admission/stop boundary. Use a fresh dedicated runtime; stop legacy Workers before additive migrations. `worker-control.py --slot 1|2` keeps separate PID receipts. Default analysis quota is 1 CPU / 1 GiB per container; no real Provider calls.
