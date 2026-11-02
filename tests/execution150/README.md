# EC1.1 executable verification

Python is test-only. Use an isolated venv with `pytest==8.4.2`; no Python dependency is added to the installed Pan runtime. Tests consume an actual `npm pack` archive through `PAN_PACKAGE`, install it into a fresh consumer, then invoke its real CLI. Fixture responses enter the ordinary Faux adapter and NativeKernel; scheduler and tools are not replaced by Python implementations.

```sh
# From typescript/: npm pack --pack-destination /absolute/evidence/directory
PAN_PACKAGE=/absolute/evidence/pan-agent-0.1.8.tgz python -m pytest tests/execution150/test_cli.py -q
# Stage B only, after exact resource/source GO and with existing pinned Docker image:
PAN_PACKAGE=/absolute/evidence/pan-agent-0.1.8.tgz python -m pytest tests/execution150/test_docker.py -q
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
