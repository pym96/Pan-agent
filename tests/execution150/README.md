# EC1.1 executable verification

Python is test-only. Use an isolated venv with `pytest==8.4.2`; no Python dependency is added to the installed Pan runtime. Tests consume an actual `npm pack` archive through `PAN_PACKAGE`, install it into a fresh consumer, then invoke its real CLI. Fixture responses enter the ordinary Faux adapter and NativeKernel; scheduler and tools are not replaced by Python implementations.

```sh
# From the repository root, with the test venv active:
archive_dir=$(mktemp -d)
npm --prefix typescript ci --ignore-scripts
archive_name=$(cd typescript && npm pack --silent --pack-destination "$archive_dir")
export PAN_PACKAGE="$archive_dir/$archive_name"
python -m pytest tests/execution150/test_cli.py -q
# Stage B only, after exact resource/source GO and with existing pinned Docker image:
python -m pytest tests/execution150/test_docker.py -q
```

`conftest.py` supplies isolated state/workspace, clean package install, operation-scoped approval responses and cleanup. Parameterized cases exercise invalid durations and UNKNOWN/FAIL differences. Each actual CLI invocation has an independent 120-second watchdog; no Docker-missing skip exists. The watchdog samples owned descendant RSS against 4 GiB, while worker Node heaps are separately limited. This sampled bound is not an instantaneous OS memory limit. Run process-fault tests serially. Retain pytest base directories and stdout/stderr as evidence.

| Criterion | Required observable probes |
|---|---|
| EC01 | Existing full TS regressions; actual installed Session/NativeKernel; archive namespaces |
| EC02 | TS virtual 5m/1h ticks/overruns/early timer wake; real CLI 1s/4s smoke with no early starts and <=500ms lateness |
| EC03 | TS whole-batch/cumulative/imported counters and duplicate settlement; CLI outer cap and last-count verified success |
| EC04 | Actual TERM-ignoring shell, independent sentinel, controller death; actual Docker deadline/export |
| EC05 | Unsealed reservation after controller SIGKILL; inspect-only state reuse; sandbox intents and retained manifests |
| EC06 | Installed tarball tests, full old suite, seeded red/green, unchanged sandbox probes |
| G01 | FAIL→feedback→PASS, UNKNOWN, forged/stale evidence, readonly Docker verifier |
| G02 | Virtual active-worker reconciliation/no overlap; attempt-correlated result handling |
| G03 | Exact deadline/cancel, outer budgets across attempts, late PASS cannot revive |
| G04 | Candidate tamper, crash evidence, seeded accept-worker-claim defect |

`negative.py NEW_DIRECTORY` deliberately seeds the claim-is-success defect in the controller, runs the required TS tests, and restores exact source bytes in `finally`; red must fail and restored green must pass. `detached-negative.py NEW_DIRECTORY` demonstrates that killing only a worker leaves its detached shell writing a heartbeat, then cleans that exact shell group. Run it under `watchdog.py`. Neither probe is a product option.

Mocking belongs at transport inputs (Faux), not the termination/verifier oracle. Actual process IDs, heartbeats, container state, exported manifests and executable exit codes supply integration evidence. Finite tests do not establish universal adversarial correctness.

CPU repair regressions add `test_frozen_supervisor_returns_bounded_unknown` (SIGSTOP the supervisor; independently bounded unknown result within5s) and `test_verifier_timeout_survives_cli_death` (SIGKILL the CLI after a2s verifier starts; its independent owner stops heartbeat). The latter deliberately does not use a child-cleaning wrapper inside the test, because that would conceal the missing product cleanup. Run the whole test invocation under the external120s watchdog. Its owned process inventory is retained. The prospective repair allocation permits up to12 controlled owned processes, serial invocation and4GiB aggregate; it does not redefine the earlier allocation retroactively.

For separately bounded server setup, optionally set `PAN_PREINSTALLED_ROOT` to an existing npm consumer directory alongside `PAN_PACKAGE`. Every package file is checked against the tarball before returning its CLI; mismatch is a setup failure. The default remains fresh installation. This separates install latency from individually timed lifecycle probes without substituting source execution.

`test_frozen_verifier_owner_parent_fallback_and_sentinel` freezes the verifier executor after command start, keeps the CLI healthy, and checks that the owned verifier stops while an unrelated sentinel survives. It retains owned process inventory and requires separate `verifier.owned` / `verifier.stop` records. The original Regulator R150-03 probe is also replayed unchanged except fresh output and installed-CLI paths.

## Output path regression (#159)

The two verifier lifecycle fixtures share `verifier_heartbeat_command`, which quotes PID and heartbeat filenames as POSIX shell data. Their existing deadlines, fault injection and sentinel/termination assertions are unchanged. `test_verifier_output_paths_are_data` sends that same command through the installed CLI for nine filename classes: ASCII, Unicode, space, single quote, double quote, percent/hash, command substitution, semicolon and combined characters (including a newline and glob characters).

Each case observes the exact PID destination, live heartbeat growth, confirmed stop and no later growth. Harmless `touch` canaries in filename text must never execute; retained verifier snapshots are checked for their absence. This is fixture-path correctness, not a Runtime sandbox or arbitrary-shell safety claim. The shared entry runs all 25 installed cases and preserves their paths and raw output. [Candidate diagnosis and evidence](../../docs/evidence/output159/README.md).


## Interrupted execution inspection (#163)

`test_crash_inspect_and_refused_restart_preserve_effect_and_reservations` invokes the installed CLI directly. One approved shell appends an identifiable marker, then the test kills the controller at the next model reservation. Before teardown, it observes both recorded worker/supervisor identities gone. Inspect must report uncertainty, and retrying the same state must fail before creating work. State, memory and workspace byte hashes remain unchanged; the marker remains once and all three original admission tickets remain in the archive. This checks refused replay, not automatic continuation or general exactly-once tool effects. The shared entry retains the original 25 installed cases and adds this one.
