# #112 Criteria1.0 — concurrent ownership and offline capacity

Builder candidate; independent Regulator has not accepted this work. Human supplied the
objective, architecture constraints and budget; the coding Agent implemented and tested
this candidate. No project/resume fact promotion or real Kimi capacity claim is made.

Contract/base: [Criteria1.0](https://github.com/pym96/Pan-agent/issues/112#issuecomment-6093541635),
`ebbe2f6e2a03f57ad632b1bd8514340b321c20ee`. [Atomic boundary](../../design/pan-web/ownership112.md).

## Runtime and identity

All new work is under `/Users/panyiming/.local/state/pan-agent/web112/`.
`runtime/` is the new ownership-enabled PG/API/Worker environment (ports 54112/8112).
`legacy/` is a separate fresh single-Worker regression database (54113/8113), also within
this new root; it is not the old #111 runtime. Old #111 inventory identity was reread and
remained `c71c4b6e67513d9c511051260bb25a0f8f6d7aa170322ed6c7c04681e59aec2a`.

- Candidate-built Go binary, both installed copies:
  `81b4c2091b85ef9debaf134a680edaa44adb829695ae9ac1a61bb3c9651a1d46`.
- Rebuilt `pan-agent-0.1.0.tgz`:
  `70b6c7680f07f936343737f064e94cb9838aefb6264448c3639a935accce9d0e`.
  Its 82 installed dist files equal the source build. It is byte-identical to #111's
  accepted package because no Native Product code change was necessary; fencing is
  implemented in the Web execution boundary. This is not a claim of a changed kernel.
- Python image: `sha256:8129910271f9764b5c05038d351ad7b9f9d94b85351355b69c5526eadd111775`.
- Input: `docs/evidence/terminal-bench-full-live-97-summary.json`, SHA256
  `f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab`.
- Applied migrations 001–008 are recorded in each dedicated DB's `ew_migrations`.
  007 adds generations/admissions; 008 binds the persistent owner to its PG backend.

## Verification evidence

Paths below are relative to the new root's `evidence/`; all raw outputs and failed
probes remain retained. Builder tests are evidence for review, not an independent Verdict.

| Evidence | Observed checks |
|---|---|
| `product-check.log` | Typecheck and all 209 Product tests passed |
| `ownership-race-02.log`, `go-vet.log` | Go race suite, real PG claim/revoke/generation negatives, vet passed |
| `migration112.log` | All legacy task fields unchanged; no fabricated generation/admission/attempt |
| `smoke-01/` | Real two-Worker execution, three correct outputs, ordered public context |
| `faults-02/` | 21 checks: paused/revoked owner, both admission orderings, pre-tool fence, explicit generation-2 recovery, receipt reuse, unknown non-replay/nonstarvation, PG outage |
| `controls-03/` | 17 checks: dedicated heartbeat backend terminated while PG remains healthy; client identity forgery/foreign access; duplicate cancel, late completion, replacement/stop order; unrelated process/container preserved |
| `live-stop-01/` | 8 checks: actually running old container, expired owner, stop-unknown slot retention, exact absence before independent work, unknown effect not replayed |
| `browser112-01/` | Two distinct healthy Workers, visible generation, both 89/23 results, both five-row CSV/source navigation, private canary absent, exact histories after API restart |
| `integration106-01/` | Real HTTP/PG/browser import, 89 source pointers, A/B/anonymous isolation, malformed inputs, immutable sources and DB restart |
| `legacy-check107-01/` through `legacy-check111-01/` | 31 / 37 / 38 / 19 / 33 existing checks passed with this Go binary and rebuilt package |
| `legacy-check111-negative-01/`, `legacy-check111-boundaries-01/` | 20 receipt/ownership/integrity negatives; 11 uncertain/nonzero/missing-image boundaries |
| `legacy-check110-races-01/`, `legacy-check-migration110-01/` | 9 explicit recovery/control races; retained old schema/history checks |

The fenced writes and action admission use the same task row lock as revocation/control.
Stale data cannot update a newer generation; late bytes remain private old-attempt
observations. Actual stop verification precedes any explicit recovery. A lease is not a
stop receipt. An admitted action may run after revocation, which is why the old slot
remains occupied until Node/container stop is verified.

## Diagnostic attempts and decisions (rule 17)

The initial `faults-01/` run passed before the dedicated-heartbeat-connection refinement.
Inspection showed that a generic pool alone could hide a reconnection. The implementation
therefore binds backend PID/start and server start, then `faults-02/` and `controls-03/`
verify the added boundary. This was a design correction, not evidence of a real model run.

`controls-01.log` records a probe timeout: it incorrectly expected a healthy Worker to
exit after replacement, while the Worker legitimately continued serving the replacement.
`controls-02/` then exposed a second fixture problem: the same exclusive barrier file was
created again on the next tool action, causing a synthetic model/tool failure. The fixture
now fires once per Node. The failed replacement task and all raw traces remain; the fresh
`controls-03/` run passed. Faults-02 first-action evidence is retained with impact analysis:
only repeated use of the optional fixture changed; admission, revocation and default
execution code did not change. The final browser and capacity runs use the final executor.

Two early edit commands used the wrong working directory and failed before writing files;
they were corrected using absolute paths. No missing write was reported as an implementation.
The lesson is to separate task lifecycle from Worker lifecycle in probes, and give each
fault injection an explicit firing scope. These are Agent contributions and mistakes,
not claimed Human implementation accomplishments.

## Capacity experiment

The paired 4-conversation × 3-task manifest is frozen at
`capacity-01/manifest.json`, SHA256
`cb4612b1e9db8658badf0c85e1837b377b020ffbca690b6b0820b87488aae182`.
[Recomputed metrics](capacity.json) and [raw timing/admission records](capacity-records.json)
are retained in this candidate; full per-task results and manifests remain in the private
original inventory. Both no-fault configurations completed their first recorded round.

| Metric | 1 Worker | 2 Workers |
|---|---:|---:|
| Completed / submitted | 12 / 12 | 12 / 12 |
| Observation window, seconds | 232.610938 | 140.915002 |
| Throughput, tasks/second | 0.0515883 | 0.0851577 |
| Queue samples | 12 | 12 |
| Queue p50, seconds | 96.459589 | 49.050752 |
| Queue p95, seconds | 212.401239 | 118.209841 |
| Failures / unfinished / never admitted | 0 / 0 / 0 | 0 / 0 / 0 |
| Synthetic settled exchanges / tokens | 36 / 72 | 36 / 72 |
| Unsettled exchanges | 0 | 0 |
| Actual Docker tool executions | 24 | 24 |
| Cross-conversation positive Docker overlaps | 0 | 12 |
| Maximum observed overlap, seconds | 0 | 0.551681084 |
| Analysis CPU / GiB allowance | 1 / 1 | 2 / 2 |

Throughput divides completed count by last observation minus first submission. Queue
latency uses the first locked admission timestamp minus HTTP submission start, both on
POSIX CLOCK_MONOTONIC. Nearest-rank selects sorted[ceil(p*n)-1]; n=12. The separate Docker
intervals use the same daemon's timestamp source and never overlap within a conversation.
Every task had one initial attempt/generation, with 0/1/2 completed prior public turns
according to its conversation sequence. Input/script/per-container quota were identical.
This fixture includes resource inspection, Docker lifecycle, checkpoint fsync and API
observation overhead; it is not a scheduler-only microbenchmark. Fault runs are separate.
The final candidate adds a live-stop probe and documentation after manifest freeze;
all executed Go/executor/load-script files remain identical to their frozen hashes.

## Reproduction

Use a fresh private runtime under a separately authorized root, preserving this evidence.
From `apps/evidence-web/`, initialize with `scripts/local-dev.py --issue 112 init --runtime
<root>/runtime --pg-bin /opt/homebrew/opt/postgresql@14/bin --db-port <free-port> --port
<free-port>`. Rebuild the Go binary and Web assets; build/pack TypeScript and unpack its
package at `<root>/pan-source`. Fix `PAN_IMAGE` to the digest above; configure Worker
slots 1 and 2 with `scripts/worker-control.py`. Each process shares only this dedicated
PostgreSQL and task root. Never mix old unfenced Workers during migration.

For probes, set `WEB_TEST_ISSUE=112`, `WEB108_RUNTIME=<root>/runtime`,
`EVIDENCE_DIR=<fresh output>` and `PAN_IMAGE=<fixed ID>`, then run the named `check112-*`
or `run-browser112.py` script. `check112-capacity.py` requires no concurrent test load and
creates its manifest exclusively before submission. Recompute without services using
`python3 scripts/recompute112.py <capacity evidence directory>`.

`WEB112_TEST_DATABASE_URL` enables the real PG ownership tests in `go test -race -v ./...`;
the tests use unique probe schemas, remove only those schemas and never start executors.
Keep runtime configuration files private; do not paste their credentials into commands,
public logs or Handoff. The application/Node execution path filters provider/DB credentials.

## Limits

Two trusted Workers on one host/shared PG, deterministic Faux, pinned local Docker only.
No real Provider, benchmark, scoring or deployment calls; no main modification. Coding
Agent token totals are unavailable, recorded as unknown. Admission counts are authorization
records, not proof that every admitted action reached its side effect; incomplete model or
tool observations remain unknown. Performance does not extrapolate to Kimi or production.
The two-Worker configuration permits twice the analysis CPU/memory aggregate; no minimum
speedup is required or implied. Independent high-risk review remains the Regulator's job.


## Final accounting and retained failures

The ownership runtime retains 60 tasks: 37 completed, 6 cancelled, 1 failed, 13 interrupted,
3 superseded; 61 attempts and 179 checkpoint rows. The separate legacy runtime retains
44 tasks: 19 completed, 9 cancelled, 4 failed, 7 interrupted, 3 blocked, 2 superseded;
45 attempts and 32 checkpoint rows. Controlled failure/interrupt cases are intentional
negative evidence; the failed controls-02 replacement fixture is separately disclosed.
No original task or consumed record was reset.

Across both databases, 194 public model settlements report 388 synthetic tokens; three
settlements report unavailable usage. Seven additional model-start observations have no
public settlement. A start observation is not proof of a provider send (some are fenced
before exchange), so these are conservatively uncertain observations, not seven asserted
paid calls. The ownership runtime records 136 model and 84 tool admissions; an admission
is not necessarily an executed effect. There are 116 public sandbox-result observations
across both runtimes. Late private output is preserved separately. Real Provider,
benchmark and scoring calls remain zero; coding-agent token usage is unknown.

All owned API/Worker/Node/container processes are stopped. Both dedicated PostgreSQL
clusters were dumped, then stopped; every started task has cleanup confirmation. The
final isolation scan checked 280 stdout/stderr/CSV files without the private synthetic
canary. See `final-ledger.json`, `final-stop-and-isolation.json` and the two PG stop logs.

Resource samples: 122; minimum host free 27176378368 bytes; maximum cumulative owned plus Docker increment 50308403200 bytes, below 57982058496. Baseline remains 48503971840 bytes; no pruning or shared cleanup.

Final private inventory: `evidence/inventory-final.json`, 4413 entries, SHA256 `2100e4898e244d030f9173f238647620bcad92cd9f40200e2a11dceae884c7d6`. It binds stopped runtimes/DB dumps, all diagnostic outputs, installed package and executed binaries; candidate source is separately bound by the full Handoff commit SHA.
