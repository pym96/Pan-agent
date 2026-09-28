# #100 Criteria1.0 Builder candidate — recovery without replay

Base `ab21c0f43af713b7fd33862d3c6ed8c88efca80b`; branch
`workorder/100-candidate`. Full candidate SHA is bound by the GitHub Handoff.
This is an offline implementation/evidence handoff, not acceptance, #97 activation
or a new benchmark score. Master owns host SOURCE_OF_TRUTH and integration.

## Delivered behavior and evidence

[Design, offline reproduction and deferred live runbook](../design/benchmark-recovery-100.md)
cover the new pinned-evidence restore entry, persistent runtime layout, task archive
receipts and signed resource policy. [Machine summary](benchmark-recovery-100-summary.json)
contains source identities, test counts and actual host limitations.

- C-REC-01: the unchanged original ledger events and archived journal yield
  57 consumed/32 unstarted among89. First37 restore16 success/5 valid failure/16
  unscored from retained originals. Second20 retain null score and missing-evidence
  reason; no historical6/2/12 observation is promoted. Known second-segment usage
  remains1,344,318 input/54,793 output, with missing usage explicitly retained.
  Duplicate ledger copies do not duplicate totals. All57 are blocked at selection.
- C-REC-02: process tests interrupt before/after reservation, before/after result,
  and before/after archive. Independent child processes resume only unstarted
  tasks. External disconnection and a write-path failure preserve local originals,
  block the next task and permit supplemental archive without repeated execution.
  Broker ticket now exists durably before reservation; task files flush before
  result commit. Source/raw archive objects are not overwritten.
- C-REC-03: recovered identity binds4CPU/8192MiB, serial and unchanged20/39GiB.
  Old signatures/run IDs cannot expand authority. Official resources reach the
  broker unchanged. Missing images and unknown old stops block binding. Production
  preparation additionally checks actual Docker capacity, separate from policy.
- C-REC-04: the offline demo imports real read-only evidence copies into an
  **offline-control** identity, uses fake I/O and synthetic authority, interrupts
  after the first synthetic result, archives and starts only the second task.
  Its new results are synthetic, never #97 production results. No production
  migration/signature, model/score/task invocation, image pull or container start
  occurred. Read-only Docker info/image inspect and frozen dependency checks ran.

## Reproduction and raw bundle

Persistent operations:
`/Users/panyiming/.local/state/pan-agent/benchmark-recovery-work/`.
External raw evidence:
`/Volumes/WD_BLACK/pan-agent/benchmark-recovery-20260928/`.

`inventory.json` SHA256:
`3bb1c6db49c15afee051cdf7213ffaaecabc3e24f1b0b30e14ce863e5424670b`.
`offline-evidence.tar.gz` SHA256:
`83b7c852f6c473b2df5f9a233b6d9f578f9087b0991bd617b1b33bc9b677c829`.

The archive contains source copies, all test fixtures/logs (including failures),
synthetic ledgers/archives and demo receipts. It excludes the candidate checkout,
host overlay and disposable Python cache; Git supplies the candidate source.
`restored-89-rows.json` is the initial import report before any synthetic execution.
`integrity-final.json` verifies787 original source files,11 global ledgers and
frozen manifests/package/dependency lock against their retained hashes.

The exact full-suite command and test environment are in
`full-regression-command.json`. Reproduction uses new output paths, not existing
fixtures. Sources remain read-only; the old migration tests accept source-copy
locations through `WO98_SOURCE`/`WO99_SOURCE` without weakening content pins.

## Validation results and failures retained

- Final affected suite:46 pass/0 fail (18 recovery controls plus28 full controls).
- Old #98/#99 migration controls:21 pass/0 fail after fixing the copied fixture's
  empty-directory structure. First failed regression log/fixtures remain.
- Broad pilot run:221 tests,213 pass/7 fail/1 pre-existing historical skip. All7
  failures were old CLI tests reaching their unchanged60GiB real-host floor.
  Re-running the unchanged23 CLI tests with an isolated100GiB synthetic filesystem
  sample:23 pass/0 fail. `legacy-free-fixture.mjs` only affects that test process;
  no production policy, baseline or real sample was changed. Counts overlap.
- Python pilot:19 pass. Host acceptance:82 host controls and259 project tests
  (6 inherited skips), final `PASS acceptance gate`. No new required skip.
- Frozen runtime check:82 installed package files,363 Harbor files, Python binary
  hash, actual Harbor import and all locked dependency versions match. This checks
  the retained runtime read-only; persistent production deployment is deferred.
- A probe of the installed Homebrew node@22 executable failed due to a missing
  `libsimdjson.26.dylib`. No installation or global runtime change was made; these
  offline checks used available Node26.7.0. Future live environment must be checked
  against its own activated runner/runtime requirements.

## Actual limits and handoff boundary

Docker reports8 CPUs and8,218,316,800 bytes memory, below8GiB
(8,589,934,592). Read-only calls to the real preparation function reject both
4CPU/8GiB tasks with `docker_capacity_insufficient_or_unknown`; the cached
1CPU/2GiB polyglot-c-py is ready with its unchanged digest. No VM adjustment.
Two prior images remain uncached; no downloads in this workorder.

The final retained sample is44,943,507,456 bytes free and41,153,007,616 bytes
cumulative increment, below41,875,931,136. Original Docker baseline remains
48,503,971,840. The new sampler includes restored old paths and current Pan state;
additional work must continue sampling rather than assuming this headroom persists.

Independent Regulator evaluates C-REC-01…04. After C-REC-01 technical pass, route
one H-REC-BOUNDARY review of restored consumption/unknown semantics. Builder does
not accept, modify main or start #97. Subsequent Master contract/activation must
bind the accepted runner, persistent runtime, current capacity and a new run.

## Learning record — ownership and corrections

Human authorized4CPU/8GiB and the offline boundary; Master specified the recovery
contract; Builder implemented and tested it. Upstream supplies frozen task/resource
configuration and Harbor. No Agent implementation is attributed to Human.

The initial assumption that copying indexed files reproduced the old fixtures was
wrong: byte inventories omit empty directories, while the old loader scans them.
The failed #98/#99 controls exposed this. Adding the verified empty directory
structure in the **copy** restored those tests without changing source bytes or
relaxing their hash checks. Separately, broad old CLI tests exposed their real-host
60GiB floor; an explicit test-only capacity fixture separated this environmental
limit from candidate behavior. Original failures are retained. The earlier loss of
second-segment artifacts remains unresolved; this repair preserves unknown rather
than claiming to recover missing scores or a proven cause of the directory loss.
