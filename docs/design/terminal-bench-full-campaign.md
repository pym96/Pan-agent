# Frozen full Terminal-Bench campaign

WorkOrder #96, Criteria1.0; Product evaluation tooling. This design is a candidate, not an accepted live result. Product Runtime/Provider/tools, the five-task manifest/package lock and all historical ledgers remain unchanged.

## Population and preparation

`full-manifest.json` preserves the registry order and all89 unique IDs from terminal-bench2.0 at source `69671fbaac6d67a7ef0dfec016cc38a64ef7a77c`. Registry SHA256 `da1446bce05eabbd72a25eb9eef5a2f5db94645ce88c28e2497581433b3d2e60`. Each entry records official config, immutable config URL/hash and full source-file Git blob inventory. Initial preparation status is unprepared. `full-acquire.py` rebuilds from that registry/tree and downloads only task.toml, never solutions. Frozen manifest hash: `bfb1b8f64ca539c9c9cc88de4450c0845c38dcc8d924a7d85c126b8794e3a403`.

The new CLI is separate from the legacy five/signed-subset CLI. `prepare` validates a supplied original source checkout by blob hashes, checks official resource requirements against2CPU/4GiB and resolves one cached image at a time. Missing source/image, unsupported image architecture or excessive official requirements remain explicit unstarted records; no task is removed from89. It neither pulls/builds all images nor starts containers. Image pulls/builds/source provisioning are an operator preparation step governed by the next live WorkOrder, then this CLI records the resulting digest before Master signs it. No silent resource reduction, test edit, cache prewarming or environment substitution.

## Immutable identity, segments and authorization

`init` creates an exclusive campaign directory with dataset/package/model/budget/runner identity, mode and a fixed host resource baseline. A different location, manifest, runner, package, model, budget or offline/live mode cannot be mixed into it. Changing accepted runner requires a new campaign; #98 adds only the pinned, never-executed #97 successor described below. No merging older best scores.

A segment signs the entire existing version2/run-bound activation schema plus the full binding: exact task IDs, image digests, campaign ID/absolute root, journal checkpoint, segment index and hashes of preparation records. `status --task` proposes this binding; it does not authorize/sign it. Master still supplies the trusted signature and authority. No #93 tool dependency or production signing/private-key helper is added. Signature/window, complete binding, source/package identity and consumed-run checks precede credentials and environment startup. The existing real ledger is exclusively created for the new run, then hard-linked into that segment's evidence. No old file is reopened for append. Replay of a journal-recorded run is refused even if its global ledger is missing.

`prepare` may update preparation diagnostics; obtain the signature after preparation, since it changes the checkpoint. A stale signature fails. A source/image recheck before reservation can leave an item unstarted and recorded; later execution needs a new run/permit. Campaign-wide authorization is not inferred from an old segment.

## Persistence and crash boundaries

A Python fcntl lock, held through a helper process whose stdin is tied to the controller, serializes campaign mutations. The OS releases it when the owning process/pipe dies; no stale-PID lockfile deletion is needed. Read-only status uses immutable committed journal files and may observe a prefix during concurrent work.

Each journal record is written/fsynced to a temporary file, published exclusively by hard link, then its directory is fsynced before subsequent effects. The hash chain detects inconsistent order/content against the signed checkpoint. Unpublished pending files are evidence only. Environment reservation is committed **before** broker spawn and before any environment effect; that task is thereafter ineligible for every segment. A result is a separate atomic journal commit after raw evidence and cleanup. A crash before the result leaves unknown, even when raw result files already exist. Recovery never turns raw files into an inferred success or replays an attempt.

The original per-exchange ledger supplies reservation/send/usage/tool counters. `attemptAlreadyReserved` only skips runAttempt's second reservation; full orchestration has already called the same Ledger.start before opening the broker. Dispatch/tool effects still use frozen Ledger checks. The original CLI keeps its default behavior.

Every broker gets a deterministic project from campaign/canonical directory/run/task and a durable pending startup ticket. Before creating anything, the Python broker takes an exclusive OS lock on that ticket, checks pending, marks running and holds the lock for its lifetime. Recovery takes the same lock and fences the ticket before Docker inspection. A live broker prevents confirmation; a late broker sees fenced and cannot start. This closes the race where an empty Docker query could precede a late child creating its environment.

An open segment blocks subsequent scheduling. `recover` fences each of its reserved tasks, checks only the deterministic project, validates container project/service/image identities, stops only its owned running containers and removes only its empty labelled networks. Unknown stop or a live ticket holder leaves the segment pending. Recovery can be repeated; it never rewrites task results or consumption. A successful reconciliation allows a **new** signed segment selecting only unreserved tasks. An interrupted task remains unknown permanently in this campaign.

Cancellation is a run-specific durable request created by another CLI process, or SIGINT/SIGTERM. Admission checks occur before reservation and before broker/model execution. In-flight shutdown/cleanup follows existing deadlines; unknown cleanup never authorizes the next task. Ordinary task/model/verifier failures continue after confirmed cleanup; shared authentication/quota/daemon/address-pool/resource/cancellation failures stop subsequent work. No new artificial total runtime/request/tool/response-byte limit is added.

## Accounting, resources and scoring

