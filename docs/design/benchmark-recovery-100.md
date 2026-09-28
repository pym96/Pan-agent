# #100 Criteria1.0 — durable evidence recovery and resource admission

Candidate design; independent review and H-REC-BOUNDARY remain required. This does
not activate #97 or promote benchmark scores.

## Evidence import

`full-cli.mjs restore97 --source SOURCE --layout LAYOUT --campaign NEW_ROOT`
imports the fixed #97 evidence set. The source is a read-only directory containing:

- `criteria12-pre-signing-20260928/inventory.json` and
  `campaign-disk39/history-original/` beneath that directory;
- `recovery-20260928/reservation-evidence-index.json`, `ledger-inventory.json`,
  and all eleven `ledgers/*.jsonl`;
- `segment2-retained-ledger-20260928.jsonl`.

The four inventory/index/second-ledger anchors are pinned in `full-recovery.mjs`.
All eleven ledgers must match their pinned inventory. The two #97 run headers,
reservation events, manifest, images and first-segment journal are cross-checked.
The index is a cross-check, not the reservation oracle. A truncated/conflicting
ledger or missing essential journal rejects the entire import; no partial import
can unlock a task. Identical second-ledger copies are verified and counted once.
Other historical runs are retained as provenance but not added to #97 usage.

A new UUID, current import timestamp, new runner identity and journal are created.
The import event references preserved original bytes; it does not reconstruct old
journal entries, timestamps or checkpoint. First-segment scores are retained only
when that task's inventoried artifacts remain available and unchanged. Missing
task artifacts yield unknown while retaining the reservation. Corrupt available
artifacts reject import. All second-segment tasks have `validScore:null`, unknown
stop and `missing_evidence/unknown`; historical chat observations are not scores.
The two consumed run IDs and all 57 tasks remain blocked across repeated imports.
Usage is computed from each unique original run ledger, not cached report totals.

## Persistence and interruption

Schema2 recovered campaigns require a layout with version1, absolute `runner`,
`entry`, `python`, `harborRoot`, `taskRoot`, `archiveRoot`, and `ownedRoots`.
Active paths resolve outside temporary directories. All runtime paths must be
covered by owned roots. Live runner location must equal the actual checkout;
entry/Python/Harbor bytes are still checked against unchanged package-identity.
The relocated interpreter must import Harbor from the specified persistent root.

Reservation and broker ticket are fsynced before environment/model effects.
Task raw files are flushed before result publication. Every task then receives an
external immutable snapshot: raw task files, ledger snapshot, activation, campaign
metadata and journal prefix, with content hashes and a durable receipt. Local
originals remain. Incomplete copy attempts stay under separate snapshot IDs.
External absence, insufficient permissions or write failure stops the controller
before the next reservation. `recover` reconciles only newly owned jobs, supplements
archives, then closes the interrupted segment. It never repeats task execution or
infers a missing score. `archive` supplements outstanding archives after segment
reconciliation. Reused destination paths fail closed; no reset command exists.

Old second-segment stop is never assumed during import. Before preparation,
binding or run, a read-only observer checks old project/image identity, current
container state and relevant process liveness. An unidentifiable live broker is
conservatively blocking. Failed observation prevents continuation. This is a new
observation, not a replacement for missing historical stop evidence. The run path
rechecks preparation; status with task selection checks current source/image and
capacity without changing the signed checkpoint. Concurrent start fencing remains
in the existing OS lock and broker ticket mechanisms.

## Resource identity

Recovered campaigns bind `executionPolicy` (4 CPU, 8192 MiB, serial, disk20/39)
in the signed identity. Legacy campaigns retain 2 CPU/4096 MiB admission; old
signatures cannot grant the new policy. Official task resource values are passed
unchanged through the broker; there is no blanket increase for smaller tasks.
Invalid, nonpositive, nonfinite or over-limit requirements fail. Actual Docker
capacity must also be sufficient; unknown capacity is not assumed sufficient.

Disk checks retain `free >= 20 GiB` and
`owned + max(0, dockerAllocated - 48503971840) < 39 GiB`. Recovery imports preserve
the exact original baseline. The sampler includes declared roots, all Pan state
under the user's non-temporary state directory, and still-present restored #97,
#74 and #94 temporary locations. Inodes are deduplicated, so hardlinks are not
counted twice. A missing Docker backing file or invalid sample blocks activity.
Offline injected samples are isolated controls and never written to production.

## Offline reproduction now

