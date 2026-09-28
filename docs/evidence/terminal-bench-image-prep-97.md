# #97 Criteria1.3 — image cache preparation candidate

Builder candidate from accepted base `3571f80c57fb42cdd4a6f2899c5607e5ba8b1841`, branch `workorder/97-candidate`. Independent Regulator review is pending. This is a preparation-stage Handoff, not a completed benchmark or accepted result.

## Outcome and scope

Exactly32 unstarted task IDs were inspected;30 now have cached Linux images with actual image ID, RepoDigests and supported amd64/arm64 architecture. Two remain `pull_failed`: `mteb-retrieve` and `pytorch-model-recovery`. No resource-blocked or unattempted rows remain. Two polyglot images were reused from cache;28 additional images were obtained. The complete row-level references, inspections and attempts are in [the summary](terminal-bench-image-prep-97-summary.json).

The fixed reservation index SHA256 is `294a67cb9db4a0efa982859f85ac8abfed1e13779de558c434c3c5660acfca4a`; the32 IDs are disjoint from57 reserved IDs. Official references come only from full-manifest SHA256 `bfb1b8f64ca539c9c9cc88de4450c0845c38dcc8d924a7d85c126b8794e3a403`. No solutions were read. Neither cache identity nor the4CPU/8GiB authorization establishes task or scoring readiness.

## Execution and limits

Preparation ran from 2026-09-28T06:12:19.409214+00:00 to 2026-09-28T07:16:11.452955+00:00. There were34 serial Docker pull invocations, at most3 per image, below the contractual maximum5. Final read-only inspection confirmed all30 cached identities and both absent references. Every started pull has an exit receipt; no pull remains running. There were zero model calls, task/scoring executions, campaign prepare/init/migrate/run commands or Docker cleanup operations. Runner implementation, official task configuration and Docker VM settings were unchanged.

The original Docker baseline remains48,503,971,840 bytes (owned baseline0). Sampling sums allocated `st_blocks*512` for the persistent working directory and all visible restored work roots (`wo97-live`, `wo97-runner-disk39`, `wo74-work`, `wo94-kimi`), plus `max(0,currentDocker-originalDocker)`. The missing campaign is not used to exclude other visible owned files. Symlinks count0 as in the accepted sampler; absent paths are explicitly represented, and sampling errors stop new pulls.

All 1634 sampled points met free>=20GiB and increment<39GiB. Minimum observed free: 42.70051GiB; maximum observed increment: 37.14726GiB. Final free: 42.94443GiB; final increment: 36.90332GiB. These are sampled observations, not proof of every instant. No resource stop occurred; no baseline reset or cleanup was used.

## Failures and operational decision

`mteb-retrieve` repeatedly retried one layer. After about706seconds, Builder stopped the pull to prevent one download from occupying the whole queue; exit143 and process termination were recorded. That attempt remains a failed, interrupted download, not a Docker-declared permanent failure. The original script, progress, controller output and launch receipt remain under `pass1-*`.

Builder then added a600second per-pull timeout and deferred the interrupted item while processing the rest. `pytorch-model-recovery` hit that timeout and also exited143. Already downloaded layers were retained. Other network failures used bounded backoff: `query-optimize`, `rstan-to-pystan` and `sanitize-git-repo` subsequently succeeded; their failed attempts were not removed. See `operation-adjustment.json`, per-image logs and event receipts. These are image-distribution failures, not model or task failures. The two references could be inspected/retried under a future continuation within the remaining attempt budget; this Handoff does not claim all32 images are ready.

## Durable evidence and validation

Raw evidence root: `/Volumes/WD_BLACK/pan-agent/wo97-full-live-20260925/image-prep-criteria13`.

