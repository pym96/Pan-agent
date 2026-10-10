# #113 Criteria1.0 Builder report

Candidate only; independent Regulator decides acceptance. Baseline
`b2e0f6ecff00f97eb05c5c115b7115636ac07ddb`, branch `workorder/113-candidate`.
Contract: https://github.com/pym96/Pan-agent/issues/113#issuecomment-6095083300.
Human specified cache purpose, architecture and budgets; Builder implemented and
ran these checks. No project/resume fact is promoted by this report.

## Delivered behavior

Two existing task GET routes now use an optional Redis cache with PG-backed
authentication/ownership on every query. Cache identity includes account, object,
query and version; process-bound signed snapshots cannot survive restart as hits.
Age starts before PG reads and cannot be renewed by a delayed fill. Positive
configuration values are bounded by 5s / 100ms / 2s / four slots. All control and
Worker execution decisions remain PG-based. Public artifact bodies are removed
from both cache modes; authorized downloads and metadata remain unchanged.
The existing UI warns about short display delay and shows authoritative control
feedback. Full choices and limitations: [design](../../design/pan-web/cache113.md).

## Verification and original evidence

Private evidence root: `/Users/panyiming/.local/state/pan-agent/web113/evidence/`.
[Validation map](validation.json) binds test result hashes and distinguishes
Builder checks from independent acceptance.

- `cache-tests-final-02.log`: 13 top-level tests passed with Go race detection.
  Real PG/Redis isolation, anonymous/other-account/logout, malformed/wrong-key/
  schema/MAC values, stale expiry despite extended Redis TTL, delayed read after
  invalidation, process epoch and abnormal clock, 8-query/four-slot barriers,
  actual pg_sleep and request cancellation, hanging sockets, configuration,
  authoritative controls, and a real API child SIGKILL after PG commit but before
  eviction. Includes real Redis CLIENT PAUSE with eight simultaneous queries.
  The child-only test is skipped in the parent and executed by the crash test.
- `faults-01/result.json`: 21 #112 regression checks including expired owner,
  connection/PG loss, no new stale admission, unstarted tool recovery, completed
  receipt reuse, unresolved dispatch non-replay and independent conversation.
- `controls-01/result.json`: 17 regression checks including concurrent cancel,
  late completion, replacement after confirmed stop and unrelated-resource sentinels.
- `services-01`: seven actual service checks and six browser checks. Redis clear,
  stop and restart preserve history; a Worker completes actual Pan/Docker while
  Redis is absent. Warm cache cannot bypass unavailable PG authentication.
  API/PG restart preserves history. Browser checks answer 89/23, source navigation,
  CSV download, cache equality and actual visible cancel feedback; screenshot retained.
- `integration106-01/integration.json`: original HTTP/PG/browser import, source,
  isolation, invalid-input and database-restart regression. No old database used.
- `seed-01`: all 12 actual Faux/Pan/Docker tasks completed, four conversations,
  three ordered tasks each, two accounts. CSV contents independently compared to
  the fixed source. Native TS unchanged; the accepted package is byte-identical
  to #112, and these runs exercise its installed public entry, not a replacement
  model or mocked tool. Full TS suite was not rerun because no TS Product changed.
- `go-vet.log`, UI build and source/link/scope checks accompany the above.

Reproduce the four-mode metrics with:

```sh
python3 apps/evidence-web/scripts/recompute113.py /Users/panyiming/.local/state/pan-agent/web113/evidence/experiment-01
```

See [experiment manifest](experiment-manifest.json), [all 800 request records](query-records.json)
and [recomputed measurements](measurements.json). The private original also
retains complete API logs, Redis INFO counters, warmup requests and log boundaries.

## First and only paired query experiment

One API, eight clients, identical fixed request sequence and static 4×3 dataset;
200 requests per configuration. No fault tests or Worker load mixed into these
rounds. Queries rejected by the four-slot limiter remain in the denominator.
Latency is monotonic client send-to-response-end; nearest rank ceil(p*n), n shown.
Error distributions are separately retained in measurements.json.

| Mode | 200 / 503 | Successful n | Success p50 / p95 ms | Hit / miss | Projection SQL | Auth / ownership SQL | Control SQL |
|---|---:|---:|---:|---:|---:|---:|---:|
| Off | 142 / 58 | 142 | 13.969917 / 29.772917 | bypass 200 | 1134 | 200 / 200 | 568 |
| Cold | 192 / 8 | 192 | 12.127125 / 29.124083 | 178 / 22 | 110 | 200 / 200 | 56 |
| Warm | 200 / 0 | 200 | 14.590500 / 25.441625 | 200 / 0 | 0 | 200 / 200 | 0 |
| Redis outage | 113 / 87 | 113 | 26.402625 / 45.016292 | Redis errors 200 | 897 | 200 / 200 | 452 |

