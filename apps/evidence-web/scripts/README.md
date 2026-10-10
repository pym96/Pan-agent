# Local development and behavior checks

- local-dev.py: initialize/start/stop an owned persistent PostgreSQL/application runtime or run integration checks. Private random credentials remain outside Git.
- make-bundle.py: hash-check and copy the fixed repository summary; generates manifest without editing the source.
- integration.py: real HTTP/PostgreSQL API positives/negatives plus application/database restart and browser probes. Requires APP_BINARY, EVIDENCE_DIR, DATABASE_URL, ACCOUNT_A_PASSWORD/ACCOUNT_B_PASSWORD; optional TEST_PGDATA/TEST_RUNTIME_ROOT/PG_CTL allow only an owned cluster restart.
- browser-test.mjs: actual React controls, citations, inert HTML text, download, two-account view and optional persisted-bundle reopen. Uses installed Chrome (CHROME_PATH override). No Provider calls.

See [app README](../README.md) for exact runnable commands. Evidence/screenshots and generated input copies stay in the authorized private runtime, not source control.

#107 additions:
- local-dev.py `--issue 107` creates a separately marked runtime; use distinct ports8107/54107. Existing default106 behavior remains.
- worker-control.py configures a pinned image/Pan entry, starts the single worker and stops only its receipt-bound PID. Stop Worker before app/database; task cleanup confirmation is separate from process exit.
- check107.py: real API/Pan/Docker positives, tool failure→success, model error, second Worker rejection, forced termination and persistent restart.
- browser107.mjs / run-browser107.py: actual page submission, source/download and a different B-owned synthetic report. Inputs/credentials are local environment only.

All tests preserve records. They are offline/Faux and create only owned local tasks/containers. Keep old failed output directories when repeating; choose a new EVIDENCE_DIR. No benchmark/Provider calls.

#108: local-dev.py --issue108 uses distinct runtime/ports; worker-control.py recognizes the issue marker. check108.py exercises concurrent idempotency, signal-controlled append, actual Pan context, modified B input, failure/interruption blocking, cross-account access and restart. browser108.mjs/run-browser108.py test page append/history/source/CSV; check-migration108.py verifies real idempotent migration of old rows. Fresh EVIDENCE_DIR per attempt; never overwrite old failures.

check108-edges.py reuses check108 helper definitions and injects explicitly synthetic missing/oversize completed answers into its owned test database. Success means blocked before execution, not model success. Never use against user data.

#109: local-dev.py --issue109 and worker-control.py own a new8109/54109 runtime. check109.py covers real Pan/Docker cancellation, queued cancellation, replacement suffix/prefix, request races, both completion orders, uncertain stop, API/Worker restart and unrelated resource survival. browser109.mjs/run-browser109.py exercise actual buttons, impact disclosure, source/CSV and inert text. check-migration109.py tests old plus cancellation states. Prior #108 helper accepts WEB_TEST_ISSUE and treats cancelling as nonterminal; original external assertions are retained. Use a fresh EVIDENCE_DIR and retain failed attempts.

check109-retention.py adds repeated cancel and late-envelope artifact retention through unknown stop and stop-only recovery. It shares owned-runtime helpers and uses explicit barriers; no old task is rerun.

#110: `check110.py` verifies actual terminated/new Node recovery and control equivalence; `check110-negative.py` covers invalid points/private-state/ownership; `check110-races.py` and `check110-stop-race.py` cover transaction and live-resource boundaries; `run-browser110.py`/`browser110.mjs` exercise the explicit UI and unrelated-resource sentinel. `check-migration110.py` preserves legacy bytes under additive migration005. Use an owned --issue110 runtime, WEB_TEST_ISSUE=110, WEB108_RUNTIME, fresh EVIDENCE_DIR and pinned PAN_IMAGE. The existing #109 probes also support issue110 without removing assertions. No live model/benchmark calls.
`check110-file-integrity.py` combines concurrent identical resume requests with changed required-file bytes. `check110-readback.py` scans all owned terminal API projections and execution logs/archives/CSV for the synthetic private marker, including corrupted-payload recoverability metadata.

#111: local-dev --issue111 and worker-control own a new runtime. `check111.py` covers actual crash/receipt reuse, pre-dispatch execution, removed stopped container and unresolved non-starvation. `check111-negative.py` covers receipt/identity/link/ownership attacks and concurrent admission/cancel. `check111-boundaries.py` covers incomplete/multi-tool/persistence/nonzero/image cases; `check111-stop-race.py` covers live Node with expired lease. `run-browser111.py`/`browser111.mjs` exercise the actual reconciliation button, counts, downloads and unrelated sentinels. Use WEB_TEST_ISSUE=111, WEB108_RUNTIME, EVIDENCE_DIR and pinned PAN_IMAGE. Existing #109/#110 probes allow the new isolated namespace; malformed version2 envelopes now reject earlier at reconciliation, preserving their zero-send assertion. Migration probe includes006 replay.
`run-browser111-readback.py` / `browser111-readback.mjs` take PREVIOUS_RESULT pointing to a stopped dispatched-without-receipt task JSON. They verify persisted unknown UI after reload and an explicit readonly recheck with no Worker/new calls.

## #112 verification

`check112-smoke.py` covers real two-Worker output and order. `check112-faults.py`
records pause/revoke, before/after admission, confirmed/unresolved recovery and PG outage.
`check112-controls.py` checks dedicated connection loss, cancel/replace, client identity
forgery and unrelated sentinels. `run-browser112.py` / `browser112.mjs` exercise two
healthy owners and user-visible results/source/CSV/history. `check112-capacity.py` freezes
its manifest before the paired 12-task load; `recompute112.py EVIDENCE_DIR` independently
recomputes throughput, nearest-rank p50/p95 and real Docker interval overlap. Each run
needs a fresh `EVIDENCE_DIR`; retain failed outputs. Read the contract budget first.

All use `WEB_TEST_ISSUE=112`, `WEB108_RUNTIME=<owned runtime>`, `EVIDENCE_DIR=<new dir>`
and the contract-pinned `PAN_IMAGE`. Candidate package is unpacked at the runtime
parent's `pan-source/`. No keys or external model endpoints are needed.

`check112-live-stop.py` keeps an actual old Docker process alive after owner expiration, verifies occupied-slot/global stop gating, then observes exact container absence before an independent conversation proceeds. Run separately from the capacity experiment.
