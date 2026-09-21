# #71 benchmark environment controls

Criteria **1.1**, base `2291fc7856cb5c752afbf804d2920f1bd900eeee`. Builder candidate tooling only. No model/provider/account calls. The two exposed controls (`pydicom__pydicom-901`, `data-sa-001`) are excluded from the future 30-task sample and untouched holdout.

## Files and authority

- `acquire_sources.py`, `acquire_swe.py`: bounded pinned public source acquisition, separate from this repository.
- `resources.py`: original-baseline disk samples, per-step timeout, acquisition/control ledger. Never reset a resumed role's ledger. Sampling is not a hard quota.
- `runtime-wheels.lock.json`, `build_runtime.py`: exact architecture-specific wheels and offline bounded runtime-image construction. Upstream wheels/source/licenses are external artifacts, not vendored here.
- `task_runtime.py`, `server_bootstrap.py`, `http_relay.py`: original SWE-ReX RemoteRuntime/ASGI app, outer token gate, fixed HTTP byte relay, isolated task and validated exports.
- `installed_trace.mjs`, `run_installed.py`: same public installed Pan Session/native kernel and deterministic FauxModelAdapter in both environments; ordinary, nonzero, output-cap, timeout and cancellation fixtures.
- `evaluator_facade.py`, `cleanup_cli.py`, `run_swe_evaluator.py`: Criteria1.1 restricted official SWE scoring deployment, including the upstream subprocess-cleanup path.
- `run_da_evaluator.py`, `projection.py`: original DA-Code evaluator and separately labelled faithful Pan-to-dabench projection. Projection/replay has no execution authority.
- `isolation_controls.py`, `facade_collision_control.py`: actual finite boundary probes, including a never-started controlled foreign-owner fixture.
- `test_facade.py`, `test_projection.py`: offline driver negatives.
- `run_controls.py`, `verify_inputs.py`: serial ledger-bound controls, verifying frozen driver/source/input and installed upstream bytes before execution.

## Exact inputs and local reproduction

Read [design](../../docs/design/benchmark-env-tracer.md), [evidence](../../docs/evidence/benchmark-env-71.md) and the current #71 contract first. Independent Regulator uses a clean checkout of the Handoff's remote SHA and a **new Regulator evidence directory/ledger**. Builder continuation reuses its existing ledger. Never use #70 activation.

Original Builder staging: `/private/tmp/wo71-work`; evidence: `/Volumes/WD_BLACK/pan-agent/wo71-benchmark-env-20260921/`. The source/wheel archive and manifests retain pinned sources, original licenses, source Git blobs and dependency wheel SHA256s. They include evaluator-only gold; **never mount this directory or archive in a task**. Selective task staging consists only of the four declared DA inputs or the public fixed SWE base repository.

Public pins: SWE-ReX `5c995c365dfb1fd5bc56fda688be5d8538f9931f`; SWE-bench `7a21e05772954cc81471ae19d56f436cecf43c54`; DA-Code `b211daf51fdc9b52d5087c9df28ac50191bcabed`; Lite dev revision `b0dde1093fe417d83b7184254edf8199c1f0dff5`. Full URLs/blob identities are in `source-manifest.json` and `swe-source-manifest.json`. Preserve MIT license notices from SWE-ReX/SWE-bench and DA-Code's original license. No metric/options/test-selection changes.

On the authorized host use only `desktop-linux`, endpoint `unix:///Users/panyiming/.docker/run/docker.sock`. `Resources.run(...)` receives an explicit minimal environment (`HOME` = owned staging, `DOCKER_CONFIG` = owned metadata for that same existing context, no inherited credentials). Before each acquisition/build it records Docker inventory/free space/allocated Docker.raw and staging size. Use 1200s acquisition/build timeout, 1800s individual control timeout, 7200s cumulative ceiling, 24GiB planned increment and 60GiB free floor. Serial containers: 2CPU/4GiB/512PIDs. Retain failed receipts; a used step label refuses overwrite.

For a fresh source acquisition invoke `acquire_sources.py EVIDENCE WORK` and `acquire_swe.py EVIDENCE WORK` **through Resources.run** with conservative staged estimates, not directly without resource accounting. Python3.12 controller dependencies are recorded in the pip report/freeze in the resolved manifest; inference extras are not installed. The source wheel for SWE-ReX is built from the pinned source, not substituted with a PyPI package of the same version. Runtime wheels target CPython3.11/manylinux2014 or manylinux_2_28, x86_64/aarch64; verify every `runtime-wheels.lock.json` hash before offline installation. The original build receipts record exact base/runtime image IDs and all supplied wheels.

Prefer reuse of the verified retained runtime images for independent fresh-container controls. A rebuild uses `build_runtime.py --work WORK --evidence EVIDENCE --arch ARCH --base BASE_ID` under the resource wrapper. Docker commit IDs include creation metadata and may differ on rebuild: do not claim image-ID equivalence from matching tags. Freeze/compare the new build's complete base/wheel/config provenance and resolve differences before controls. Never pull/build implicitly from the evaluator.

Before controls create a new machine-readable manifest derived from the retained resolved manifest, binding the clean candidate helper file hashes, pinned sources, dependency/image identities, installed package, staging/input paths, command options and two available loopback listener ports. Do not edit an old manifest. Verify the installed package/runtime identities from the contract; source imports are not an installed proof. Node is22.19.0. Task images have `network=none`; host loopback proxy traffic is carried by a fixed Docker exec HTTP relay. It never runs a model-selected host command.

Run from the clean candidate with the prepared controller Python:

```sh
python -m unittest discover -s scripts/benchmark-env -p 'test_*.py' -v
python scripts/benchmark-env/run_controls.py --manifest MANIFEST --work WORK --evidence EVIDENCE --label UNIQUE_LABEL
```

The controls create fresh task/evaluator containers serially, preserve raw reports and stop on failure. A label is never reused. Freeze the manifest before invocation; `run_controls.py` checks listed driver bytes. Controller invocation itself must have a minimal environment. Keep original raw failures, pre-control manifests and individual resource receipts alongside the final results. Fixture trace archives are internal APFS during execution; retain them as tar on the external exFAT volume, excluding `._` metadata sidecars from JSON discovery.

Required project/host regressions are specified in Criteria1.1 and reported in Handoff. Human H-BENV-BOUNDARY/H-BENV-ORACLE await the independent Regulator and must cover this facade/relay. These controls are not a Pan benchmark score, project fact or resume claim.
