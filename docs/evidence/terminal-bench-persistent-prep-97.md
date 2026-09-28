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
