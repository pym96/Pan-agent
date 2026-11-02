# #150 partial Handoff — CPU passed, Docker gate incomplete

Working Agent (Builder), immutable #150. Not a completion claim, Verdict, or accepted project fact. No PR created. Master ended further Stage B starts after repeated server I/O stalls. Implementation remains on `workorder/150-candidate`; main is untouched.

## Identities and scope

- Accepted baseline: `ebd093e9d6d18913a334030c3f66e6b11e70bd33`.
- Tested code and all executable probes: `b5f987c4e0f0fad8d4c86076e449d18b98ea7c42`.
- Installed tarball SHA256: `2c97505c21c466c4156f1b0927121ba2919fbec2782da834cd99587f0c5d0ebd`.
- This Handoff and README update are documentation-only descendants. Final delivery SHA is supplied in the accompanying handoff message; no executable bytes change from the tested commit.
- Stage B GO2: https://github.com/pym96/Pan-agent/issues/150#issuecomment-6570901275 . Earlier 4fbb559 GO was retired before server execution.
- Raw evidence root: `/Users/panyiming/.local/state/pan-agent/execution150-builder`; server mirror `server-b5f987c/`.
- Exact evidence manifest: `partial-evidence-manifest.json`, SHA256 `ff1b7acacdaada8bcbe97905f190ed3f363fd1a67bade0c5f0a8e779a40dbda2`.
- Server execution root: `/media/usv012/pjx/pan-execution150/builder/b5f987c`. No GPU, provider calls, paid model calls, daemon configuration, global package installation or unrelated-container changes.

## Implemented delivery

`typescript/src/execution/` contains the shared admission ledger, execution/goal state machine, installed CLI, process supervisor, worker adapter, immutable candidate verification and bounded sandbox maintenance helper. Existing NativeKernel/session paths use the same budget admission implementation; normal single-run tool execution remains supported. Supervised scheduled shell execution registers ownership durably before releasing its stdin gate. The CLI exposes `loop`, `goal`, and inspect-only `execution inspect`; it never resumes an interrupted execution implicitly.

Goal authority belongs to a criteria/candidate-bound executable verifier. Valid FAIL adds feedback to the next admitted attempt, UNKNOWN requires review, and only matching PASS before deadline succeeds. Cadence, operation counts, deadline, process stopping and separate preservation remain distinct modules. Last permitted admitted work can settle and PASS at balance zero. Model usage lacking a settlement or usage report remains unavailable. Archived Docker candidates are verified through an owned stopped container and readonly mount, with archive checks before and after; generation is never reopened.

Architecture/limitations: [design](../../design/execution-controller.md). Tests, fixtures, parametrized cases, mock boundary and criterion mapping: [verification guide](../../../tests/execution150/README.md). Representative failed approaches and corrections: [evidence notes](README.md).

## Executed evidence

| Gate | Result and evidence |
|---|---|
| TypeScript typecheck | Passed at tested code SHA |
| Complete old + new TS suite | 262 passed, 0 failed, 0 skipped, 23.893 seconds in clean ASCII detached checkout; `full-b5f987c.log` |
| Installed CPU pytest | 13 passed, 15.68 seconds; `pytest-b5f987c.log` and its retained base directory |
| Targeted policy/phase tests | 28 passed; `ts-targeted-rebind.log` |
| Seeded claim-is-success defect | Red failed, byte-for-byte restoration green passed; `negative-b5f987c/{receipt.json,red.log,green.log}` |
| Old worker-only cancellation counterexample | Detached shell continued heartbeat; exact owned group then cleaned; `detached-negative-a/` (earlier fixture execution, not mislabeled final-SHA run) |
| Docker initial unchanged `first.ts` | Failed external 105-second deadline after Node D-state startup and slow Docker create. Cleanup watchdog then hit inspect timeout2s and produced no receipt. `server-b5f987c/first.log`, `first/states/` preserved |
| Installed Docker goal | First pytest case finished and passed. Two attempts, FAIL then PASS; terminal succeeded; counts4 model/2 tool; usage unavailable; readonly write denied; both attempt containers cleaned; exported files retained. `server-b5f987c/installed-docker/pytest-run/test_docker_goal_readonly_veri0/` |
| Installed Docker deadline | Second case was interrupted by outer105s watchdog after prolonged setup I/O. No completed assertion result. Watchdog exit124 and owned stopped-container receipt retained; not counted as a passing deadline test |
| Unchanged remaining #148 Docker suites | Not started after Master stop instruction. No skip presented as pass |

The initial Unicode-checkout run had 15 path-related failures among234 tests; its log is preserved under `early-failures/`. Clean ASCII runs subsequently passed the complete suite. Initial archive-namespace collision, early timer wake and invalid tampering oracle are retained in the evidence notes rather than erased.

## Final resource observation

At 2026-11-02 06:51:29 UTC, independent read-only inspection recorded no matching candidate CLI, worker, supervisor, pytest or watchdog processes. `server-b5f987c/final-observation.json` contains exact identities:

- First probe container `5a06ee7ea84633e6e0439727cc431fe8ac8dd4aab4518d2a1f435f745f44b90c`: Docker status created, Running=false, never started; volume `pan-sb148-88e01026-4ea4-4e09-a51f-0c3d5fa4c1bb-work` preserved.
- Interrupted deadline container `327bf8bdf7c7b8de32af9329cd9ea9c9752164071d483365763030c9ea2edb1c`: exited, Running=false, exit137; volume `pan-sb148-f9d0afa2-4718-4404-bd43-d040c6af990f-work` preserved. Its state phase is stopped, not cleaned.
- Successful goal attempt containers no longer exist and their states are cleaned, with archives present.

No prune/removal of failed volumes occurred. The first watchdog's cleanup failure remains a failure despite later independent inactivity confirmation. The interrupted deadline test's sole volume was retained, not silently discarded.

## Remaining work and review boundary

C-EC04/05/06 and relevant G03/04 actual Docker deadline/cleanup and unchanged Sandbox regression requirements remain incomplete. C-G01 readonly actual goal behavior has one observed passing case, but no independent Regulator Verdict exists. All criteria still require independent exact-SHA review and the high-risk supplemental gate; CPU success is not acceptance.

Before further server tests, Master must establish readiness and rebind a prospective execution window and exact source/probe identities. Do not enlarge thresholds to hide the stalls or rerun this retired window. Root cause of server storage latency is unknown; D-state/folio wait, slow create and setup timing are observations, not proof of a specific disk fault or product defect. Resume with separately bounded setup and individual gates only if prospectively authorized; retain these failures.

Human supplied objective, constraints and criteria. Builder implemented, diagnosed and ran these candidate tests. Master supplied stage authorization and stop decisions. No resume, public benchmark, model-quality or generalized security claim is made.
