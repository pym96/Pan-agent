# Local Product deployment — #114

This is an offline Faux demonstration, **not a real LLM capability test**. Analysis runs the unchanged Native Pan package and real isolated Docker tools against a pinned report. Only macOS arm64 on the tested host is verified. Linux, network hosting, real Providers and arbitrary checkpoint relocation are unverified/out of scope. No login service or public registration is installed.

## Build and install

Host dependencies: Python 3.14, Go 1.27.1, Node 26.7, PostgreSQL 14.18 tools, Docker Desktop 28.0.4; Redis 7.2.5 is bundled. Exact observed identities are in the evidence binding. Node >=22.19 is the Pan package requirement; other Node/PG/OS versions have not been validated here. Build requires npm registry/Go dependency access. Runtime uses no source checkout or build tools. PostgreSQL's installed libraries and Docker engine remain host dependencies.

From `apps/evidence-web`, with paths supplied by the operator:

```sh
python3 deploy/package.py --out /absolute/path/package \
  --pan-tar /absolute/path/pan-agent-0.1.0.tgz \
  --redis /absolute/path/redis-server
python3 deploy/pan-web.py install --package /absolute/path/package \
  --dest /absolute/path/program
python3 /absolute/path/program/deploy/pan-web.py init \
  --data /absolute/path/data --pg-bin /absolute/path/postgresql/bin \
  --port 8114 --pg-port 54114 --redis-port 63114 --workers 1
python3 /absolute/path/program/deploy/pan-web.py start --data /absolute/path/data
python3 /absolute/path/program/deploy/pan-web.py status --data /absolute/path/data
```

The Pan tarball must match `70b6c7680f07f936343737f064e94cb9838aefb6264448c3639a935accce9d0e`. Redis must match `99d12efe55a74b56b93c3910011833b51f9691580a6d8158946026249e22650c`. The analysis image must already be installed as `sha256:8129910271f9764b5c05038d351ad7b9f9d94b85351355b69c5526eadd111775`; start never pulls it. Dependencies may be supplied from any operator location; no historical WorkOrder directory is embedded into the package. The generated `manifest.json` inventories Go, UI, executor, unchanged Pan files, migrations, fixed input and Redis. SQL also remains embedded in Go. Keep the original manifest/hash with the distribution.

Use a distinct program directory **and** private data directory per deployment; configuration binds them. Default one Worker, maximum two, each analysis 1 CPU/1 GiB/network none. This avoids exceeding four CPU/eight GiB and never delegates Docker control into an analysis container. Existing data or package destinations are refused. Failed init directories are retained for diagnosis, not automatically reset. Namespaces identify resources, never choose execution capabilities.

`init` generates two invited accounts (`a@pan.local`, `b@pan.local`) and passwords only in private `data/config.json` (0600, parent 0700). An operator reads that local file privately; do not paste it into chat, logs, Git, or recording. No real API keys are required or read. Open `http://127.0.0.1:8114`. Import `program/inputs/manifest.json` and `summary.json`; submit a first analysis and a follow-up asking for valid failures. Faux follows a fixed two-tool path: first report retains 89 classifications/23 valid scores; the second tool emits five valid-failure CSV rows; a follow-up consumes the actual completed context. It does not interpret arbitrary natural language.

## Lifecycle and failure handling

```sh
python3 /absolute/path/program/deploy/pan-web.py restart --data /absolute/path/data
python3 /absolute/path/program/deploy/pan-web.py stop --data /absolute/path/data
```

All services explicitly bind 127.0.0.1; PG disables Unix sockets. Commands sanitize inherited environment, pin executable dependencies, and serialize operations with a file lock. API and Workers run detached from the invoking command. Start checks port ownership, PG SQL, Redis PING, HTTP response and live PG Worker heartbeats. Repeating a healthy start is a no-op. Partial startup remains inspectable and blocks another start: inspect `data/logs/`, run stop, then repair the cause. Logs and config are private. `status` returns nonzero on partial or uncertain ownership.

Stop verifies PID **and start time/command**, including Redis's known title rewrite, then waits for exit. It stops Workers first, leaves API/PG available for existing cleanup, checks actual running analysis containers, and only then stops API/cache/PG. Unknown identity or execution stop produces a nonzero result and retains receipts. Never delete receipts or kill a matching numeric PID without verifying identity. A receipt lost or PID reused after reboot is an operator diagnosis case; this entry does not claim arbitrary process recovery. Redis is disposable; PG remains authoritative. Queued, never-started tasks may run on explicit start; interrupted tasks are not automatically resumed.

Normal `init` does not enable test mode. Ambient fault/barrier variables are rejected on start; configured faults require `--test-mode` at init. For a dedicated test deployment only, stop it, set a supported `faults` key in private config (e.g. `WEB_OPERATION_FAULT: after-receipt`), start, and observe the explicit operation barrier before a controlled Node kill. After confirmed interruption, stop and clear the fault, start, then use the existing UI **核对并恢复** operation. No proof means no replay. Never edit a live config; never do this on previous WorkOrder databases. The test harness is optional and not a runtime dependency.

## Stopped backup and same-path restore

