# #113 public query cache (candidate)

Criteria1.0, base `b2e0f6ecff00f97eb05c5c115b7115636ac07ddb`.

`cache.go` wraps only the two GET projections. Cookie authentication (2s) and
current account/object ownership (2s) run against PG before every hit. Keys bind
namespace, random API epoch, public-v1 schema, server account, route/object and
canonical query parameters. A process-local HMAC authenticates the complete
key/timestamps/body; corrupt or transplanted values are misses. No signing key
or credential is stored in Redis. Other APIs, Worker decisions and Native Pan
never consume cache values.

The response projection strips embedded artifact `base64` bodies recursively;
metadata and existing authorized download routes remain. The same projection
is used on bypass, miss and hit, including historical attempts. Public evidence
and public event projections remain visible; raw process logs, Provider-private
state and checkpoint payloads never enter this representation.

## Age and interruption

Sample immediately before reading PG, before projection SQL and serialization.
Age is max(process monotonic elapsed, wall elapsed) from that sample. Both must
be nonnegative and under TTL. The process checks wall-versus-monotonic drift;
more than 100ms marks its clock unusable until restart. Small backward changes
cannot extend lifetime because monotonic age still advances. A hit is checked
again immediately before response selection. Fill uses only remaining lifetime,
not a fresh TTL. Redis expiry is a space optimization; signed age is authoritative.
A delayed SET can physically retain bytes longer than the bound but cannot make
them eligible for a hit. Selection age excludes subsequent network delivery.

The epoch and signing key are regenerated on every API start. No previous API's
cache clock is trusted, including after a reboot. This deliberately sacrifices
warmth on restart and avoids cross-process/cross-machine clock assumptions. The
supported deployment is one API on a trusted host; concurrent API instances are
not measured or coordinated. Broken clock conservatively yields 503 even after
PG read rather than inventing age; restarting API establishes a new epoch.

Successful POST handlers commit through unchanged PG control paths. Afterwards,
a bounded index of up to 1024 recently requested keys is best-effort evicted in
one DEL. Failure never changes the committed response. Process interruption,
index overflow, Worker writes, and an older read refilling after DEL are covered
by the sample-age bound. No invalidation queue, durable-cache dependency or
Worker Redis connection is introduced.

## Bounds and accounting

- `WEB_CACHE=0|1`, default 0. `WEB_REDIS_ADDR` explicit loopback IP:port;
  `WEB_CACHE_NAMESPACE` (default evidence-web). Operational setup uses an owned
  Redis at 127.0.0.1:63113, 128MiB, allkeys-lru, no RDB/AOF.
- `WEB_CACHE_TTL=5s`, `WEB_REDIS_TIMEOUT=100ms`,
  `WEB_PROJECTION_TIMEOUT=2s`, `WEB_PROJECTION_SLOTS=4`. Positive values at or
  below these contract ceilings are allowed; invalid values refuse startup.
- RESP client has one fresh connection per operation, no connection pool or
  retries. Context total deadline covers dial, write and bounded read; cancellation
  closes the socket. GET and optional SET each occur at most once per query.
- A nonblocking four-slot semaphore encloses projection fallback; excess is 503.
  The 2s context includes acquiring PG connections and all projection SQL.
  API pgx pool max 8 (four projection work plus auth/control headroom); Worker
  pools remain max 4, dedicated PG max_connections=16. All HTTP handler work has
  a 30s request context; auth/ownership have independent 2s caps. Under pressure
  authority queries can themselves fail; availability is not promised.
- The existing read-side ownership refresh runs only on a projection miss/bypass,
  within its deadline, and is counted separately as control SQL. The Worker
  coordinator remains authoritative; a cache hit can display old state <=5s.
- pgx actual query-start counters classify auth, ownership, projection and
  read-side control independently. Transaction commands are included in control
  counts. Per-query logs contain counts, not SQL text, keys or credentials.
  Redis INFO deltas and complete client records supplement these counts.

## Verification seams

`viewCache` has package-private hooks used only by Go tests; there is no HTTP or
environment flag to enable barriers. Tests use a unique schema in the dedicated
PG and real Redis, actual hanging TCP peers/pg_sleep, and a killed API child at
the post-commit/pre-eviction barrier. Process/clock identity and slots are checked
separately from performance. HMAC is cache-integrity defense, not protection
against a malicious host or compromise of the API process.

Scripts: `seed113.py`, `cache113-experiment.py`, `recompute113.py`,
`check113-services.py`, `browser113.mjs`; see the evidence report for exact runs.
Measurements describe this local deterministic workload only. No production
latency/capacity or true model-quality claim follows from a cache hit.
