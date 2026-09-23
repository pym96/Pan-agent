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
- Final installed-pilot matrix: **76/76 passed** on Node 22.19.0, including the
  new signed metering/recovery and old #83 controls. A separate six-case CLI run
  also passed against the final guarded package identity.
- Both Kimi legacy and K3 guarded clean consumers passed at source commit
  `c77a11c713d80e5afe464936ff070256eb12adbe`; K3 includes 17 guarded phases.
  Both packaged `ff1be95187d83b90b2485255541b7f66fde54f5a6fcf2d86fa4db1eef5c525c8`.
  `identity-audit.json` verifies all 80 installed bytes against the final lock,
  development test install and current source-to-build map. Final evidence/lock
  edits do not change Product bytes.
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
container calls; no new spend, old ledger reset, main change,
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


### Disclosed harness scope deviation

The first guarded legacy-consumer run (`guarded-kimi/`, candidate
`ab9640417c36b2611b0aef504f23e88fc2aae8f4`) reached an obsolete startup assertion.
Inspection then found two `security find-generic-password` existence probes and
one cleanup `delete-generic-password` attempt against the script's freshly random
`test-*` account in `com.pym96.pan-agent.workorder-52-test`. No test item was created;
the existence probes returned nonzero; no credential value was displayed. These
were not Provider/account-quota calls, but they violate this WorkOrder's prohibition
on Keychain searching. The original script at that SHA, failed logs and a scoped
incident record are retained. Builder does not waive this deviation or claim full
scope compliance. Independent Regulator/Master must decide its disposition.

The necessary verifier adaptation removes those system calls entirely, uses an
environment-only configure driver whose Keychain-save dependency fails closed,
and replaces the obsolete yes/no startup input with the current `:exit` command.
The no-run/no-provider oracle remains; product startup behavior is not modified.

A second consumer run stopped when the old #35 guard rejected read-only ancestor
`lstat` needed by the already accepted file-authorization layer. The verifier now
uses the existing #49 metadata-only guard (as the K3 verifier already does),
retaining its separate metadata receipt and all content/network/credential guards.
No new content-access exception or Product change was added.

The next legacy task probe correctly encountered `approval_unavailable`: its old
fixture expected file creation and Shell with no operation approval channel. The
updated fixture explicitly approves only its three frozen action hashes/targets
inside its fresh synthetic workspace. Production authorization remains unchanged;
the file content and child-process assertions are retained.

Early npm commands also used npm's default user cache/log location outside the
authorized WO85 directories (one failed pack log explicitly names
`/Users/panyiming/.npm/_logs/2026-09-23T13_05_17_645Z-debug-0.log`). This incidental
write-scope deviation is disclosed, not waived. Subsequent package commands use
the WO85 cache; no user cache cleanup was attempted.

The initial red test also used the historical helper's default temp root before
WO85 TMPDIR was supplied, creating
`/var/folders/y0/l5kd4xvd2ls8bkp65s5db8mh0000gn/T/wo83-offline-bv4KZZ`.
Its synthetic fixture was copied into this issue's evidence; the original was
left unchanged. Later test artifacts are under the authorized WO85 root. This
third incidental write-scope deviation joins **SC-85-SCOPE-01** (legacy Keychain
probe, npm default cache/log writes, initial temp location), pending Master /
independent Regulator disposition. Technical passes do not resolve that challenge.
