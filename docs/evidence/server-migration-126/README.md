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
