# #102 Criteria1.0 — external archive repair candidate

Builder evidence, pending independent Regulator. Base
`73c5bd19754ad4dc04124f01f1e01057f6fb7fb0`.
[Contract](https://github.com/pym96/Pan-agent/issues/102),
[design and production succession steps](../design/archive-repair-102.md),
[machine summary](archive-repair-102-summary.json).

## Actual problem and change

Segment3 completed mcmc-sampling-stan locally (six tests passed, validScore1,
stopConfirmed true), then exited1 while publishing receipt.json by hard link on
WD_BLACK. The ENOTSUP text mentioning socket does not establish a network failure.
The actual source outcome is not re-scored or independently accepted here.

External receipts now use fsynced unique staging directories and same-filesystem
rename to a nonempty committed directory. Verification checks declared files,
hashes, current local task originals, immutable metadata/activation, ledger prefix
and journal chain/checkpoint before archived. Existing commits are not overwritten;
missing/corrupt commits refuse. Partial stages remain. Internal journal publication
is unchanged. See design for the process-crash versus physical-power-loss boundary.

An explicit upgrade97 importer pins this stopped source inventory (843 files,
excluding only the top process lock and OS metadata). It retains old metadata,
signature, result and consumption in predecessor-original, creates a new campaign
identity, and blocks prepare/binding until recover archives the outstanding task
and confirms current stop. The successor records predecessor_reconciled; it does
not forge a close event in the old journal. Old pending external files are not
removed or used as success. This is a narrow, reviewed import, not a mutable
runnerSha override or arbitrary historical-results importer.

## C-ARC-01/02 — real filesystem controls

`test_archive_102.mjs`:11 passed in archive-checked.log. The external tests used
new directories under `/Volumes/WD_BLACK/pan-agent/archive-repair-20260929/` and
asserted a different device from the internal control. They exercise actual
archiveTask, file/fsync/rename APIs, repeat calls, conflicting local content,
corrupt/missing published files, two concurrent independent processes, and actual
process exits during copy, receipt write, before/after publication and before
journal append. Injected ENOSPC/write failure and unavailable mount keep local
originals and no successful archive event. An internal replacement mount is
rejected in live mode. No physical disconnect or other process was affected.

Recovery regressions:4 passed in recovery-checked.log (after-result/after-archive
interruptions, unavailable archive blocks the next task, write failure plus
supplement without replay). Full controller suite:28 passed in full-regression.log.
All task, model, broker and scoring effects in these controls are synthetic.

## C-ARC-03 — exact stopped production-source demonstration

`test_upgrade_102.mjs`:1 integration scenario passed in upgrade-checked.log.
Its isolated successor is constructed from the read-only real stopped source;
production controller/Docker/model capabilities are replaced by the existing
explicit fake-host driver. Raw CLI stdout/stderr and fixture files are retained.

Verified:58 reservations/31 unstarted,17 retained historical successes/22 valid
scores,20 second-segment null scores; no preparation or binding before predecessor
reconciliation; unknown current stop rejects. Supplement archive/reconcile causes
zero credential/broker/model effects. Every consumed task is rejected. The actual
old permit is rejected at consumed-task selection; an additionally signed synthetic
old-runner identity and reused run ID reject before credentials. One new synthetic
unstarted task then executes exactly once, while all58 original rows stay identical.
This synthetic outcome is not a new benchmark score.

Production campaign841 non-lock files and all12 global ledgers match before/after
hash inventories. The importer additionally pins nested historical lock bytes,
bringing its source count to843. Source files, existing runner and original
external task-archive were never opened for writing by this work. No production
upgrade/recover/archive/run or signature was performed.

## Verification history and limits

Initial external archive tests exposed auto-generated `._` metadata sidecars:
strict equality between all directory entries and receipt data rejected otherwise
valid copies. The preserved archive-first.log records that failure. The reader
now allows only such extra sidecars while requiring every declared data file/hash;
non-sidecar extras, omissions and corrupt data still reject. Subsequent tests also
verify the receipt's journal checkpoint rather than only individual file hashes.

First upgrade control failed recovery_incomplete because the new inventory helper
excluded nested historical .lock files required by the accepted recovery proof.
The helper now excludes only the top-level active lock and preserves/pins nested
locks. The second attempt rejected the old activation earlier than the test
expected (task_not_unstarted rather than activation_identity); the assertion was
corrected, and a separate forged old-identity negative was added. All initial logs
and partial fixtures remain; no production record was repaired in place.

Host acceptance passed:82 controls and259 Python tests with6 existing skips.
An issue-owned view uses the candidate for project Python tests; host path/PDF
validators resolve unchanged host files. Candidate diff/links/JSON and final
raw-artifact hashes are checked separately. Host SOT remains Master-owned.
The final resource sample includes retained deployment-owned real Python roots
as well as required Pan state roots. Earlier development sample only supplied the
mandatory roots; final explicit-root sample is the complete accounting reference.
54GiB strict increment/20GiB free/original baseline remain unchanged and pass.

Human chose the target/budget; Builder chose and implemented the transaction and
successor, corrected the above mistakes, and ran these controls. Independent
Regulator must reproduce on its own external directory. This does not claim
physical power-loss guarantees, an accepted result, model improvement or resume fact.

## Reproduction and handoff

Raw root: `/Volumes/WD_BLACK/pan-agent/archive-repair-20260929/`.
The summary binds inventory.json and offline-fixtures.tar.gz. Original failed
#97 evidence remains in its existing segment3-live and persistent-criteria15 paths.

```sh
WO102_ROOT=/persistent/new-small-tests WO102_EXTERNAL=/Volumes/WD_BLACK/new-isolated-tests \
  node --test scripts/harbor/pilot/test_archive_102.mjs
WO102_ROOT=/persistent/new-upgrade-fixture WO102_EXTERNAL=/Volumes/WD_BLACK/new-upgrade-tests \
  WO102_SOURCE=/path/to/read-only/pinned/campaign \
  node --test scripts/harbor/pilot/test_upgrade_102.mjs
```

Create the external parent for the upgrade scenario beforehand; never point test
output at production archives. Reuse the read-only source; do not copy large suites
of historical fixtures. The test itself creates one new successor copy per scenario.

After independent acceptance and exact-SHA integration, Master must authorize the
production steps in the design: clean new runner/layout, upgrade97 into a new
persistent successor, recover its archive/stop obligation, then prepare/status and
new signature. No operation in this Handoff resumes#97 or repeats its58 consumed
tasks. No model/task/scoring/pull/container/cleanup/production-signature side effects
occurred during#102.
