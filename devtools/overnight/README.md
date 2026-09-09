# Single-WorkOrder offline coordinator

Product development tooling for [WorkOrder #45 activation 1.0](https://github.com/pym96/Pan-agent/issues/45#issuecomment-5584581317). The only executable mode is **SIMULATED offline**. Local child processes create and push synthetic candidates to a disposable bare Git remote. A separate fake review process rejects or accepts the exact remote SHA. These messages are fixtures, not a Verdict accepting this utility.

## Install, build and check

Required validation platform: Node **22.19.0**, Darwin arm64. No runtime dependencies. The private package uses only cached TypeScript **5.9.3** and @types/node **22.19.19** (plus that pin's locked transitive types). From this directory:

```sh
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run check
```

`check` runs typecheck, build, the complete seven-criterion test suite, and protected-byte/package checks. Source/tests never import Pan or Pi. The default test suite creates disposable synthetic repositories and real ordinary process groups, includes delayed sentinel checks, and retains artifacts. Set `OVERNIGHT_EVIDENCE` to a fresh local directory to retain the named A-* indexes there. Without it a temporary evidence directory is created. This environment variable is not inherited by role children.

## Offline demo

From a clean checkout, bind the invocation to its exact 40-character commit:

```sh
OVERNIGHT_NODE=/absolute/path/to/node22.19.0 ./devtools/overnight/demo.sh FULL_CANDIDATE_SHA
```

The wrapper verifies clean Git bytes, HEAD and Node version before executing the committed demo. The Handoff supplies the concrete command and hashes. Startup prints the SIMULATED issue, limits, local state location and stop command. The demo creates C1, reviews/rejects it, creates descendant C2, reviews it in a new clean worktree and stops at `accepted_pending_master`. Expect **2 Builder and 2 Regulator attempts**, one repair, and unchanged main. This is not real Agent interoperability or Human acceptance.

## CLI

Use `node --experimental-strip-types src/cli.ts` as the command prefix from this package directory. These commands require no account:

```text
fixture [repair|accept|blocked]    create a fresh disposable Git job; print CONFIG and STATE
start CONFIG STATE               run its explicitly authorized offline route
status STATE                     inspect a redacted structured summary
summary STATE                    same summary
stop STATE                       persist an idempotent stop request (may precede start)
resume CONFIG STATE              reconcile ownership and resume positively known work
reconcile CONFIG STATE           explicit alias of resume
```

Use the same STATE registry for cooperating coordinators: one owner and one bound job are permitted. A second job cannot take over that registry; choose another registry only after the first job is stopped. This is a local cooperating-owner lock, not a distributed global lock against unrelated programs or operators deliberately choosing separate registries.

All commands are foreground operations; no daemon, scheduler or real Agent launcher is installed. `stop` records a request; an active owner performs and records cleanup. After a coordinator crash, `resume` is required to inspect its recorded process identity and execute a pending stop. Status never claims cancellation merely because a stop file exists. Unknown effect/identity requires operator reconciliation, not blind retry. Do not delete locks, reset timers, reuse a stopped job, or edit a ledger to make it accepted.

The summary identifies issue/version/SHAs, attempts, repair consumption, expiry, state, pending Human reason and relative artifacts. It contains no private workspace paths or raw role text. Local demo startup prints only its own generated artifact directory and stop command. `accepted_pending_master` means the **synthetic** role protocol completed; it never moves main. Account costs are not measured or represented as a promised zero-cost real deployment.

## State, identity and recovery

[Source map](src/README.md), [tests](test/README.md), [trusted synthetic fixtures](fixtures/README.md), [design](../../docs/design/overnight-handoff.md) and [obligation map](../../docs/design/workorder-45-obligations.json).

Manifest fields bind offline mode, job/repository/issue/base/candidate branch, exact contract digest/version and criterion IDs, optional synthetic Human proof, authorization digest, fixed Builder/Regulator template digests, permitted workspace/executable, repair and time limits. `authorization.json` separately binds the manifest contents. Templates describe future delegation; they grant no real session roles. Paths and argv are generated from this validated manifest and fixed fixture executables. Unknown result fields are rejected rather than reflected.

The ledger uses checksummed atomic replacement with fsynced content; tracker entries use exclusive per-key writes. Launch and publication intent precede the effect. Attempt keys bind repository/issue/contract/version/authorization/job/role/number/candidate/session. Completed duplicate messages link to the original record. Recovery checks receipt and OS start/command identity, completion and exact tracker result. A missing receipt, corrupt record or incompatible ref/contract stops for reconciliation and preserves original records. A positively absent coordinator owner may be retired only by explicit resume; an existing/reused PID is never killed or blindly stolen. This does not promise generic exactly-once filesystem/Git effects after arbitrary hardware failure.

Frozen ceilings are 2 repairs (3 Builder + 3 review attempts), 8 hours total and 60 minutes per role, one active role process. Smaller positive integer time limits and repair count 0..2 are supported. Limits are inclusive at expiry, and the original wall expiry is retained across recovery; monotonic elapsed time also enforces limits while alive. A backward wall clock stops. Only existing-ID `criterion_failed` can repair; Human gaps, unknown criteria, ScopeChallenge, quota problems, abnormal/missing/malformed results and exhausted limits stop.

## Process and data boundary

The operator trusts the coordinator, local manifests, Git and fixture executables. This is **not an OS sandbox**. The detached supervisor owns an ordinary process group and records a stable start/command identity. On stop/deadline, the coordinator records t0, sends TERM, escalates after a nominal 150 ms (contract maximum 250 ms), and confirms the group empty within the 2000 ms contract bound. Failure to confirm is `cleanup_failed`. Tests retain unrounded observations through t0+3000 ms and a descendant's delayed 2500 ms sentinel. Escaping process groups and hostile native executables are outside the claim.

Children receive an explicit PATH/HOME/locale/Git allowlist, never the parent environment. No credential-source or network connector exists. The wrapper discards stdout/stderr; coordinator reports contain allowlisted typed fields and fixed categories. Unexpected JSON fields cannot become shell commands, policies, approvals or reflected error text. Dynamic printed data uses escaped JSON, including terminal controls/bidi. Test canaries and raw synthetic role result files are labelled fixture-only material; keep them local. A public Handoff contains safe summaries and evidence hashes, not raw canary transcripts.

Real operation needs a separately accepted utility, persisted Human role-template delegation, aligned governance and a concrete one-job account/time/budget authorization. Nothing in this package activates that later stage.

## Recorded-result repair (same Criteria-Version 1.0)

After the rejected edb507f candidate, recovery now applies the same strict result validator used on first delivery. Before routing or reporting a resumed terminal job it rechecks recorded tracker schema, role/session/attempt/candidate identities, persisted result digest, original role result, successful process completion, receipt identity, exact evidence bytes/identity and worktree snapshot. The last recorded result is checked again before the next route decision. Invalid recorded data stops as `needs_reconciliation` with the fixed `recorded_result_invalid` category; it cannot reserve a repair or supply reason text. Existing tracker/evidence bytes are preserved.

[Recovery regressions](test/recovery-integrity.test.ts) kill an actual coordinator immediately after durable review or Builder recording, tamper only fresh synthetic records, and restart through the actual CLI. The unchanged-record control still completes its repair route. This repair does not change the activation contract or supply missing independent/Human review.

## Recovery cleanup repair (F4, Criteria-Version 1.0)

An invalid historical result forbids further routing while explicit resume still cleans the current independently verified owned group. Stop and persisted role/total expiry remain effective. The final state retains `recorded_result_invalid`: `needs_reconciliation` after confirmed cleanup, or `cleanup_failed` when ownership/cleanup is unconfirmed. `history-reconciliation.json` records both the integrity failure and cleanup state/reason; the attempt retains its actual stop receipt and lifecycle measurements. Corrupt tracker/result/receipt bytes are not rewritten, and historical output never establishes ownership. Current receipt PID/start identity must also match the durable launch identity before cleanup. Normal unchanged-history routes retain their existing states.

[Combined crash/stop regressions](test/recovery-stop.test.ts) emit `R-F4.json`, including role/total expiry and conflicting/reused identity controls. Failed-before and passing-after observations belong to separate fresh synthetic locations; test backstops are separate from candidate cleanup evidence.

## #46 staged Codex/GitHub connector

The [operator guide](../../docs/design/codex-single-job-connector.md) documents `src/connector.ts` dry-run/start/status/stop/resume and the SHA-bound `connector-demo.sh`. The original offline CLI remains separate and refuses connector modes. The new default scope gate uses the #46 baseline/allowlist and preserves the original #45 gate and 36 test obligations. Stage A fixtures are SIMULATED; real subscription execution needs an exact Stage B binding after independent review. No account operation is part of the offline demo.
