# Executable verification v1 — #146 Criteria1.0

One module exposes `run`, `check`, `demo` through the [public CLI](../../scripts/verification/README.md). The interface includes independently selected trust inputs and external immutable output. It supplements manual Criteria Lint and independent/Human acceptance; it does not replace either.

## Manifest

Exact JSON bytes are separately SHA256-pinned by the reviewer. Required shape:

```json
{
  "schema":"pan-verification-manifest/v1",
  "workorder":"146", "criteriaVersion":"1.0",
  "candidateSHA":"<40 lowercase hex>",
  "verifierFiles":{"cli.mjs":"<64 hex>","engine.mjs":"<64 hex>","...":"..."},
  "required":[{"id":"answer","criterion":"C-DEMO","command":"assert"}],
  "humanCriteria":["H-REVIEW"],
  "commands":[{"id":"assert","argv":["/absolute/node","--test","fixtures/assertions.mjs"],"cwd":".","timeoutMs":3000}]
}
```

`verifierFiles` is the lexicographically sorted full regular-file map of the trusted directory. Its compact JSON serialization is hashed as verifier identity; do not omit tests or executable modules. No symlinks/nonregular files; files capped1MiB. Commands use argv (no implicit shell), cwd confined under trusted root, 1–32 commands, 1–256 unique required cases, unique command IDs, every command mapped, distinct Human/machine criterion IDs. Timeout integer1–300000ms. Required sets must not be empty. Candidate must be exact root of a clean Git checkout, including no untracked files. Reviewer manifest/trusted directory must be outside candidate. The test can read the candidate via `PAN_VERIFY_CANDIDATE`; authority to execute the trusted command comes from reviewer-selected manifest, not discovered evidence.

## Report and execution

The runner injects `PAN_VERIFY_REPORT` (new external file), `PAN_VERIFY_RUN_ID`, `PAN_VERIFY_CANDIDATE`, PATH and LANG only. It does not dump or forward API credentials. The trusted cooperative test writes:

```json
{"schema":"pan-test-report/v1","runId":"<injected UUID>","outcomes":[{"id":"answer","outcome":"PASS"}]}
```

Exactly one terminal PASS/FAIL/SKIP per required case; unknown IDs, missing, duplicates, malformed and empty collections are unusable. FAIL comes from actual assertion adapters (included example uses `node:test` and `node:assert`); this is not a universal TAP/JUnit/pytest parser. A test program can lie: trusted local code/reviewer-selected oracles are assumptions. Wrong oracles remain possible.

Observed assertion FAIL takes precedence over other incomplete evidence for its criterion. Otherwise a criterion needs every mapped case PASS, valid report/run identity, exit0, no launch/timeout/output-overflow error and confirmed owned process-group cleanup. Any missing evidence yields NOT_EVALUABLE, never an inferred product failure. Nonzero without assertion FAIL is infrastructure/unusable evidence. All machine criteria must PASS for exit0. Human criteria remain pending separately.

Each command records argv/cwd/timeout, ISO start/end, monotonic duration, Node/platform/arch at receipt level, PID/exit/signal, timeout/launch/overflow flags, cleanup confirmation and SHA256/size/path for raw stdout/stderr/report. stdout/stderr/report each capped1MiB; overflow stops the process. POSIX detached groups receive TERM then KILL, with bounded cleanup confirmation (under5s). Cooperative processes must not escape their owned process group; this is not hostile-process containment. No shared/global processes are touched. Execution context is rechecked after commands; change invalidates the run.

## Receipt and check

Receipt schema `pan-verification-receipt/v1` binds run ID, actual clean candidate SHA, exact manifest/verifier hashes, context stability, runtime, command records and evaluation. Receipt is outside candidate/trusted trees; output directory must be new. Check takes independent manifest/verifier pins, recorded receipt SHA256 and expected run ID, verifies current checkout/trusted context, exact command definitions and every raw artifact hash/path, then recomputes outcomes. Stored prose/evaluation cannot override reports. No command is launched by check. Different identity/run, changed artifacts or changed receipt are refused. No age-based expiry is claimed.

Hashes establish identity relative to trusted pins, not signatures, authorship, adversarial attestation or evidence freshness. A compromised OS/test process can forge a complete bundle. Approved commands are trusted code and may have host effects; path checks do not sandbox arbitrary argv. Included tests/demo have only disposable local filesystem/process effects and no model/network activity. The machine emits no acceptance decision and cannot close issues, merge, or satisfy Human review.

## Fixture coverage

Public CLI tests cover GOOD, ASSERTION_FAIL, MISSING_REQUIRED, DUPLICATE_ID, EMPTY_COLLECTION, SKIPPED_REQUIRED, WRONG_SHA, DIRTY_CHECKOUT, STALE_IDENTITY, ALTERED_ARTIFACT, ZERO_EXIT_NO_ASSERTIONS, NONZERO_NO_ASSERTIONS, TIMEOUT_CHILD, LAUNCH_ERROR, MALFORMED_REPORT, FORGED_PROSE_PASS, ALTERED_VERIFIER, ALTERED_EXPECTATIONS, PENDING_HUMAN. Identity/completeness map C-EV-01; process/assertion classification C-EV-02; seeded good/defect/restored C-EV-03; trust/prose/Human gates C-EV-04; public offline CLI/demo C-EV-05. This finite minimum suite is not exhaustive coverage of arbitrary programs or filesystems.
