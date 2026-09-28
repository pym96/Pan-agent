# #97 Criteria1.5 — persistent preparation and proposed binding

Current Builder handoff is preparation only, pending Master signature and
independent review. The earlier Criteria1.4 blocked report is preserved below;
its outcome is not reclassified. [Summary and complete binding](terminal-bench-persistent-prep-97-summary.json).

Accepted runner `fce8cc2ad6cf6ab7755a7c7b4874cfe6cf777d71`, clean detached
worktree at `/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/runner`.
Existing `regulator-criteria14` was retained. The report branch preserves old SHA
`77a1e6d1cd371becc1f5770377d738033dc3fffe` and merges accepted#101 without
force-pushing; the README-only merge conflict retained both navigation entries.
The frozen execution runner is separate from this report branch.

## Deployment and recovery

A new venv was created with frozen Python3.12.9 at the persistent path. Installed
site-packages were restored from the retained frozen installed artifact, without
network upgrades; executable Python script shebangs were relocated. Old activation
scripts were not copied. verifyProduct passed executable hash, all82 product files,
all363 Harbor files, all33 exact dependency versions and actual persistent Harbor
import path. All89 task file inventories/git blob identities passed validateFiles.
The Python framework's real persistent root `/opt/homebrew/Cellar/python@3.12/3.12.9`
is explicitly included in ownedRoots in addition to the deployment root.

Exactly one accepted restore97 imported the read-only original external evidence
into a new campaign; its actual import event preserves provenance. All787 source
hashes match originals after restore. The original baseline Docker48503971840 is
unchanged; disk policy is free>=21474836480 and strict increment<57982058496.
Resource samples before each install/copy stage and campaign prepare passed, with
all retained state roots and real Python storage counted.

The restored report has89 rows,57 consumed/32 unstarted. First-segment21 valid
scores (16 successes) retain original evidence. Second-segment20 rows stay
missing_evidence/unknown with null score. These are recovered historical values,
not new evaluation outcomes. Current read-only stop observations for all20 missing
historical stops passed; they do not replace unknown historical stop evidence.

## Preparation and binding

Docker now reports8 CPUs and10420109312 bytes RAM, sufficient for the two official
8GiB tasks. Previous lower-capacity observations remain historical; the cause of
the earlier settings/engine discrepancy is not established. No VM changes or
restarts were made by Builder. Read-only image inspection found30/32 cached.

One prepare command checked all32 unstarted tasks:30 ready, only mteb-retrieve and
pytorch-model-recovery image_not_cached. No pulls occurred. One status selection
rechecked all30 ready tasks and produced the full new binding. Journal hashes were
identical before/after status, and campaign writes stopped thereafter.

Campaign `267ea540-6b8e-4736-b6ff-ecfe3ce9fba1`.
Checkpoint `377aa212db8829a6ad48803114f205d89c619cf1f73a0a44ced4bbed99ba407e`.
Complete binding: `persistent-criteria15/proposedBinding.json`, copied in summary.
It includes the clean runner SHA, new execution policy, selected30 IDs/images,
preparation digests and layout-bound campaign checkpoint. No activation/signature
or new run ledger exists. Master must inspect this exact binding before signing;
Builder has no run authorization in this contract.

## Durable evidence and checks

Raw evidence root:
`/Volumes/WD_BLACK/pan-agent/wo97-full-live-20260925/persistent-criteria15/`.
It contains stage stdout/stderr, layout/wrappers, environment/task identity results,
old-stop and image observations, restore/prepare/status outputs, source hashes,
frozen journal hashes, deployment inventory and complete deployment snapshot.
The snapshot preserves files and symlinks; external Python framework is identified
and counted, not silently copied into the venv. Raw inventory hash is in summary.
Old criteria14 evidence and regulator artifacts remain unchanged.

Initial host acceptance on external TMPDIR hit3 UTF-8 errors in Wiki fixture
checks. Raw failure log is retained; internal-TMPDIR follow-up is separate. This
was a verification environment choice by Agent, not a task/model failure. No
validator was changed to bypass it. Final check results are in summary and Handoff.
Host implementation tests use accepted main, identical to the frozen runner;
this candidate only adds the three authorized report/navigation files relative
to accepted main. Host SOURCE_OF_TRUTH remains Master-owned.

Zero real model/task/scoring/pull/cleanup/production-signature calls. No main push,
VPF/resume changes or self-acceptance. Next owner: Master for exact identity/binding
check and later activation; independent Regulator retains final review ownership.

---

# #97 Criteria1.4 persistent preparation — blocked before deployment

