# #104 Criteria1.0 — immutable campaign successor candidate

Working Agent delivery based on `13a85393bda66cb3e3ae51ea8f400d3986dd75be`.
Candidate claims await independent Regulator. No production migration, model/task/
scoring call, container start, pull, signing or cleanup was performed. #97 remains
paused. [Design](../design/campaign-successor-104.md) and
[deployment runbook](../design/campaign-successor-104-runbook.md) describe the new
`successor97` command and the later Master handoff point. The exact final SHA and
post-commit binding/test results are supplied in the external Handoff, avoiding a
self-referential commit identity.

## Inputs and fixed boundaries

- #103 accepted Verdict SHA256:
  `85e7385fce763c590e02f7dfbaa38bd65ab73d34b9fa9eb48ca0f18b5fa81c13`.
- Accepted product package SHA256:
  `5ecd3b9b4da688f90dfee3cc651b4a2f755595587b6d7d7287383cab23c8e580`.
  Installed offline in the #104 consumer; all82 pinned files and frozen runtime
  dependencies verified. No TS or package-identity changes.
- Source: deploy-criteria17/campaign, campaign10d69769-d733-480a-bb37-5e08457cb512.
 963-file inventory fingerprint:
 `b3b9248ae10a3f8da677b044c6c4d02ce46bcf72c93fbea2c9934f58c0850c30`.
  `source-before.json` and `source-after.json` retain the full file map.
- Real Store recomputation:62 consumed,27 not started,18 valid1/5 valid0/39 unscored;
 20 historical missing-score rows remain unknown. These are retained source
 classifications, not new results or newly accepted benchmark claims.

## Mechanism and criterion evidence

C-SUC-01: migrate from the actual source's independent copy, using real CLI/Store.
Original nested source bytes are retained, current accounting copies are hash
checked, and all15 historical run IDs are excluded from reuse. History projection
compares every consumed task's state, reward, score, reason, run, accounting,
elapsed time and evidence; knownObservedTotals is compared separately. Additional
lookup metadata (`consumed`, `missingEvidence`, `stopConfirmed`) is derived from
original records, not a result rewrite. Prior preparations remain in raw history,
but only fresh successor preparations can authorize binding. A completion marker
binds new metadata and source fingerprint. Existing destinations never get replaced.

C-SUC-02: the new identity changes only runnerSha and panHash; candidate runner SHA
comes from actual Git HEAD at invocation, not a hardcoded future SHA. Real #103
installed package and frozen dependencies are checked before migration and on
reopen. Offline host responses represent fresh task/image checks using the fixed
source image identities, not inherited ready flags.25 eligible tasks bind; missing
mteb-retrieve and pytorch-model-recovery stay unstarted. Every consumed task is
individually rejected by binding. Old runner/product permits and old run IDs fail
before credentials, models or tools. There is no static runAttempt report used as
migration proof. The separate existing core suite uses actual installed product.

C-SUC-03: recover observes stop state for all62 imports and archives a full immutable
predecessor snapshot in a new namespace before reconciliation. Actual external
volume writes and existing receipt publication/flush are exercised. Interrupted
migration cannot reopen/bind; a new target is safe. Archive interruption retains
partials, a retry uses a new snapshot, and archive corruption blocks reopen.
Wrong source/package, unconfirmed stop, changed image, resource breach and wrong
archive filesystem remain blocking. #103 core/session and all scoring/global stop
semantics remain in place.

Historical compatibility: fixed old recovery ledgers cannot be checked against a
moving current product hash. The parser now names the already-pinned historical
package; #102's source/hash and runner-only migration remain unchanged. Its CLI
reopen retains old panHash, and run explicitly verifies campaign/product hash match
before credentials. The legacy test uses a declared synthetic old-package verifier;
#104 tests verify the actual new package.23 recovery/resource tests and12 #102
migration/archive tests passed, including actual external-volume controls.

132 affected runner/core tests passed against the newly installed #103 package.
Host whole-package/path checks passed82 host tests and259 Python tests (6 existing
skips). Host structural checks inspect host main; Python tests use the candidate
through the dedicated host-view. This is not independent acceptance. Source tests
for unchanged unrelated product components were not needlessly repeated.

