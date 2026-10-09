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