- `inventory.json`:215 meaningful files, SHA256 `628105a3564ce92b687980e03bf9911cb2995be34363872c909737cc9cf4e04c`; AppleDouble filesystem metadata is excluded.
- `progress.json`:32 rows, full inspect/pull times, exit codes and relative log paths.
- `events.jsonl`:command/exit records and resource samples; `logs/` and `final-inspect/`:raw outputs.
- `protected-before.json` / `protected-after.json`:15 protected files identical, including all11 historical ledgers and both existing activations.
- `verification.json`:scope/identity, no reserved overlap, serial execution, maximum attempts, process exits, resource formula and final cache checks.
- `prepare.py`, `pass1-prepare.py`, `verify.py`:the operation and verification scripts; scripts are external operational artifacts, not runner modifications.
- `host-acceptance.log`:host path/package acceptance passed, including259 retained Python tests. These are offline repository checks, not official benchmark tasks or scores.

Local resumable progress and scripts: `/Users/panyiming/.local/state/pan-agent/wo97-image-prep`. Logs and progress were fsynced to local persistent storage and the external volume during pulls and after each task. External volume unavailability stops the controller. Live raw files are not committed to Git; only these allowed reports and Evidence navigation are committed. Master owns SOURCE_OF_TRUTH updates.

## Criteria evidence mapping

- C-IMG97-01 v1.3:32 exact rows, official references,30 final cached identities and2 explicit failures; raw inspect output and summary.
- C-IMG97-02 v1.3:34 serial pulls, bounded retries and timeout receipts,1634 resource samples,11 unchanged ledgers, zero real task/model/scoring calls or cleanup; event and preservation records.
- C-IMG97-03 v1.3:non-temporary progress and external originals, every attempt retained, permitted report-only candidate, remaining blockers explicit. Independent Regulator decides Verdict, using read-only inspections and raw evidence without repeated pulls or tasks.

## Remaining boundaries and learning record

Campaign restoration remains blocked by the missing segment2 post-run journal/score originals. Nothing here reconstructs that state, reuses old activation or releases a new run. Future4CPU/8GiB runner adaptation and durable campaign execution require their separate contract and independent review. Historical57 reservations remain non-replayable; no new benchmark, VPF or resume fact is promoted.

Human selected image preparation and the resource limits; Master authored the stage contract; Builder performed inspections, serial downloads, records and timeout choice; upstream registries supplied the images. The prior temporary-directory loss motivated persistent local progress and immediate external copies in this stage. Its exact system cause remains unknown. The new operational tradeoff is explicit: bound a slow pull, retain its failed evidence and continue other images rather than assume the slow image is permanently unavailable.

## Complete32-row disposition

| Task | Cache status | Pull attempts |
|---|---|---:|
| mcmc-sampling-stan | cached | 1 |
| mteb-retrieve | pull_failed | 1 |
| polyglot-c-py | cached | 0 |
| polyglot-rust-c | cached | 0 |
| portfolio-optimization | cached | 1 |
| protein-assembly | cached | 1 |
| prove-plus-comm | cached | 1 |
| pypi-server | cached | 1 |
| pytorch-model-cli | cached | 1 |
| pytorch-model-recovery | pull_failed | 1 |
| qemu-alpine-ssh | cached | 1 |
| qemu-startup | cached | 1 |
| query-optimize | cached | 2 |
| raman-fitting | cached | 1 |
| regex-chess | cached | 1 |
| regex-log | cached | 1 |
| reshard-c4-data | cached | 1 |
| rstan-to-pystan | cached | 3 |
| sam-cell-seg | cached | 1 |
| sanitize-git-repo | cached | 2 |
| schemelike-metacircular-eval | cached | 1 |
| sparql-university | cached | 1 |
| sqlite-db-truncate | cached | 1 |
| sqlite-with-gcov | cached | 1 |
| torch-pipeline-parallelism | cached | 1 |
| torch-tensor-parallelism | cached | 1 |
| train-fasttext | cached | 1 |
| tune-mjcf | cached | 1 |
| video-processing | cached | 1 |
| vulnerable-secret | cached | 1 |
| winning-avg-corewars | cached | 1 |
| write-compressor | cached | 1 |