The baseline Docker allocation is captured once at campaign creation. Every segment reuses it: `owned campaign bytes + max(0,current Docker bytes - initial Docker bytes) <24GiB`, with free>=20GiB (Human HF-20260927-001 / #98) and internal active disk. Sampling continues during attempts. No reset on resume; no shared image deletion/global prune.2CPU/4GiB constraints reject incompatible official requirements instead of rewriting them.

Each of89 IDs has one aggregate row. It is unstarted until reserved, unknown if interrupted without a committed result, otherwise classified from result and official artifacts. Raw reward is always separate from valid score. Current automatic validity requires actual nonempty CTRF test totals consistent with raw binary reward; a raw0 without proof remains unscored. Tasks using another scoring-evidence format remain conservatively unscored pending explicit evidence handling, never false failures or deleted rows. Official verifier logic itself is unchanged.

Counts are recomputed from original segment ledgers, including retries in the same model round and unknown/unsettled usage. Aggregate fields are explicitly known-observed sums plus unavailable/incomplete task lists, not invented full totals. Unknown elapsed durations stay null; aggregate sums include only recorded per-attempt durations. Report shows success/89, valid-scored/89 and unstarted/unscored counts. Offline controls carry `mode:offline-control` and cannot be loaded into live campaigns.

## Boundaries

#96 executes no real Provider, official task, verifier or Docker control. Offline CLI controls exercise the lifecycle; separate packed Session/Adapter controls use synthetic HTTP/tools. Future #97 must freeze actual image/source preparation policy and activate live identities. This work does not repair #95 output-length or dependency failures and does not prove a benchmark score increase.

Human H-FULL-RESUME is pending after independent technical review: inspect already-started tasks never repeated, interrupted unknown preserved, fresh segment signature and cleanup restricted to that campaign. No extra budget approval or manual test execution is requested by this design.

## #98 disk policy and preparation-only successor

20GiB means exactly 20*2^30 bytes. Full CLI init and all prepare/run admission and periodic samples call the same resourceCheck. Admission is free>=20GiB AND owned bytes + max(0, Docker allocation - original Docker baseline)<24GiB. Legacy five-task tools retain their historical policy. The old 60GiB number appears only as predecessor provenance, never as an active full-run gate.

`full-migrate.mjs` is deliberately a single-snapshot adapter, not a general campaign migration facility. It pins #97's whole campaign file inventory (metadata, resources, every preparation record and existing empty lock) to SHA256 `9a593a277bf5b1781e36e7f085c2868477597c1f0a572de10c8f8e6f61212b20`. The digest is SHA256 of canonical sorted JSON mapping relative file paths to SHA256 of original bytes. Symlinks, unexpected files, non-preparation journal events and nonempty segments are refused. Modifying/rechaining the source, baseline or identity cannot pass the frozen inventory digest. All 96 preparation records, including earlier failures, are retained; the manifest still gives 89 rows.

The source's existing OS lock serializes import against preparation/run and concurrent import; the original files are never written. Exclusive destination mkdir claims a single fixed successor path. Duplicate import fails, including a destination left by a crash; do not delete it and retry automatically. A different target is rejected. A copied source cannot be selected by the production command. The successor archives original bytes under source-original, records predecessor identity/checkpoint and both floor values, retains resourceBaseline verbatim and imports preparations with original record hashes/timestamps. A completion marker fences partial import. CLI reads revalidate archived provenance, baseline, original identity and imported prefix before status, preparation or execution. The successor uses a fresh campaign UUID and the actual clean new runner SHA. Old activations cannot match the new binding. No key, authority, ledger, image pull or container operation is used by migration.

Historical ready means a digest was prepared, not an assertion that it remains cached forever. After migration, use the new runner's prepare to revalidate selected cached images/source before status and Master signing. prepare never pulls; the run path also rechecks digest before reservation. Do not rerun the old wrapper, which retains its former disk margin. New pulls for remaining tasks belong to a future #97 activation, retaining the original increment baseline.

### Prospective operator steps (not executed by #98)

1. Independent Regulator verifies the exact candidate; complete the contract's high-risk boundary review. Master fast-forwards the same SHA and prospectively updates #97, selects a new clean runner, and leaves old runner/source read-only.
2. Confirm the source inventory still matches the pinned digest. If it changed, stop and route the changed evidence; do not edit the pin ad hoc. Restore/verify frozen Product/Python/Harbor dependencies under separately authorized scope; #98's offline dependency copy is not a replacement production installation.
3. From the new clean runner: `node scripts/harbor/pilot/full-cli.mjs migrate97 --campaign /private/tmp/wo97-live/campaign-disk20`. The path is fixed and must not exist. Source remains `/private/tmp/wo97-live/campaign`.
4. `node scripts/harbor/pilot/full-cli.mjs prepare --campaign /private/tmp/wo97-live/campaign-disk20 --task <comma-separated-selected-IDs> --task-root /private/tmp/wo97-live/tasks`. Reuse existing images; no download is needed for the 59 currently verified cached digests. Keep the 2 incompatible tasks visible and unstarted.
5. `node scripts/harbor/pilot/full-cli.mjs status --campaign /private/tmp/wo97-live/campaign-disk20 --task <same-selected-IDs>` supplies the new proposedBinding. Route to Master for fresh authority/activation tied to the actual new runner, campaign and checkpoint. No source preparation or old permission authorizes this successor.
6. Only after #97 authorization/signature and dependency/resource/key-presence checks may its future Builder invoke run once. Preserve failures/unknown and follow existing stop/recovery semantics. #98 does not execute these steps.

Source/legacy implementation Evidence remains valid only for unchanged mechanisms; boundary and successor behavior require new independent review. No benchmark outcome or performance improvement follows from these offline controls.
