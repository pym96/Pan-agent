# Pi service experiment — #142

Status: Builder Handoff evidence complete; independent acceptance remains separate. Not a production capacity claim.

## What was built

The experimental Go service accepts idempotent conversation tasks, persists tasks and ordered events in PostgreSQL, executes text-only turns through the actual published Pi SDK, and serves committed events over SSE. Pi's persisted native session files retain finalized model context; PostgreSQL remains the authority for task admission, status and observable events. Neither store pretends to transact atomically with the other. Uncertain execution blocks that session and is not automatically sent to the model again.

The model endpoint in every experiment is a deterministic local streaming fixture. Pi's real provider adapter, AgentSession and SessionManager still execute. Synthetic usage fields are fixture values, not measured LLM token usage. No paid provider or GPU was used. Human chose the project direction and resource budget; Master defined the work order and adjudicated scope; Builder implemented and measured this service. Independent acceptance is separate.

## Reproduction identities

- Starting main: `b331feaf6ce67fed7ec3da457999ad4ca5ccff4f`.
- Frozen final experiment implementation and generator: `aa1d1afcfb4c822e9082da4b4372f4ea824d8906`.
- Pi package: `@earendil-works/pi-coding-agent@1.3.0`; exact transitive versions/integrities in its lockfile. Published provenance content points to upstream `71023aec1546d6d677a65669c5665c0927ce0dd0`, not the initially inspected moving main. See [attribution](../../../platform/pi-service/UPSTREAM.md).
- Node 22.23.3, Go 1.24.13, PostgreSQL 17.11. Docker image digests and environment are in the frozen Compose file and each run's inspection record.
- Final control and treatment use the same binary, load generator, 4-connection control pool, 8-connection event-read pool and `GOMAXPROCS=1`. Only `SSE_TAIL_CACHE` changes.

## Measurement protocol

Each level ramps 25 subscriptions per 50 ms, then holds for 120 seconds. The default workload is **one persisted session with many subscribers**, not 10,000 independent users or concurrent models. Tasks are offered open-loop every five seconds during the hold, independently of completion (24 offered tasks). The executor pool permits two active sessions; a single conversation executes serially. Ten percent of subscribers reconnect with their last complete, validated event cursor. Each receipt retains the individual connection IDs, event IDs, heartbeats, reconnects, errors and bytes.

Runs use fresh session namespaces and the same deterministic prompt/arrival schedule. The three cache-off 10,000-connection controls precede the cache-on levels; order was not randomized. Completed history remains in the same owned database, so its size grows across runs. This is an engineering comparison with declared ordering and shared-host noise, not a controlled claim that every latency difference is solely caused by caching.

Latency percentiles use nearest rank `ceil(q*n)-1` and report sample counts. Client completion polling includes its 100 ms interval and request delay. Database queue/first-text/terminal times are separate. A client timeout does not prove rejection: acknowledged submissions, database admissions, client-observed completions and durable terminal states are counted independently. Post-run snapshots can contain commits after a client disconnects; their unobserved tail is not automatically labelled lost delivery. Internal gaps compare only the canonical committed IDs up to each client's observed high-water mark. Numeric gaps caused by other sessions are normal.

Database `now()` values identify transaction starts, not commits or the precise instant a row changes. Therefore `dbQueueP95Ms`, `dbFirstTextP95Ms` and `dbTotalP95Ms` in raw arithmetic are **transaction timestamp intervals**, not exact queue/commit latency. A claim transaction can begin before the admission transaction commits, producing a small negative interval. Raw values are preserved without clamping; exact durable-admission-to-claim latency was not instrumented. Client completion durations use Go's monotonic clock and do not have this timestamp limitation.

Pool acquisition durations and event-read durations are sums across concurrent callers, not wall-clock elapsed time. Event-read duration includes waiting for a pool connection and reading rows; it is not isolated PostgreSQL execution time. Sample deltas run between the first and last successful metrics samples, whereas whole-run before/after snapshots are retained separately. Docker CPU/memory, process RSS/file descriptors and Go heap/goroutines are sampled maxima, not continuous peaks. A write failure can also be an intentional reconnect closing its old socket; it is not automatically a slow-consumer incident.

The declared running stack envelope includes the generator: PostgreSQL 1 CPU/1 GiB, Go API 1 CPU/2 GiB, Pi plus fixture 1 CPU/4 GiB, generator 1 CPU/1 GiB. Source is mounted read-only, ports are host-loopback only, file-descriptor limits are container-local. The generator and service share a server; contention is included, not externalized. Initial dependency installation/build preparation used owned but uncapped host processes and was not comprehensively measured. Subsequent builds use the spare 1 CPU/1 GiB container slot with no load running. No claim that initial preparation satisfied the running-stack cap.