The six dedicated successor scenarios are in `test_successor_104.mjs`; final
post-commit results and SHA-bound full proposedBinding are external Handoff
artifacts. Deployment is not inferred from offline fake-host readiness.

## Preserved failures and learning case

Initial `successor-probe1.log` had4/6 pass. First, status reached a task-readiness
error before the explicit successor reconciliation check; the missing early check
was added. Second, the test counted macOS `._` metadata alongside two actual
snapshot UUID directories; the assertion now selects UUID directory names, leaving
metadata and partials intact. An initial legacy test failed because its new
external fixture parent directory was absent; creating that issue-owned parent
resolved it. All initial logs remain, without overwriting failed snapshots.

The next successor run exposed a fixture alias: signing a deliberately wrong
runner binding mutated the shared binding object, so the later old-run test failed
at identity before reaching reuse denial. The synthetic permit helper now clones
its binding before mutation; the production predicate was not weakened. Final
post-commit checks use the corrected fixture and bind actual committed HEAD.

The design choice is to preserve old truth under its old identity and attach a new
identity prospectively, instead of editing a historical pin to make new code open
it. The source fingerprint and projection tests make that distinction observable.
Human set the continuation goal; Builder implemented/validated this adapter;
Regulator independently judges it; Master owns production preparation/signature.
No personal-implementation or live-success improvement claim is made.

## Evidence and resource protection

Internal: `/Users/panyiming/.local/state/pan-agent/campaign-successor-work/`.
External: `/Volumes/WD_BLACK/pan-agent/campaign-successor-20260929/`.
Commands, source inventories, comparison JSON, raw CLI stdout/stderr, failed and
successful fixtures, package verification and protection reports are retained.
The Handoff binds final inventories/archive hashes and full candidate SHA.

Source963-file map and production979 protected hashes remain unchanged;15 global
ledger file hashes and set are unchanged. All production paths were read-only.
The original Docker baseline48503971840, strict total increment<57982058496 and
free>=21474836480 remain. Sampling includes old/new Pan roots, real Python and
shared build dependencies. No new baseline or cleanup is used to fit the budget.

After acceptance, Master must explicitly assign persistent deployment/preparation,
then review the full binding and sign a new activation. This WorkOrder does not
perform those steps and does not authorize #97 run.


## C-SUC-03 repair — current archive device on reopen

The initial candidate `3f1a6761db95d66a373c778e927e3b3301c19840` was independently
rejected. C-SUC-01/02 passed; C-SUC-03 failed when an already-reconciled archive path
was changed to a byte-identical internal copy. Original first-recover device tests
and hash checks did not cover this state transition. The original Handoff and
Regulator evidence remain unchanged; the previous test results do not establish
acceptance of that candidate.

Repair evidence is appended under external `repair-boundary/` and internal
`campaign-successor-work/repair-boundary/`. `red.log` records the new regression
failing on the original implementation: status returned zero after the alias
change. `original-red-replayed-green.json` records the same retained fixture
rejecting status/recover after repair. The new test covers actual migration,
external archival, prepare/binding, archive-root and nested-predecessor aliases,
all four status/recover/prepare/run admissions, a previously attached Store, and
restoration of the legal external path with an unchanged binding. All old external
copies and failing fixture artifacts are retained; no production path is modified.

The repair unifies current storage and receipt verification; a completed journal
event is not an exemption. The submitted Handoff supplies the new full SHA,
post-commit binding, red/green and affected regression logs, source/ledger hashes,
resource samples and the repair-only archive/inventory hashes. The fixed #103
package remains unchanged. No model, real task, scoring, container, pull, production
migration or signing was performed, and #97 remains paused.

Learning correction: Builder's original reasoning equated historical successful
archival with current valid storage. Regulator's byte-preserving path substitution
separated these facts. The regression now changes location without changing
content, and also tests the same substitution below the archive root. Human owns
the goal, Builder the repair, Regulator independent acceptance, Master integration
and subsequent deployment. This is protocol/storage evidence, not a benchmark gain.

Repair working-tree validation: seven successor scenarios passed (0 skipped),
167 affected/legacy regressions passed (0 skipped), and the host acceptance gate
passed (82 host checks, 259 Python tests with 6 existing skips). Final committed-SHA
binding validation and integrity samples are recorded in the appended Handoff.