Use an existing read-only source copy, and new output directories on the internal
persistent volume. No production campaign, key or model credential is needed.

```sh
node scripts/harbor/pilot/full-recovery-demo.mjs "$SOURCE" "$NEW_DEMO"
WO100_SOURCE="$SOURCE" WO100_TEST_ROOT="$NEW_TEST_ROOT" \
  node --test scripts/harbor/pilot/test_recovery_100.mjs
```

The demo runs the same CLI with injected fake environment/model capabilities and
synthetic signing authority. It imports 57 reservations, prepares two synthetic
4CPU/8GiB tasks, exits after the first result, reconciles/archives, and executes only
the second. Saved stdout/stderr, 89-row reports, effects and archive hashes make
both the interruption and no-replay result reviewable. Its two new successes are
synthetic and must never be counted as benchmark results.

For old migration regressions use `WO98_SOURCE` pointing at the preserved
`history-original/source-original` and `WO99_SOURCE` at `history-original`.
Keep empty `segments`/`docker-client` directories in copies: original byte hashes
do not inventory empty directories, but the old loader expects their structure.
Do not recreate production paths merely to satisfy historical tests.

## Future live resumption — after acceptance and Master activation only

1. Master integrates the exact accepted SHA, updates #97 and specifies a new
   non-temporary root, e.g. `~/.local/state/pan-agent/benchmark97-next/`.
   Create the accepted runner checkout there. Retain all old evidence/caches.
2. Restore the same #94 installed package to `ROOT/consumer/`; recreate the frozen
   Python3.12.9 environment at `ROOT/venv/` using the retained Harbor archive and
   exact `scripts/harbor/requirements.lock`. A copied venv's old absolute shebangs
   are insufficient. Check the frozen Python executable hash, all package and
   Harbor files, all33 dependency versions, and actual Harbor import location.
   Missing offline installation artifacts/capacity are preparation blockers,
   not permission to upgrade dependencies or silently use temporary paths.
3. Place the frozen89 task source under `ROOT/tasks/`. Construct layout JSON with
   the actual runner, installed entry, venv Python and Harbor paths. Use a new
   WD_BLACK archive directory; list the whole ROOT in `ownedRoots`. Ensure the
   external directory exists on the mounted external device.
4. Invoke `restore97` with the preserved source and new layout/root. Inspect all89
   rows:57 consumed,32 unstarted;21 valid-scored historical rows when all originals
   are present,20 second-segment missing-evidence rows. Preserve its import event.
5. Only prepare a chosen unstarted subset; `prepare` performs no pulls:
   `node scripts/harbor/pilot/full-cli.mjs prepare --campaign CAMPAIGN --task IDS --task-root ROOT/tasks`.
   Resolve actual Docker memory capacity before selecting the two8GiB tasks.
   `mteb-retrieve` and `pytorch-model-recovery` still lack cached images at handoff.
6. `status --campaign CAMPAIGN --task IDS` produces the new complete binding after
   read-only stop/current-image checks. Stop changing preparation after Master
   signs it. Use a new run ID and the existing authoritative ledger location.
7. Only the subsequent live activation authorizes `run --campaign CAMPAIGN
   --activation NEW_ACTIVATION --entry PERSISTENT_ENTRY --task-root ROOT/tasks`.
   On a crash/archive error, keep all originals; use `recover`/`archive`, inspect
   status, then request a new binding for remaining unstarted tasks. Never retry
   the old run, delete ledgers or regenerate metadata to bypass a block.

This workorder did not execute any of these live migration/activation steps.

## Repair after first independent Verdict (Criteria1.0 unchanged)

The first candidate allowed a lexical path to cover a symlink target outside the
measured roots. Layout checks now compare resolved storage paths, including
not-yet-created suffixes under resolved existing ancestors. Uncovered real targets,
dangling links and temporary targets reject. An external persistent interpreter
or entry alias requires its actual target in `ownedRoots`; the declared root itself
may be an alias, because sampling resolves declared and mandatory retained roots
before walking. Physical files reached by multiple roots/hardlinks count once.
This does not follow arbitrary incidental links during recursive traversal: every
accepted active target must resolve within a declared physical root.

Memory admission also requires a primitive string before parsing. Arrays, nested
arrays and boxed/coercible objects cannot acquire authority through string coercion.
See the [repair evidence](../evidence/benchmark-recovery-100-repair-1.md) for both
Verdict counterexamples and targeted controls. Official task bytes and disk formula
remain unchanged.