The SSH shell and Docker CLI collecting observations run on the host outside those container quotas; their overhead was not separately measured. The 4 CPU/8 GiB statement describes the declared service/generator container limits, not a measurement of every host-side orchestration instruction.

## Failures that changed the design

1. **Published package identity differed from moving source main.** The initial source revision was insufficient to identify the executable. The npm lock and published provenance content establish the package correspondence; the evidence does not claim independent Sigstore cryptographic verification. The package also did not export an API visible in source, so integration uses the actual published exports.
2. **A health probe reported PostgreSQL ready before its final TCP server.** The initial Unix-socket readiness check observed the image's temporary initialization server. API connection failed safely. The owned health check now probes TCP; initial failure output is retained.
3. **Per-subscriber replay reads amplified database work.** Early 10,000-subscriber pilots retained heartbeats while task observation failed. Every subscriber queried committed events after a notification, exhausting the shared connection pool. A bounded shared tail amortizes reads for active subscribers; older cursors still fall back to PostgreSQL. Cache data are disposable, bounded and never authoritative. The final matched cache-off/on comparison isolates this switch; earlier multi-change pilots do not.
4. **Event-read pressure could prevent terminal persistence.** A model task timed out, but its terminal write could not acquire the shared pool before its own deadline. The row remained running until explicit recovery. Separate bounded control/read pools protect control operations; terminal writes are transactional and idempotent. Three bounded state-only persistence attempts precede service fail-stop. A PostgreSQL constraint-injection probe verifies that unresolved persistence never publishes a false completed event and restart exposes interruption. No model retry is added.
5. **The first generator advanced its cursor before a full SSE frame.** It recorded an `id:` line before receiving valid data and the terminating blank line. This could overstate delivery and skip an unfinished event after reconnect. The final generator accepts only complete JSON frames whose payload ID matches the SSE ID; partial/malformed/mismatched frames have negative tests. Earlier receipts remain diagnostics rather than final delivery evidence.
6. **Container CPU quota did not set Go 1.24 parallelism.** Go 1.24 defaults GOMAXPROCS from machine CPU count, whereas CPU-quota-aware defaults arrived in Go 1.25 ([official explanation](https://go.dev/blog/container-aware-gomaxprocs)). Final API and generator explicitly use one. This is a common final configuration, not an isolated claim of measured improvement.
7. **Database timestamps were not precise queue timers.** Source inspection and two negative intervals (−2.916 ms and −1.987 ms) in the intermediate `20261017T021420` control exposed the transaction-start semantics of `now()`. The final report retains and qualifies those fields rather than changing the frozen code mid-matrix or clamping inconvenient values. A future latency-focused experiment should capture explicit admission/claim observation times and distinguish commits from transaction starts.

## Correctness checks and limitations

Checks cover actual Pi two-turn context persistence, duplicate and conflicting submissions, session isolation, ordered reconnect, startup interruption without resend, historical continuation after restart, bounded queues, slow-reader disconnection, terminal write rollback/idempotence and progress while all event-read connections are occupied. Raw probe results and logs are inventoried in the manifest. Unit/race checks alone do not imply that PostgreSQL integration ran: its explicit database-backed execution is recorded separately.

This is a single-owner, single-controller development service with a synthetic no-tools workload and short measurement windows. It has no public authentication, distributed scheduler, long-duration availability evidence or real-model capacity result. The cache-on/off result cannot be generalized to 10,000 independent model conversations. Historical failed attempts are preserved rather than replaced by later successful runs.

## Final matrix

All 13 frozen-source runs admitted and durably completed all 24 offered tasks (312 total), with matching 312 Pi runtime events and 312 terminal events. No final-run task errors, internal committed-ID gaps, duplicate IDs or regressions were observed. Every requested connection established and met the heartbeat/activity definition at the end. Each per-run p95 below has **24 monotonic client completion samples**. The complete raw arithmetic is in [results.json](results.json).

| Cache | Connections | Subscribed sessions | Repeat | Client completion p95 (ms) | Read queries, sampled interval | Unobserved suffix IDs at cutoff |
|---|---:|---:|---:|---:|---:|---:|
| off | 10,000 | 1 | 1 | 611.9 | 176,705 | 34,044 |
| off | 10,000 | 1 | 2 | 578.7 | 206,708 | 41,830 |
| off | 10,000 | 1 | 3 | 503.4 | 177,357 | 37,235 |
| on | 100 | 1 | 1 | 314.8 | 253 | 0 |
| on | 100 | 1 | 2 | 318.7 | 253 | 0 |
| on | 100 | 1 | 3 | 322.8 | 253 | 0 |
| on | 1,000 | 1 | 1 | 823.0 | 253 | 0 |
| on | 1,000 | 1 | 2 | 831.2 | 253 | 0 |
| on | 1,000 | 1 | 3 | 825.5 | 253 | 0 |
| on | 10,000 | 1 | 1 | 4503.4 | 253 | 0 |
| on | 10,000 | 1 | 2 | 4450.2 | 253 | 0 |
| on | 10,000 | 1 | 3 | 4343.8 | 253 | 0 |
| on | 10,000 | 100 | 1 | 317.9 | 253 | 0 |

Every run offers 0.2 tasks/second; this is a fixed offered workload, not a saturation throughput claim. The optional 100-session run has 100 subscribers per session, but only 24 sessions receive one task each; 76 receive heartbeats only. Thus 2,400 subscribers receive task events and 7,600 do not. It is not an equally intense multi-conversation fan-out comparison.

At 10,000 hot-session subscribers, cache-off p95 was 503.4–611.9 ms and left 34,044–41,830 aggregate suffix IDs unobserved at disconnect. Cache-on p95 was 4,343.8–4,503.4 ms, with zero unobserved suffix IDs. Read-query sample deltas fell from 176,705–206,708 to 253. Original subscribers close at the deadline; a separate post-load cursor probe tests suffix recoverability, not whether the original connections subsequently caught up.

The three outcome axes must remain separate: database read work, subscriber delivery completeness at the deadline, and task completion latency. In the first cache-on 10,000-connection run, read queries fell and the post-run unobserved suffix reached zero, while client completion p95 rose. This is evidence of a trade-off, not an overall performance improvement. API CPU saturation and prompt fan-out are a plausible explanation; sampled correlation and source inspection do not prove the root cause. No additional tuning was inserted into the frozen matrix to hide that result.

### Sampled resources at 10,000 hot-session subscribers

| Cache | API CPU peak range | PostgreSQL CPU peak range | API RSS peak range (MiB) | API FD peak | API goroutine peak |
|---|---:|---:|---:|---:|---:|
| off | 67.0–79.3% | 101.5–104.6% | 494.3–519.6 | 10,021 | 20,032 |
| on | 100.3–100.6% | 5.0–5.6% | 464.5–497.1 | 10,014 | 20,017 |

CPU 100% means one core; short sampled percentages can slightly exceed 100% even with the container quota set to one. The observed pressure shifts from PostgreSQL toward the API. This correlation does not isolate which API operation causes the task-latency increase. Generator and Pi container measurements, application bytes/events and actual offer-schedule lag are retained in results.json. The maximum measured offer delay relative to the fixed schedule was 5.102 ms.

## Post-load replay, final checks and shutdown

The independent post-load read-only probe grouped original subscribers by `(session, last complete cursor)`. All distinct missing suffixes matched the canonical committed IDs. This issued one new request per suffix group, not 10,000 restarted clients, and made zero model calls. Total probe duration was 333.030 seconds. A fresh cache reconnecting near a page boundary took up to **10.145 seconds**: after a partial first page, the current handler can wait for its 10-second heartbeat before fetching the next page. Ordered recovery works, but immediate catch-up is not established. The raw per-group IDs and timings are in `raw/replay-suffix-results.json`.

The idle baseline has three timestamped resource/metrics samples with no subscribers or model work. Final actual-Pi smoke, restart/history continuation and terminal-persistence failure probes succeeded. The separately recorded PostgreSQL integration test covers occupied read-pool connections, idempotent terminal writes and a failed terminal transaction followed by successful retry; local race tests also passed. A slow-reader fixture probe disconnected its non-draining client within the bounded write policy. It uses injected database text, not a claimed model response.

At **2026-10-17T02:57:14Z**, the owned Compose containers and network were stopped/removed with `docker compose down`. Named PostgreSQL and Pi data volumes remain, together with a database dump, Pi context archive and pre-stop logs/inspection. No owned executor/load remains running. The unrelated `comfyui-dev-cu124` container remained running. Reproduction and stop commands are in the service README. Diagnostic scripts naming `pan-pi-142` target only this owned stack; an independent reviewer should use a separate Compose project/volumes for isolated probes rather than mutate these retained histories.

## Evidence inventory

[manifest.json](manifest.json) binds the durable raw files and executed source archive. [results.json](results.json) contains the full final matrix, diagnostic summaries, runtime-event reconciliation and resource arithmetic. The Handoff binds the final candidate SHA; runtime/load files remain byte-identical to executed `aa1d1afcfb4c822e9082da4b4372f4ea824d8906`. Later candidate changes are documentation, evidence arithmetic and the separately identified read-only suffix probe only.
