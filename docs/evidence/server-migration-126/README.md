# #126 Criteria1.1 — Linux deployment candidate

Implementation/package source: `884b1617d1975e8b6bba96fa6106c3f962d750d2`.
Base: `db498de78b640167b43e90432fa495bb8be93c38`. Final Handoff binds the full
candidate SHA; subsequent changes are verification helpers, tests and documentation,
not deployed business code. Independent Regulator review is pending.

- [Final accounting](summary-final.json): two real completed tasks,12 sends (known12,
  unknown0),input54,804/output7,809; cache-write unknown for all12 exchanges.
- [Result oracle](verified-live-results.json):89 original rows,5 valid failures,
  every CSV cell/source hash/pointer checked, actual follow-up received first answer.
- [Sandbox checks](sandbox-checks.json):12 observed Docker executions across two
  successful Faux and two live tasks,1CPU/1GiB/network-none/non-root/no GPU/key.
- [Lifecycle before](lifecycle-before.json), [after](lifecycle-final.json): healthy
  repeated start kept Worker PID; disconnecting the access SSH tunnel did not stop
  services. Quiescent stop confirmed all owned processes gone; fresh start changed
  PIDs but all task/history/events/artifact hashes remained equal, sends stayed12.
- [Package negatives](package-negative-checks.json), [runtime identities](runtime-identities.json):
  actual package tampering/platform mismatch rejected, running package unchanged.
- [Linux gate negatives](resources-final-rooted.txt), [final sample](resources-final.json):
  project bytes and shared image logical size separate; each relevant filesystem
  meets20GiB. Boundary equality passes, minus1byte/unknown/profile errors reject
  before container creation; external symlinks excluded; Mac formula unchanged.
- [Service environment](direct-service-environment.json): no proxy environment in
  business services, only Worker receives Kimi key. Server made real requests to
  the fixed official endpoint; no new paid account or GPU/benchmark work.
- [Copy integrity](raw-copy-integrity.json): remote task originals copied locally
  and hashes matched;997 original release files unchanged.

C-LINUX-01–06: Builder checks completed; this is not an independent Verdict.
Raw API/browser/Trace/accounting, failed attempts, original CSV/JSON, initial Linux
baseline and private login mirror remain in the Handoff's private Evidence directory.
The server's live instance remains healthy; both Faux instances are stopped, no
active tasks or remaining analysis containers. Dedicated PG/Redis/API/single Worker
bind loopback; Mac accesses port8127 through a separately controlled SSH tunnel.

[Operator commands and limits](../../../apps/evidence-web/deploy/README.md).
The package's original embedded README was created before this completed rollout
and retains its earlier blocker notice; use this candidate's current manual. Program
bytes and manifest were not silently overwritten. Mac historical databases/traces
remain on the Mac; only the fixed authorized report was imported into new Linux
storage. In-flight real Kimi recovery is unsupported.

## Failures, corrections and ownership

The initial `resource_sample_unknown` is preserved below and in the partial SHA.
Master's Criteria1.1 authorized the platform profile instead of fabricating a Mac
Docker.raw. The first actual Faux task then failed: inherited umask077 reduced
explicit0444 input files to0400, so the container's non-root user could not read
/input/task.json. The subsequent missing stage1 output was a consequence, not a
separate root cause. Deployment-only Worker umask022 restored intended file modes;
private data/task directories stay0700. A fresh instance then completed two turns.
All three Faux tasks and both real tasks remain attributable; no failed task was
rewritten or silently rerun. No real task failed or was retried by the Builder.

Initial Docker downloads encountered the existing invalid daemon proxy and registry
EOF. After Master restored the temporary proxy and a direct auth-endpoint diagnostic
returned200, the subsequent download succeeded; all earlier logs remain. No daemon
configuration, global package manager, other project or GPU was modified. Temporary
resource probes initially used OS /tmp for synthetic files; those exact probe roots
are recorded in old logs and retained, then the final probe was rerun with project
TMPDIR. No other user's files were scanned or removed.

Human chose migration and authorized the account; Master adjudicated accounting;
Builder adapted deployment and performed the checks. This is deployment evidence,
not new benchmark results, personal implementation attribution or approved resume
facts. It does not resolve #115's archive-coordination defect.

## Preserved Criteria1.0 partial record

# #126 Criteria1.0 — partial Builder candidate

Base: `db498de78b640167b43e90432fa495bb8be93c38`. Product deployment only.

Status: blocked before service deployment. [SC-LINUX126-RESOURCE-01](https://github.com/pym96/Pan-agent/issues/126#issuecomment-6138680732) requests the missing write scope and Linux resource accounting policy. This is not a completed Linux migration or an accepted candidate.

Implemented within scope: explicit Linux package lock for OS/architecture, source SHA, Pan tar, Redis and analysis image; image platform verification; installation and lifecycle package inventory validation; image propagation from the package into the deployment config; wo126 deployment namespace; Go build concurrency two; safe Pan tar extraction compatible with Python 3.10. Existing macOS pinned input hashes remain unchanged.

Evidence:
- [Linux resource probe](linux-resource-probe.json): unchanged executor rejects Linux before any Docker execution because macOS Docker.raw is absent.
- [macOS operator checks](operator-tests.txt), [Linux operator checks](operator-tests-linux.txt): seven tests each, including package byte tampering, OS/architecture mismatch and existing PID/secret/fault/stop invariants.
- [Navigation](SOURCE_OF_TRUTH.md).

C-LINUX-01: unit-level identity rejection demonstrated; actual Linux package/build/deployment identity not yet verified.
C-LINUX-02–05: NOT_EVALUABLE; service, Faux, real two-turn and restart evidence are not present.

The controller credential was checked for presence only. No model requests, analysis tools, containers, services or GPU jobs were started. Official PostgreSQL14.18 source and checksum were downloaded into the project-owned remote directory and retained; no database was installed. Docker image acquisition failed first on the server's existing daemon proxy, then on local registry EOF; neither shared daemon configuration nor existing resources were changed.

Decision record: expected migration issues in deployment hashes exposed an earlier, unconditional macOS-only resource gate in executor/resources.mjs. A direct read-only Linux invocation reproduced resource_sample_unknown. Modifying that executor is outside Criteria1.0. Do not invent a Docker.raw, bypass the resource check, or rewrite packaged executor bytes. Keep the Mac historical budget unchanged; the Linux measurement roots/baseline require Master adjudication. Human set the migration goal, Builder implemented this partial adaptation and diagnosed the blocker; independent Regulator has not reviewed it.
