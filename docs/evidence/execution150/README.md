# Execution150 candidate evidence

WorkOrder: https://github.com/pym96/Pan-agent/issues/150 . Accepted parent: ebd093e9d6d18913a334030c3f66e6b11e70bd33. Working Agent implementation; independent review and supplemental high-risk gate remain outstanding.

At this preparation checkpoint, Stage A contains TypeScript policy tests and installed-package pytest results. Stage B actual Docker is not yet authorized/executed. No passing full-delivery claim or PR is made here. The final SHA-bound Handoff will replace this paragraph with exact source, package and external evidence identities after required tests.

Representative failures retained during implementation:

1. Parent/worker initially opened the same RunArchiveStore root. `open` treats unsealed runs as interrupted and sealed the parent's still-live execution archive. The first real CLI smoke failed with ArchiveSealedError. Separate exclusive controller archive and per-execution task archive namespaces fixed the ownership conflict; installed regression checks both archive families remain correctly sealed.
2. The first 1s/4s real smoke started two ticks roughly0.25ms before due time because OS timer delay rounding does not enforce an exact monotonic threshold. Controller now rounds sleep upward and rechecks time in a loop; virtual early-wake regression and the unchanged no-early-start assertion cover it. The lateness threshold was not relaxed.
3. Existing trusted-local shell starts a detached process group. Killing only the Node worker is insufficient; a negative fixture demonstrates continued heartbeat. Scheduled shell launch now uses supervisor-owned process creation and an input gate released only after durable registration acknowledgement. The actual TERM-ignoring integration probe verifies stopped heartbeat while an unrelated sentinel stays alive. This is not a claim against deliberate host-user process escape; that needs Docker.
4. The first old full suite in the Unicode checkout returned219/234 passing;15 tests attempted a percent-encoded Runbook filesystem path. These remain recorded failures, not skips; final complete regression must run in a clean ASCII checkout and establish whether any product regression remains.
5. A tampering test originally attempted to write a0400 snapshot file then explicitly returned0. The write was denied, so no candidate mutation occurred; this was an invalid negative oracle. The probe now deliberately chmods its same-user snapshot before modification and detects the changed digest. Operator-authored verifier correctness is trusted, while same-user hostile isolation is not claimed.

Human set architecture, constraints and criteria. Coding Agent implemented and investigated; independent Regulator has not yet accepted this candidate. No project fact, resume statement or public benchmark is promoted.