Working Agent report; no acceptance or benchmark claim. Base:
`848f59f90b503a9eab5c46ad76bb44c646570161`.
[Contract](https://github.com/pym96/Pan-agent/issues/97#issuecomment-5868102412).
[Machine summary](terminal-bench-persistent-prep-97-summary.json).

## Observed boundary

The accepted #100 final Verdict was read and its SHA256 verified as
`3f83b5d3707f8a527fa5c170fa15504ea4f2b47bb8e3bbfea283adef65340d27`.
The accepted runner checkout was clean at the exact base SHA. Its unmodified
`sampleDurable` and `resourceCheck` were used with the original Docker baseline.

At 2026-09-28T10:32:48.501Z, free=44,734,652,416 bytes,
owned=2,301,550,592 bytes, Docker allocated=88,021,364,736 bytes.
With baseline=48,503,971,840, cumulative increment=41,818,943,488 bytes.
The exclusive ceiling remains 41,875,931,136 bytes: only 56,987,648 bytes remain.
The sampler **passes now**; this is a deployment-size blocker, not an observed
resource-check failure. No over-limit copy was attempted.

Read-only `du -sk` on existing frozen sources reports venv 42,872 KiB,
tasks 47,224 KiB, consumer 592 KiB and runner 10,472 KiB: total 103,587,840
allocated bytes. This is an estimate for ordinary independent deployment copies,
not an exact prediction of a rebuilt venv. It already exceeds headroom by
46,600,192 bytes before the recovery originals, install scratch and report costs.
No hardlink/storage-sharing substitution was attempted. Old evidence and runtime
sources remain retained. Filesystem free space alone does not solve cumulative
budget admission; the original baseline was not reset.

Docker info reports 8 CPUs and 8,218,316,800 bytes memory, still below
8,589,934,592 required by the two official 8 GiB tasks. The reported Human
10 GiB setting cannot stand in for running capacity. This capacity blocker
applies to those two tasks, not every unstarted task. No Docker restart occurred.

## Actual stage and preserved evidence

Neither new deployment root nor external evidence directory existed at inspection.
Only the external preparation evidence directory and the three allowed repository
report files were created/updated. The existing clean #97 candidate was
fast-forwarded to the accepted base before report edits. Main was not modified.

Raw evidence directory:
`/Volumes/WD_BLACK/pan-agent/wo97-full-live-20260925/persistent-criteria14/`.
Its `inventory.json` SHA256:
`3fb13d2d21620a91f64ab438a3513c6003ba9055c39ab9e557c3ac4aad55c3a8`.
It covers original sampler JSON, raw size and Docker capacity output, stderr and
stage observations. No source credential was accessed.

`benchmark97-next/` was not created. No environment install/copy, restore97,
prepare, status, image scan, old-process stop reconciliation or binding occurred.
There is **no proposedBinding**, new campaign, layout or run activation to sign.
The accepted historical 89/57/32 counts and 20 unknown second-segment scores
remain inherited facts; this stage did not reimport or independently recount them.
Original ledgers, permits, archives and cached images were not changed. Zero model,
task, scoring, pull, cleanup or production-signing operations occurred.

## Handoff to Master

C-PREP97-01 deployment/recovery and C-PREP97-02 binding remain incomplete.
This report uses the contract's permitted blocked-stage handoff under C-PREP97-03;
it does not declare any criterion accepted. Independent review remains required.
Master must decide how to provide sufficient cumulative headroom under the
original policy (explicit disposition of retained storage, or a revised budget
if chosen). Builder has no cleanup authority and supplies no binding for signing.
After that decision, resample before deployment; Human separately applies VM
memory configuration if the two 8 GiB tasks are to qualify. Resume steps 1–6
from the accepted runbook, retaining historical consumption; no live run follows
without its later activation.

Learning record: the initial free-space reading appeared ample, but the accepted
sampler counts retained test/recovery storage and Docker growth together. That
changed the deployment decision before copying. The size estimate is not an
installation experiment; installation overhead remains unknown. Agent performed
this assessment; Human's reported memory setting has not yet appeared in the
observed runtime. No benchmark improvement is inferred.

## Verification

Candidate evidence inventory SHA256 and every listed artifact hash passed; summary
JSON arithmetic, local report links, absent deployment root and `git diff --check`
passed. Host knowledge-base/path, resume-package and generated-PDF validators
passed against the host's accepted base (not an implementation test of this
report-only candidate). Host SOURCE_OF_TRUTH is unchanged under the contract's
Master-only ownership. No implementation tests or live preparation were invoked.