All 800 requests ended; no client timeout/cancellation/unfinished observation.
Error p50/p95 ms: off 4.700250/11.801917 (n=58), cold 9.354000/14.230958
(n=8), outage 13.183250/19.540500 (n=87), warm null/null (n=0).
Cold hit rate 178/(178+22)=0.89, warm 1.0; bypass and Redis errors excluded.
Warmup is 14 additional successful requests, costing 14 auth + 14 ownership +
110 projection + 56 control SQL, separately retained. Projection in-flight peak
is 4 for off/cold/outage; warm measured queries have none (warmup peak 1).
Observed maximum hit age: cold 538ms, warm 795ms. Separate five-second boundary
tests establish age rejection; a short fast load does not establish that alone.
All successful responses across four modes have identical business bytes for
all 14 unique account/endpoint pairs.

Counts come from actual pgx query starts/completions, not assumed queries saved;
read-side ownership-refresh transactions are reported as control SQL. API max
pool 8, Worker max pool 4, dedicated PG max_connections 16. Redis 7.2.5 uses
128MiB/allkeys-lru, no persistence and fresh bounded connections per command.
Warmth reduces projection work, **not all database work**: 400 authority queries
remain. Median warm latency is higher than off in this one run; successful
samples also differ because off rejects many requests. No universal latency
improvement, production availability or capacity extrapolation is claimed.

## Identities and scope

- Redis 7.2.5 upstream tar SHA256:
  `5981179706f8391f03be91d951acafaeda91af7fac56beffb2701963103e423d`.
- Built Redis server SHA256:
  `99d12efe55a74b56b93c3910011833b51f9691580a6d8158946026249e22650c`.
- Reused Pan package SHA256:
  `70b6c7680f07f936343737f064e94cb9838aefb6264448c3639a935accce9d0e`.
- Fixed source SHA256:
  `f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab`.
- Python image ID:
  `sha256:8129910271f9764b5c05038d351ad7b9f9d94b85351355b69c5526eadd111775`.

Manifest binds binary, package, Redis, source files, workload, hardware and all
budgets before the four rounds. After the experiment only cache_test.go changed
(test WaitGroup fix plus real Redis pause test); runtime, binary and experiment
script identities are unchanged. No performance round was rerun. New runtime
namespace `web113` selects the existing #112 ownership path and 1CPU/1GiB limits;
there are no permission-state-machine or TS Product changes, no new migration.

[Exact changed-file list](changed-files.json), [original #112 preservation](baseline-preservation.json),
[resource samples](resources.json), [ledger](ledger.json), [stop confirmation](stop.json).
The old inventory's 4413 entries all matched; inventory SHA256
`2100e4898e244d030f9173f238647620bcad92cd9f40200e2a11dceae884c7d6`.

## Resource ledger and limitations

Final owned runtime: 26 tasks (17 completed, 3 cancelled, 5 interrupted,
1 superseded), 26 attempts, 78 checkpoints. 59 model and 37 tool admissions;
58 reported Faux settlements, 116 synthetic tokens, two started-but-unsettled
observations, 36 public tool-result observations. Admission/start markers do not
establish a paid model send. Real Provider, benchmark and scoring calls are zero;
Coding Agent token total unknown. Failures and uncertain work are retained.

Cumulative Docker baseline remains 48503971840 bytes; old required roots and
this task's dependencies/build/runtime/archive remain included. Last resource
sample is in resources.json; later small report/inventory/git metadata is also
part of owned storage. No prune, old activation or shared-service mutation.
All owned API/Worker/Node processes, Redis, PG and analysis containers stopped.
The DB dump, stopped data directory, source tar/build and task archives remain.

## Learning record (rule 17)

The first cancellation probe sent replacement-only question text; the service
correctly rejected it. `cache-tests-02.log` and `-03.log` retain that failure;
fix was to send the existing cancel contract, not weaken control validation.
A final race run exposed WaitGroup Add racing Wait in the hanging-server fixture;
`cache-tests-final.log` remains. Closing and joining the accept loop before Wait
removed the test race, then `cache-tests-final-02.log` passed. This changed no
cache implementation or paired measurements. A few source/check shell commands
used an incorrect working directory and failed before writes; they were rerun
with the candidate root. No host governance or historical evidence was changed.

A design correction during implementation preserved the existing read-side
owner refresh on misses; omitting it would change #112 interruption visibility.
Its SQL is now counted separately rather than silently folded into cache savings.
The useful evidence is the explicit cost/boundary, not merely adding Redis.
Human chose the objective and architecture; Agent performed implementation and
local tests. Independent acceptance and disclosure remain separate decisions.

Final raw originals are bound by [inventory-binding.json](inventory-binding.json).
Redis server keyspace-hit deltas independently match client counts: off 0,
cold 178, warm 200; [counter reconciliation](redis-counters.json). Cache miss and
command/connection counts are retained without treating failed Redis operations
as misses.
