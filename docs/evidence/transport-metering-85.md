# WO85 offline diagnosis, recovery and metering evidence

Criteria1.0 Builder candidate; **not independently accepted**. Contract:
[#85](https://github.com/pym96/Pan-agent/issues/85#issuecomment-5795049179).
Accepted base `915a62e6a88d895b58fd08343cd9992f5a11560a`;
branch `workorder/85-candidate`. Final Handoff identifies the full candidate SHA.
[Design](../design/transport-metering-85.md) and
[machine summary](transport-metering-85-summary.json).
Historical `current-assignment.md` #47 does not authorize or replace this work.

## Historical diagnosis: what the evidence establishes

#84 accepted Verdict SHA256
`2365eed47121aaf03306fb14b1a45281b2d5a3ed978ed14ac1d95f3b18cd974b`
was read and rehashed from the original external archive. Original reports,
Session event files and run ledger were read only; per-file hashes and recomputed
counts are retained in `history-audit.json` in this issue's external evidence.

| Task | Reserved dispatches | Tools | Reported / unknown exchanges | Supported interpretation |
|---|---:|---:|---:|---|
| overfull-hbox | 4 | 4 | 3 / 1 | Failed exchange follows reservation; no retained send-entry/status evidence. Exact cause and usage unknown. |
| dna-insert | 7 | 7 | 6 / 1 | Same evidentiary limit; not proof of timeout, quota, authentication or network failure. |
| break-filter-js-from-html | 27 | 27 | 27 / 1 | Last model round has no new dispatch reservation. Pre-reservation failure is consistent with the path; exact local check is unproven. |

Nginx and merge retain their prior official successes; all three failures retain
null scores. No #84 task or verifier was rerun. Requests/private continuation were
not fully retained, so a historical oversized-body claim cannot be established.
Total 67 reservations, 68 tools and 68 model rounds remain distinct. The final
break round must not become a claimed 68th actual request or known-zero usage.

## Reproduced mechanisms and repair

The initial offline red test made **zero sends** with `requestBytes=1`, yet the
old boundary reported `transport`. New diagnosis reports `request_size`, local
stage, no reservation and no send entry. This proves the mechanism, not #84 cause.
The candidate separately retains safe local/send/HTTP/stream/parse/cancellation
and unknown diagnostics, with null unknown usage. An opt-in Kimi classifier
recognizes machine error codes; it never copies arbitrary error bodies.

Signed metered mode crosses authorization, durable ledger and the real installed
GeneralAgentSession. A deterministic signed run completed **202 exchanges and
send entries, 201 tools**, with ledger counts matching each, beyond old 40/64/80/200
thresholds. No expiry timer is installed for run-bound mode. Old bounded/expired/
tampered/unknown-mode negatives remain. Runtime defaults remain bounded.

Recovery tests retain failed attempts and unknown usage, then succeed after
send errors, dispatch/read timeout, partial streams, missing terminator, rate
limits and service errors. Incomplete tool streams execute no tool; a completed
tool before a failed next response executes once. Virtual-clock tests show
250/500/1000/2000ms waits and one unchanged Agent timer; deadline permits the
existing controlled verifier handoff, cancellation forbids grading/new sends.
Authentication and confirmed quota errors stop before the next campaign task.
Local request/response limits, malformed protocol and unknown failures do not
blindly retry. Scheduled waits are not claimed as actual sends.

## Verification and retained failures

Evidence root: `/Volumes/WD_BLACK/pan-agent/wo85-transport-metering-20260923/`.
Working originals: `/private/tmp/wo85-work/`. Raw logs, fixtures, packages and
installed consumers remain external; only this sanitized report/summary enters Git.
The floor runtime is Node **22.19.0**. The package lock hashes all 80 installed
files and retains the exact original Harbor/Python identities.

- TypeScript typecheck and 36 affected source/conformance tests passed.
- Python offline broker/handoff/diagnostic regressions: 19 passed; no Docker calls.
- Final installed-pilot matrix and guarded clean-consumer receipts are recorded
  in the machine summary and final Handoff.
- #83 normal/Agent-time/bounded-count endings, independent verifier timer,
  quiescence, global cancellation, late callbacks and stop-failure regressions retained.

Failed development evidence remains: initial oversized-request red test; one
negative test attempted to mutate a frozen fixture rather than a cloned payload;
credential-echo stop reason regressed to `protocol` and was corrected; CLI test
still pointed at the historical package and was rejected by the new identity
lock, then changed to require the explicit newly installed entry. Earlier CLI
passes against the old lock/package are not new-implementation proof. Wrong-cwd
pack/build commands and a transient GitHub read EOF are also retained. No failed
live attempt occurred. No source regression is dismissed by replacing its oracle.

## Boundaries, responsibility and review

This stage made zero real Provider/model, quota/balance, official task/verifier or
container calls; no new spend, credential search, old ledger reset, main change,
VPF/Wiki/resume fact promotion or claim of improved benchmark success. Mock
`official_scored` labels in old CLI unit fixtures are synthetic assertions only.
Original host root-directory BLOCK remains outside this implementation's scope.

Human set results-first authority and preserved official deadlines; Master froze
contract/base and review route; Builder implemented the scoped repair and offline
injections; scripted fake Provider responses supplied deterministic outcomes;
upstream Session/protocol/Harbor semantics supplied existing behavior. A useful
failure case was separating reservation from actual local send entry: it exposed
an attribution error without inventing a historical cause.

Independent Regulator must inspect the final remote SHA and original evidence,
add negative probes and issue the Verdict. C-METER-02 also needs a different model
family review, or one SHA-bound Human material review `H-METER-BOUNDARY pass/problem`
of explicit mode, unchanged old authority, cancellation and official deadlines.
That review is still pending; no repeated total-budget approval is requested.
New true evaluation requires Master-issued candidate-bound activation/new run
following acceptance; this candidate includes only an unauthorized template.
