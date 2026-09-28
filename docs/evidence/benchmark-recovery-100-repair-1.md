# #100 Criteria1.0 — first Verdict repair

Append-only repair of `75e59ec0bede8b33157c9b0ecc236c80e80ede21` on
`workorder/100-candidate`. Original base remains
`ab21c0f43af713b7fd33862d3c6ed8c88efca80b`. New full SHA belongs to Handoff2.
Old candidate report, summary, failed evidence and Regulator files remain unchanged.
This report is Builder evidence, not an accepted Verdict.

Input Verdict: external `benchmark-recovery-20260928/regulator-20260928/Verdict.md`,
rejected/criterion_failed, C-REC-03 R100-01 and R100-02. C-REC-01 technical,
C-REC-02 and C-REC-04 passed independently; Human gate remains pending.

## Changes and controls

R100-01: previously layout containment used lexical paths while sampling skipped
symlinks. The accepted active target could therefore live outside measured storage.
Both containment and declared/mandatory root sampling now resolve actual paths.
Missing path suffixes resolve through existing ancestors; dangling/temporary aliases
reject. An outside active target must have explicit real-root coverage. Root aliases
are measured through their physical target, with existing inode deduplication.
No disk threshold or original baseline changes.

Five targeted tests cover outside alias rejection, explicit target admission and
allocation, legal internal/root aliases, duplicate inode/overlapping roots,
not-yet-created suffixes, dangling/temporary aliases, retained-root aliases, and
near39GiB controls. The intentionally incomplete synthetic measurement demonstrates
the old admitted boundary; the complete admitted layout's measurement blocks it.
No production layout, ledger or resource baseline was modified.

R100-02: `memory` must be a primitive string before regex parsing. Controls reject
arrays, nested arrays, boxed strings, arbitrary objects (without invoking their
coercion hook), numbers, null/undefined, booleans and symbols. Valid official8G/8192M
and smaller values retain their semantics; malformed/nonpositive/over-limit strings
and the legacy2CPU/4GiB boundary remain rejected where applicable.

## Verification and retained evidence

Repair raw evidence: `/Volumes/WD_BLACK/pan-agent/benchmark-recovery-20260928/repair-1/`.
Small fixtures: `/Users/panyiming/.local/state/pan-agent/benchmark-recovery-work/repair-1/`.
The repair inventory binds logs, fixture archive, source-integrity checks and the
original Verdict hash. Full candidate SHA and exact changed paths are in Handoff2.

- New targeted controls:5 pass/0 fail.
- Directly affected existing4CPU/8GiB controller and temporary-layout controls:
  2 pass/0 fail, selected by test name, not a claim to rerun all18 recovery tests.
- Policy/broker controls:7 pass/0 fail under issue-owned TMPDIR.
- Host full acceptance rerun recorded in `host-final.log`.
- The unchanged broad restoration/interrupt/archive logic carries forward its
  previous46 affected tests and independent positive Verdict; no new production
  recovery or full fixture duplication was necessary for these two local repairs.

The initial policy/broker check inherited the system TMPDIR. It was repeated with
explicit issue-owned TMPDIR; the first log is retained and no old artifacts were
cleaned. Subsequent commands explicitly place synthetic outputs under the repair
root. No model, official task/score, Docker container, pull, cleanup or credential
operation occurred. The only live resource observation is a read-only disk sample.

The source of the mistake was inconsistent path representations between admission
and accounting, plus relying on JavaScript regex coercion for field validation.
Independent Regulator counterexamples exposed both. Builder implemented the repair
and controls; Human/Master supplied the contract and authority. No claim is made
that production had exceeded disk limits or that frozen official tasks contained
invalid memory arrays. Frozen requirements, package, old57 consumption and unknown
scores remain unchanged. H-REC-BOUNDARY waits for independent technical re-review.

Repair inventory SHA256:
`27616c537079ae473ca620a227995b12e34891ab12a6b702ffbcbe35d9247ae9`.
Input Verdict SHA256:
`572412a96e837585d431aeeef7edbc17ddc6fce66283c22855f03af7ad918052`.
Final sample retained44,080,758,784 free bytes and41,753,714,688 cumulative bytes,
strictly below41,875,931,136. The remaining headroom is small; no cleanup or baseline
reset was used.787 original source files and11 old global ledgers still match.
