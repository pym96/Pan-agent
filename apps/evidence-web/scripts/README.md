# Local development and behavior checks

- local-dev.py: initialize/start/stop an owned persistent PostgreSQL/application runtime or run integration checks. Private random credentials remain outside Git.
- make-bundle.py: hash-check and copy the fixed repository summary; generates manifest without editing the source.
- integration.py: real HTTP/PostgreSQL API positives/negatives plus application/database restart and browser probes. Requires APP_BINARY, EVIDENCE_DIR, DATABASE_URL, ACCOUNT_A_PASSWORD/ACCOUNT_B_PASSWORD; optional TEST_PGDATA/TEST_RUNTIME_ROOT/PG_CTL allow only an owned cluster restart.
- browser-test.mjs: actual React controls, citations, inert HTML text, download, two-account view and optional persisted-bundle reopen. Uses installed Chrome (CHROME_PATH override). No Provider calls.

See [app README](../README.md) for exact runnable commands. Evidence/screenshots and generated input copies stay in the authorized private runtime, not source control.
