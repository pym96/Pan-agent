# #150 repair Handoff — R150-01 and R150-02

Builder candidate only; independent CPU re-review and required Docker gates remain outstanding. No PR. Final immutable delivery SHA accompanies this document. Worktree freezes after push.

## Source and evidence identities

- Rejected delivery: `a9ffce273bb4ee7036a982ee45adcf5acba9e3b6`; [CPU Verdict](https://github.com/pym96/Pan-agent/issues/150#issuecomment-6571237857).
- [Repair authorization](https://github.com/pym96/Pan-agent/issues/150#issuecomment-6571251700); [prospective process allocation](https://github.com/pym96/Pan-agent/issues/150#issuecomment-6571359566).
- Tested runtime/source commit: `275d02d0ee0a61763a652b08af692d6f204e1741`. Final delivery adds documentation and the separately tested optional preinstalled-package fixture. No runtime changes follow this commit.
- Exact package SHA256: `5e4f3c25c0f1ed87a42e485eb2f4d91699dbdb68553ecb46ce390462c7dddd0d`.
- Evidence root: `/Users/panyiming/.local/state/pan-agent/execution150-builder/repair1`.
- Evidence manifest: `manifest.json`, SHA256 `428a4cd59d5016c04fde9e826276df6e3e12b9a37b1d7fcd3e1afb3348cbfdad`.
- Package: `exact/pan-agent-0.1.8.tgz`. The earlier repair probe package and this exact-commit package have the same SHA256, binding original-input replays to the tested implementation.

## Failures and repairs

**R150-01:** The first design treated the supervisor's confirmation Promise as an eventual answer. SIGSTOP prevents its event loop from answering; the parent consequently waited beyond the5s stopping bound. The parent now has a separate4.5s confirmation deadline. On expiry it rejects pending work, kills its own supervisor ChildProcess and returns `stop_unconfirmed`. This bounds the decision without mislabeling an unconfirmed descendant as stopped. It does not claim to resolve arbitrary OS uninterruptible waits.

**R150-02:** The local verifier timeout and cleanup existed only in the CLI process. SIGKILL removed both, leaving a detached TERM-ignoring verifier alive. A separate128MiB executor now owns the shell process group, output cap, timeout and controller-disconnect cleanup. The caller also bounds its wait for this owner. It is not a general process framework and does not extend trusted-local security claims.

The original Regulator reports and raw artifacts are unchanged. `probe-replay-map.json` records original/replay hashes; only fresh output-root and installed CLI locations were substituted. The repair probes retain the original fault timing, declared verifier2s timeout and3s observation interval.

## Verification

| Probe | Observed result |
|---|---|
| Original frozen-supervisor replay | CLI exits with `stop_unconfirmed`; stop latency4501.30075ms; workerConfirmed=false; no SIGCONT required to obtain terminal record |
| Original verifier-parent-death replay | After CLI SIGKILL, heartbeat5→5 bytes after3.01095s, original verifier no longer alive, no result fabricated |
| Targeted installed regressions | 2 passed before full run; no test-wrapper cleanup used to mask verifier parent-death behavior |
| Complete serial TypeScript suite | 262 passed,0 failed/skip,22.426s; `full.log` |
| Complete installed CPU pytest | 15 passed,25.44s; `full-installed.log` |
| Typecheck and targeted TS | Passed;28 targeted policy tests |
| Preinstalled exact-package fixture | Positive reuse1 passed; altered package.json rejected during setup before product execution (expected exit1). `preinstalled.log`, `preinstalled-negative.log` |
| Cleanup observation | `final-process-observation.json`: no observed repair CLI/worker/supervisor/verifier PIDs remain |

Actual verifier-death inventory contains6 product processes, including executor128MiB and shell child; plus test harness/watchdog remains below the prospectively authorized12 owned processes. The original4-process allocation is not retroactively reinterpreted. Tests ran serially with120s external watchdog and4GiB sampled aggregate envelope. No server, Docker, CI, GPU or model call occurred during repair.

## Revised Stage B proposal — not authorized or executed

Use a fresh root `/media/usv012/pjx/pan-execution150/builder/repair1-<DELIVERY_SHA_PREFIX>` and bind final delivery SHA in a new Master GO. The previous Stage B windows are retired. Existing stopped failed volumes/evidence remain untouched.

1. Separate setup: transfer git archive and exact package; verify SHA256; use existing Node22 and isolated pytest8.4.2 dependencies. Offline-install into `consumer/` under its own120s watchdog. Setup failure prevents any Docker test start. Expected healthy setup5–20s; prior stalls are not excluded from evidence.
2. Read-only readiness: bounded filesystem read/stat and Docker info/image/inspect. Require exact previously pinned image, >=20GiB free and no unresolved owned prior process. Readiness is an observation, not proof of future latency.
3. Set `PAN_PACKAGE` to the bound tarball and `PAN_PREINSTALLED_ROOT` to `consumer/`. The fixture compares every packaged file against the tarball and rejects mismatch; npm install is no longer inside a lifecycle test's time allowance.
4. Run each actual Docker pytest node separately, fresh evidence roots, under existing105s sandbox ownership watchdog and internal120s CLI watchdog. First `test_docker_goal_readonly_verifier_and_export` (45s product deadline; expected healthy5–20s); then `test_docker_deadline_stops_generation_retains_artifact` (6s product deadline, separate preservation; expected healthy10–40s). No threshold change. Stop on repeated environment/ownership failure.
5. Run unchanged #148 `first`, `probes`, `resources`, `export-probes`, `crash-probes`, `gap-probes`, `reader-crash`, `demo` separately with original105s watchdogs/fresh roots. `unavailable` and `unsupported` are offline/fake-Docker-path checks. Each expected below105s, not a promise under unhealthy storage. Budget about20 minutes for setup and sequential checks, with an explicit absolute stop and no new starts near that stop.

At most2 running owned containers,2CPU/2GiB original envelope, no GPU/provider/image download, no shared-daemon changes or broad cleanup. New runtime or executable probe changes require new identity binding.

Frozen probe hashes:

| File | SHA256 |
|---|---|
| tests/execution150/test_docker.py | `5ffb55a20b0831353d0089658e32206ea914c17e3365105b85cc6909574a5ddc` |
| tests/execution150/conftest.py | `90a4fcf638308cfafdf2e7e48b8478e5b6a58234dd37bdb7b56ca57177c33f1d` |
| tests/execution150/test_cli.py | `773716436678a52aa6529e99926048395a8c188d5fd4b8366ef0748293280c41` |
| tests/execution150/watchdog.py | `17210b0dbe1c69f3379b8c9e4503558cf23417c3113d11e43abf2420a1cd223f` |
| typescript/scripts/sandbox/watchdog.py | `b1010475a92fd81a26908fc767ee850ec4a9710884b8c7c20cf05e32811be569` |

All executable files are additionally bound by final git SHA; unchanged sandbox probe files retain baseline identities. CPU repair success does not establish Docker readiness or overall acceptance. See the [earlier partial Handoff](Handoff-partial-20261102.md) for preserved Docker failures and incomplete criteria. Human/Master supplied intent, criteria and authorization; Builder implemented and tested; Regulator independently found these defects and must re-evaluate the repair.