Authoritative PG contains accounts, sessions, imported input, tasks, control and accounting. `tasks/` holds private checkpoints, receipts, archives and bound artifact paths. Config includes passwords and exact program/data paths. Redis has no persistence and can be recreated. `processes.json` is only a local process receipt, never task authority.

```sh
python3 /absolute/path/program/deploy/pan-web.py stop --data /absolute/path/data
python3 /absolute/path/program/deploy/pan-web.py backup --data /absolute/path/data \
  --backup /absolute/path/backup
# Preserve the original stopped directory. Do NOT remove old evidence.
mv /absolute/path/data /absolute/path/data-preserved
python3 /absolute/path/program/deploy/pan-web.py restore --data /absolute/path/data \
  --backup /absolute/path/backup
python3 /absolute/path/program/deploy/pan-web.py start --data /absolute/path/data
```

The stopped physical PG and all private data are copied at one quiescent point. Backup refuses running/unknown owned resources and inventories every included file; symlinks are rejected. Restore validates the complete inventory, requires the original exact program/data paths, an absent destination, available ports and no owned execution. Keep the same macOS/PG major version, dependencies, image and unchanged program package. The backup contains credentials and **must remain private**. Keep original evidence intact. This is not online backup, cross-host/path migration, RAM/PID restoration, or production disaster recovery. Checkpoints reference bound paths; a sealed archive is not a checkpoint.

## Verification and evidence

`../scripts/browser114.mjs` operates an explicitly initialized test deployment, records the real page to WebM, verifies two accounts and task/CSV/source identities, performs a declared fault/cancel and same-path backup restore, and leaves services stopped. Requires Playwright's ffmpeg component in an operator-selected cache (`PLAYWRIGHT_BROWSERS_PATH`); no global browser installation required when an existing Chrome path is supplied. Its video is private and visibly labeled; chapter timestamps map to original task evidence. See [#114 evidence](../../../docs/evidence/web114/README.md) and [design](../../../docs/design/pan-web/deployment114.md). Independent Regulator decides acceptance of the full candidate SHA.

## #122: explicit Kimi mode

Install the manifest-bound package as above. `init --provider kimi --workers 1`
selects real `kimi-code / k3-256k / high` at the fixed official Chat Completions
endpoint. The default `--provider offline-faux` remains deterministic regression.
Only the frozen authorized report is admitted in this live composition; attachments
outside that report and task metadata fail before any provider request.

Provide `KIMI_API_KEY` in the **start process environment**. Do not put its value
in commands, config.json, browser inputs, screenshots or backup directories. The
operator fails if it is missing; only the trusted Worker receives it, and only
its task Node receives the provider credential. API, PostgreSQL, Redis, Docker
CLI and analysis container receive no provider credential. Restart requires
explicit reinjection; backup/restore does not preserve it. No Keychain, credential
file discovery or ambient provider endpoint is used.

Live runs are serialized by an exclusive PostgreSQL Worker lock. Faux uses its
existing shared lock and capacity limit. Do not mix modes within one live database.
Model errors (including authentication, quota and rate limit) stop the Worker;
inspect retained safe metadata before an explicit new attempt. No automatic replay
or custom retry loop is added. One network exchange and each tool operation remain
bounded; the Faux 180-second whole-task timer is **disabled** in Kimi mode.

Live process loss preserves interrupted/unknown history. Kimi checkpoint and
operation resume are unsupported and rejected before send; only Faux supports
existing recovery. Browser refresh reads state and never resubmits a task. A new
explicit question gets a new task/attempt and completed public context as quoted
history; private reasoning/continuation never leaves the adapter's process memory.

`analysis.json`/`details.csv` validation checks structure, immutable hashes and
resolvable source pointers, **not** the semantic correctness of an answer. A
validation tool returns errors into the same model loop. The UI distinguishes
execution state, validation status and readable model answer. Inspect all attempts
and unknown usage, not only the latest successful answer.

[Composition and privacy boundaries](../../../docs/design/pan-web/live122.md)
· [Candidate evidence](../../../docs/evidence/web122/README.md).


## #126 Linux candidate — blocked before deployment

Linux packaging accepts `--platform-lock /private/platform-lock.json`, required on
Linux. The JSON binds `os: "linux"`, `architecture` (Python platform.machine(),
e.g. `x86_64`), full `sourceSHA`, `panTarSHA256`, `redisSHA256`, and the immutable
Docker `image` ID. Construct and retain this lock from a reviewed candidate build
and independently verified dependencies; a caller-supplied lock is not a signature
or acceptance verdict. The packager checks local input hashes and the actual image
platform. The installed manifest records the lock and all packaged file hashes.
Install/init/lifecycle reject a different OS, architecture or changed package bytes.
Linux uses an explicit package image, leaving macOS's existing hashes unchanged.

This candidate is not ready for service use. The unchanged Web executor currently
requires macOS Docker.raw before every analysis tool. Linux reproduction fails
closed; adapting that resource gate is outside the current WorkOrder write scope.
Do not fabricate the backing file or skip the gate. See
[partial evidence and ScopeChallenge](../../../docs/evidence/server-migration-126/README.md).
No Linux end-to-end, real Provider or restart verification has occurred.
