# #103 Criteria1.0 — offline handoff diagnosis and confirmed continuation

Builder candidate based on032fb0fba5e9d3893f90a4ff4baae89b43af37aa; not accepted,
not deployed, no #97 live call. [Design](../design/handoff-recovery-103.md) and
[machine-readable evidence](handoff-recovery-103-summary.json). Full candidate SHA
is bound in GitHub Handoff after push.

## Repair after independent rejection (current candidate)

Criteria1.0 unchanged. The first candidate `aa3ea59e4314ab5e872eb9ef583841507ef27987`
was rejected on C-HND-02. Independent Verdict SHA256
`a8e74cefc5c4f75b7ac2fca3bb48bbbdfc22a03b26a15dc5dfd9a0b168253e40` is in
`regulator-20260929-criteria10-final/` under the original evidence root. The
[Master repair order](https://github.com/pym96/Pan-agent/issues/103#issuecomment-5887709758)
authorizes this append-only repair; the old SHA and raw evidence remain preserved.
All new raw artifacts are in that root's `repair-source-settlement/` subdirectory.

The copied independent source-return probe went red in139ms: original cleanup
pending, but continuation allowed. A new actual-core/full-controller regression
also showed the second task starting before cleanup and even after cleanup rejection.
No tests substituted a static report. Original independent files were not edited;
copies only change checkout paths and drive the new pending recovery timer at100ms.
The production15s observation and official task/verifier limits do not change.

Ranked hypotheses were lost source promises, recovery snapshot omission, and
controller ignoring negative confirmation. Inspection and original-source event
assertions establish the first: the frozen transport raced reads and discarded its
return cleanup promise. Runner could not infer the missing state from wrapper
completion. This does not establish the cause of the three historical live incidents.

The product now exposes original source read/return promise settlement to its owner,
without request/credential/response payloads in the observation interface. Prompt
cancellation and source settlement remain separate. Late fetch fulfillment after
abort closes an unentered body through the same observable cleanup path. Runner
tracks both raw operations; rejected cleanup is a hard stop. Never-settled read or
return cannot grade or continue; finite return completion permits at most one next
task only after all existing session/tool/environment/archive/resource checks.
Global failures, prior consumption, scores and immutable fault history stay intact.

New isolated package SHA256:
`5ecd3b9b4da688f90dfee3cc651b4a2f755595587b6d7d7287383cab23c8e580`.
Installed entry:
`/Users/panyiming/.local/state/pan-agent/handoff-recovery-work/repair-source-settlement/consumer/node_modules/pan-agent/dist/index.js`.
Among82 pinned installed files, only `dist/providers/kimi/kimi-transport.js` and
its `.d.ts` changed. `baseline_sha` is the prior candidate from which the package
source repair starts; final source identity is the SHA-bound Handoff, with exact
source/build/package hashes retained. Frozen Python/Harbor identities also verified.
The unchanged #94 production package is preserved and no longer used as repair proof.

Validation:132 runner tests passed against the newly installed package;203 product
source tests plus typecheck passed; both copied independent source-return probes
passed as Builder regression (not an independent Verdict). Source tests cover
original pending read/return, synchronous cleanup throw, rejected/fulfilled cleanup,
repeated cancel, late bytes, and late unentered fetch cleanup. Controller tests cover
pending, finite, rejected and read-pending source paths; archived first result remains
null and consumed run cannot execute again. Commands and full logs are retained.

Failures retained: `green-controller.log` had23/24 pass because the new test looked
for EPIPE at the watchdog-code field instead of the existing safe cause chain;
correcting that assertion retained the same rejection requirement. Initial product
check found5 strict TypeScript optional-index errors in the new test, fixed with
explicit asserted indices. `runner-regression.log` had126/128 pass: two older tests
left source.next permanently pending yet expected grading. Under C-HND-02/03 that
is uncertain work. Those exact inputs now assert null/blocked; additional genuinely
settled-read inputs assert normal grading. No pending-return red assertion was
weakened to permit continuation. The full updated suite is132/132.

Learning correction: Builder previously equated transport wrapper settlement with
original resource settlement. Regulator supplied the counterexample; Human kept
the original gate, Master returned the candidate, Builder repaired the missing seam.
The prevention is a contract/test at the original source owner, not more timeout
or more confirmation labels. No live-success improvement or Human implementation
claim is inferred. This repair awaits independent review of its own SHA/package.

Production campaign/ledger979-file hashes and file set remain unchanged. Cumulative
resource policy is still strict54GiB/20GiB with baseline48503971840; sample evidence
includes all mandatory roots, the actual Python framework, and shared build-tool
node_modules. No live model/task/scoring/pull, deployment, migration or signature.
#97 remains paused at62 consumed/27 unstarted and20 historical unknown scores.
Accepted deployment and a separately authorized successor design/new binding are
still needed: #102's fixed old source importer cannot directly migrate current #97.

## First candidate record (historical; rejected, not current claims)

The following original account is retained to show what was believed/tested at
`aa3ea59e4314ab5e872eb9ef583841507ef27987`. Its no-product-change conclusion and
raw-source confirmation claim were superseded by the independent counterexample
and repair above. Its original logs and checks remain intact.

## Observed defect versus unknown historical cause

Read-only inputs include the three late handoff reports (polyglot-c-py,
polyglot-rust-c, protein-assembly), plus extract-elf, extract-moves-from-video and
cobol-modernization timeout/verifier controls. `historical-observations.json`
records paths/hashes and selected classification fields. The historical catch lost
its exception; this candidate does not retrospectively assign a root cause.

Initial rapid test called the real installed GeneralAgentSession/NativeKernel with
a fake Kimi transport and a controlled pending tool. It fired the official-agent
cancellation seam then the settlement watchdog, released tool wait during stop,
and asserted first-cause diagnostics/confirmed continuation. `red.stdout` failed
in164ms: expected agent_settlement_timeout, got undefined. The reproduction is a
controlled possible mechanism, not proof this caused all historical incidents.

Hypotheses tested: (1) catch erases cause (confirmed); (2) persistent global-stop
history is conflated with current settlement (confirmed for the injected sequence);
(3) upper cancellation/close may appear settled while underlying work remains
(confirmed with a noncooperative fetch negative control). The implementation keeps
fault history immutable while requiring actual multi-layer settlement before
admitting the next task.

## Candidate behavior and tests

Fault records preserve phase/source/order/type/safe code and cause fingerprints.
Unknown error content is not copied. Canary tests cover Authorization, credential
and private-reasoning text. Branded internal watchdogs distinguish known local
failures from arbitrary exceptions named like a timeout.

One original session.close promise is retained; run/session/archive settlement,
raw transport send/read/return and tool waits are observed independently. A
Promise.race cancellation does not prove its source stopped. Pending raw work
refuses both verifier and continuation. The additional bounded15s observation
window after stop cannot authorize scoring or reset official deadlines.

Positive recovery preserves globalStops and null score, but all seven confirmation
fields must be true before controller cleanup/reconciliation and archive succeed.
Only then can the controller continue. Unknown or global failures still stop;
next reservation still checks resources and activation. No new product package,
model policy, budget, Harbor version or official task/verifier change.

`regression-final.stdout`: **124 passed,0 failed,0 skipped**. Includes actual
core + full CLI two-task cases (normal and recovered first task start the second
exactly once; permanent pending work, environment stop failure, archive-boundary
failure and resource failure do not), plus close rejection/delay, tool failure,
transport refusing cancellation, explicit user cancellation/authentication,
spoofed timeout, single-layer false success, late resolution and repeated cancel.
Existing normal timeout-to-verifier paths, meter/usage, official score validity,
old run/consumption protection and broker boundaries also pass. Synthetic
controller scoring files are test fixture inputs, not real benchmark results.

## Failed attempts and bounded tradeoffs

`full-probe1.stdout` preserved3 failed assertions: fake close/recovery timers both
fired on the next immediate turn, before legitimate async archive settlement.
Changing only the **fixture** recovery timer to100ms allowed real I/O to settle;
permanent pending controls still failed closed. Production recovery remains15s,
not100ms. `full-probe2.stdout` retained the corrected five-case run. No production
failure was suppressed to make a test green.

The first standalone fixture invocations inherited default temporary storage;
subsequent regression invocations explicitly set TMPDIR to the issue-owned internal
tests directory. No production/original directory was cleaned or overwritten.
All retained final test artifacts use the dedicated issue roots.

Human authorized offline diagnosis; Builder designed and tested the runner seam;
Master owns later deployment/activation; independent Regulator must rerun and
challenge these claims. No measured improvement in live success rate is claimed.

## Provenance, validation and deployment boundary

Raw evidence root `/Volumes/WD_BLACK/pan-agent/handoff-recovery-20260929/`;
work/fixtures `/Users/panyiming/.local/state/pan-agent/handoff-recovery-work/`.
Production read-only inventory covers979 files (campaign plus existing ledgers),
with a later unchanged comparison. No new ledger/activation/live task was created.
Resource samples use accepted owned-root accounting including the real Python
framework, strict54GiB increment/20GiB free floor and original Docker baseline.

Exact executable regression invocation is recorded in commands.txt. Host acceptance
logs are separate; structural validators resolve the existing host, and Python
regression executes the candidate checkout. Candidate scope and whitespace checks
are also recorded. Main and #97 report branch are not modified.

Deployment needs a new accepted runner and an explicitly designed successor for
current #97 state; existing runner identity and #102's fixed source pin must not be
edited in place. No TS/package changes: all actual-core tests use the unchanged
accepted installed #94 product. A new product package is not needed here. #97
62-consumed/27-unstarted boundary and20 unknown historical scores remain untouched.
Regulator acceptance and later Master migration/new signing are still outstanding.

Final host acceptance passed82 host tests and259 Python tests (6 existing skips).
The979 protected production files and file set remained unchanged. Final resource
sample: free42138275840, owned3107721216, Docker88799166464 bytes; original
baseline and54/20GiB limits retained. Installed product identity verification passed.

Final fault-array snapshot hardening was followed by20 actual-core/session/controller
tests, all passing (`final-fault-snapshot.stdout`); late diagnostics cannot mutate
the already-returned fault history.20 earlier two-task controller fixture directories
are preserved externally for inspection; additional final fixtures remain in the
issue-owned internal tests directory.

A recovery-window rejection also records `recovery_unconfirmed`, so a same-turn
late settlement cannot erase that failed confirmation. The final20 relevant tests
passed again (`final-recovery-boundary.stdout`).
