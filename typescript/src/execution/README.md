# Execution control

One admission implementation is shared by ordinary NativeKernel tasks and scheduled tasks. The public controller interface accepts a plan and TaskRunner; the installed CLI composes an independently supervised Node worker running the normal GeneralAgentSession.

- [admission.ts](admission.ts): atomic whole-batch reservations, per-run/enclosing counts, idempotent settlement. A failed admitted request still consumes a count; unavailable usage remains unavailable.
- [controller.ts](controller.ts): monotonic fixed-rate cadence, exclusive deadline, cancellation and Goal PASS/FAIL/UNKNOWN transitions. Reconciliation observes activity without authorizing duplicate dispatch.
- [cli.ts](cli.ts): operator plan/verifier validation, exclusive execution identity and existing RunArchive persistence.
- [process-runner.ts](process-runner.ts): worker IPC, frozen candidates, verifier and bounded maintenance orchestration.
- [supervisor.ts](supervisor.ts): independent deadline/disconnect observer; owns worker and supervised shell process groups. Shell command release waits for durable ownership acknowledgement.
- [worker.ts](worker.ts): normal Session/NativeKernel/tools, retained session context and RPC admission. Worker results are correlated to their active attempt.
- [maintenance.ts](maintenance.ts): bounded private Docker recovery/export/cleanup helper.

Private executable modules are not imported for side effects by the package facade. Worker messages cannot alter the operator plan or verifier. A TaskRunner supplied by an embedding application must implement confirmed stop and bounded preservation; merely implementing a Promise is not a hard-stop guarantee. The built-in CLI adapter supplies process supervision. Trusted-local execution remains host-user authority and does not contain deliberate process/session escape; Docker supplies the enforced resource boundary.
