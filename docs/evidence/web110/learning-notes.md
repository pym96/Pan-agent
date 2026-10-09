# #110 decisions and failures

Goal: confirmed-boundary cross-process continuation, with zero real model/benchmark calls and unchanged legacy behavior. Human/Master supplied scope and privacy/resource boundaries; Builder designed and implemented the seam and probes. Independent validation remains Regulator work.

The first design decision was to make checkpoint persistence and invalidation awaited Native callbacks, rather than restart runTask with seeded history. Existing runTask appends a user and has only local counters; that would repeat work or undercount. Adapter-owned private state and a distinct resume entry preserve the actual loop while keeping private continuation outside the archive.

The first actual interrupted/resumed run succeeded, but the final control comparison test failed because its local `csv` byte variable shadowed Python's csv module used by the shared verifier. The failure trace remains in `evidence/first.log`; changing the local name fixed the verifier and the second whole probe passed. No product success was inferred from the failing verifier.

Review of RunArchiveStore showed unsealed archives must be explicitly recovered/sealed rather than merely left behind. Stop-only recovery now first retains original events separately, invokes the existing Product recovery rule, then permits checkpoint recovery. Sealed history stays unchanged. This is a deliberate distinction between sealing interrupted evidence and resuming execution.

Checkpoint/DB hash integrity does not defeat a trusted host or DB administrator. Public authorization is instead bound to server-owned account/conversation/task/attempt records, and the API never accepts arbitrary private state or paths. Real Kimi persistence remains unsupported pending a separate privacy/storage decision; synthetic Faux state proves only the Stage A mechanism.

Builder review found a narrow publication race: if interrupted+cleanupConfirmed became visible before the old attempt row was finalized, a concurrent resume could change the task to queued while the old deferred update was still reading it. Stop eligibility now stays false until the old attempt is recorded. Likewise cancelling a heartbeat-lost checkpoint must remain cancelling until resources are actually stopped; an eligible point alone cannot certify stop. These changes are confined to checkpoint-aware interrupted control, with a dedicated live-PID heartbeat-loss negative probe.

Final storage review added fsync of the output directory and attempt parent directory as well as file contents and the checkpoint directory. This makes the commit barrier cover directory entries, not only open file contents. The positive cross-process/control comparison and changed-file negative were rerun after that change.

A supplemental `scripts/check_module_layout.mjs --check graph --product-only` invocation rejected the existing `typescript/src/input/attachments.ts` as ungrouped. The unchanged #109 baseline fails at the same assertion. This frozen #41 classifier is not a current graph oracle; both logs are retained, and no old assertion/script was weakened. Current Product typecheck/206-test suite and explicit changed-path/link checks are the applicable checks used here.
