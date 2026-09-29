# #103: diagnose handoff failure and admit continuation only after settlement

This is an offline candidate, not a #97 deployment or activation. Historical
polyglot-c-py, polyglot-rust-c and protein-assembly failures remain unexplained at
the first handoff exception: the old catch discarded it. Historical timeouts that
reached verifier are controls, not proof that all timeouts are equivalent.

## Failure loop and change

`test_handoff_103.mjs` invokes the installed GeneralAgentSession, NativeKernel,
Kimi adapter and transport with synthetic responses and tools. A controlled tool
wait survives the agent deadline; the run settlement watchdog fires. Baseline
loses the original exception and unconditionally pauses. This is a demonstrated
mechanism, not a reconstruction of the historical cause.

Runner session owns one run promise and one close promise. It never uses a second
concurrent close call as evidence that the first completed (the frozen session
closes admission before its original close promise settles). Product code is not
modified: retaining and awaiting the original promises supplies the needed seam.
Raw transport send/read/iterator-return and tool wait promises are tracked by
source; a timeout race never removes the underlying operation. Admission remains
closed after cancellation. Late output cannot append new ledger records, dispatch
requests or admit tools after the attempt ends. Pending raw operations prevent
verification and continuation, even if an upper cancellation race already settled.

`faults` retains ordered source, lifecycle phase, exception type, safe code and
bounded cause chain. Watchdog errors are branded in a module-private WeakMap,
not identified by user-controlled error strings. Arbitrary error messages/stacks
are omitted; fingerprints correlate otherwise unknown causes. No requests,
Authorization, credential values or reasoning content are included. Existing
exchange diagnostics and immutable globalStops remain separate from these faults.

## Confirmation and disposition

Only internally generated run-settlement/close watchdog failures are eligible
for recovery. Arbitrary handoff exceptions/rejections remain unknown and stop recovery.
Ordinary task/model failures retain their existing classification; unknown current
settlement and global failures cannot be treated as ordinary task failures. Confirmation
requires all of: closed admission; actual run fulfillment (including NativeKernel
and archive settlement); actual original close fulfillment; no pending raw
transport operations; no pending tools; broker quiescence confirmation; environment
stop confirmation. Source promises and broker replies, not a report string, build
these booleans. No remote Provider computation-stop claim is made.

After destructive stop, one additional **15s finite observation window** waits for
actual settlement promises. This reuses the frozen handoff-wait scale; it is a
bounded safety observation policy, not an empirically tuned fix for the unknown
historical delay. Original agent deadline and verifier deadline remain unchanged.
The previous15s close and35s environment-stop bounds remain. Every wait terminates;
unknown/failed confirmations refuse continuation. No infinite polling or repeated
stop/re-run loop is added. Merely extending a timeout does not authorize progress:
the success path requires all actual settlement evidence.

The controller checks the report's confirmations while retaining all globalStops.
Only the narrow local-watchdog history can be recovered; user cancellation,
authentication/quota, resource, unknown-work and verifier failures still stop.
After broker.close, independent controller reconciliation, result persistence and
successful archive publication, it appends a `continuation` event and may enter
the next task. Cleanup/close/archive failure cannot be overridden by session proof.
The normal resource poll and activation checks still precede next reservation.

## Scoring and immutable history

A normal timeout whose session closes and quiesces legally still uses the original
verifier lifecycle. If settlement watchdog destroys the environment, the attempt
remains unscored/null, even after cleanup recovers. No verifier rerun, deadline
extension, zero substitution or replay of the consumed task is allowed. Recovery
only changes permission to enter the next unstarted task; it does not revise old
result/globalStop events or usage.

## Verification and deployment

Two-task tests use the actual CLI, journal, ledger, signed synthetic permits and
actual installed Session/NativeKernel/adapter. Only environment and transport are
synthetic. Positive tests never substitute a static runAttempt report. Negative
controls include permanently pending work, failed stops, cancellation/account
failure, false single-layer evidence, spoofed watchdog strings, delayed callbacks,
close rejection, archive failure and resource failure. Synthetic scores are test
fixture values, never #97 benchmark results.

No TypeScript/product or package identity changed; the accepted #94 installed
product is used directly in offline tests. No new product package is required by
this candidate. A new accepted runner SHA requires a separately authorized
production deployment/successor design: existing campaign identity is frozen and
#102's importer only accepts its old pinned predecessor. This work does not edit
that pin or real campaign metadata and cannot be dropped into the active runner.
Master must arrange any migration, new binding and signature after independent
Regulator acceptance. #97 live execution remains paused.
