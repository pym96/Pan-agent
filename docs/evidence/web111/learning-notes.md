# Decisions and retained failures

## Completion uncertainty is an evidence problem

Goal: resume a local two-stage analysis after a real process loss without blindly repeating side effects. Constraints: single Worker, Faux, fixed image, no real model/benchmark, old archives immutable, cumulative resource protection.

Initial implementation boundary in #110 was a settled tool round. Code inspection showed a gap after Docker completion but before Native recorded the result. An analysis-written stage1 file only proves that file exists; it does not prove the trusted wrapper observed a complete result. Builder therefore added a pre-effect private Native snapshot and a host/DB-acknowledged monotonic dispatch/receipt protocol. Go keeps control and storage authority; Native keeps canonical context and adapter continuation authority.

A second important failure mode: the kernel normally converts a tool exception into model-visible failure feedback. A receipt persistence failure cannot use that ordinary path, because a later model turn could obscure an uncertain effect. The optional settled barrier prevents that continuation; the dispatch record remains unknown. The actual receipt-failure probe checks no replay, while the nonzero-exit probe separately demonstrates that a durably observed failure *can* be fed back unchanged.

A source review also caught an archive attribution concern: an imported result must not emit a fresh `tool.settled` without a corresponding new invocation. The kernel retains that result in canonical context and preserves attempt/checkpoint provenance, while suppressing fresh tool execution observations for reuse. A negative assertion checks that no synthetic tool observation is emitted.

Actual evidence includes terminated Node PIDs, a stopped owned container explicitly removed before continuation, distinct new container identity, exact CSV/source semantics and unchanged sealed archives. Limits remain single-tool gaps and trusted host/DB administrators; no arbitrary exactly-once or real Kimi recovery claim. Human supplied goal/architecture/constraints, Agent implemented and tested, independent Regulator still decides acceptance.

## Verification-script error, retained

The first new negative suite completed receipt/link/ownership rejection cases, then failed because a helper named `concurrent` shadowed Python's `concurrent` module. This was a harness failure, not a product result. Original `evidence/negative-1.log` and its runtime artifacts remain. The helper was renamed; `negative-2` reran the suite and reached the concurrent admission/cancel assertions. No failed record was overwritten or converted to a pass.
