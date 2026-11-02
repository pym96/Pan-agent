# #150 R150-03 repair Handoff

Working Agent candidate, not acceptance. No PR or main update. Independent review must use the final delivery SHA accompanying this file. Runtime and executable probes are frozen at `b7f570306db501c6da5e958d9d23de6e04824854`; the final descendant adds only this Handoff/navigation.

## Binding

- [Narrow repair GO](https://github.com/pym96/Pan-agent/issues/150#issuecomment-6571525278).
- Exact package: `/Users/panyiming/.local/state/pan-agent/execution150-builder/repair2/exact/pan-agent-0.1.8.tgz`.
- Package SHA256: `8e201a7b6e3cfde08008ad8e9d9cc57efe8ce1ef83c55aa48bd17c7ec924fe2d`.
- Raw CPU evidence root: `/Users/panyiming/.local/state/pan-agent/execution150-builder/repair2`.
- `manifest.json` SHA256: `42d8416a80c0cc297fa12ae0682e56556c3930ce84f19c959304052af37ee6bf`.
- Original Regulator artifacts remain untouched. `probe-replay-map.json` and `final-replay-map.json` bind the original and copied probes; only installed CLI and fresh output paths change. Faults,2s verifier limit and3s/5s observation intervals are unchanged.

## Defect and correction

Repair1 separated verifier timeout from the CLI but put all verifier ownership in that new executor. Freezing the executor stopped its timer. The parent eventually killed that executor without owning the detached verifier group, leaving a live verifier. This was an incomplete failure model, not an environment explanation.

The existing CLI and executor now share one pre-effect ownership handoff. Executor launches a gated shell, reports its PID/group and birth identity, and waits. CLI checks and durably records that identity and acknowledgement before releasing the command. With a healthy CLI and frozen executor, the CLI directly kills the recorded group at its own declared verifier deadline, resumes only its own executor so the child can be reaped, and independently checks group inactivity. Verifier cleanup has its own `verifier.stop` event, separate from generation-worker stop confirmation. No additional supervisor layer was added.

This covers the tested single-owner freeze with a healthy peer. It does not claim survival of simultaneous owner failures, uninterruptible OS tasks, arbitrary hostile same-user process manipulation or setsid escape. The same established trusted-local/Docker boundary remains.

## Evidence

| Check | Result |
|---|---|
| Typecheck | Passed, `typecheck-final.log` |
| Complete serial TypeScript regression | 262 passed,0 failed/skip,22.225s, `full-final.log` |
| Complete installed CPU pytest | 16 passed,30.82s, `full-installed.log` |
| Original R150-01 replay | Frozen generation supervisor gives `stop_unconfirmed` in4501.9485ms, workerConfirmed=false |
| Original R150-02 replay | CLI SIGKILL: heartbeat5→5 bytes after3.0115s; verifier absent; no fabricated result |
| Original R150-03 replay | Frozen verifier executor: verifier absent after5.0128s; heartbeat stops at165 bytes; terminal needs_review, not success |
| Unrelated sentinel | Survived frozen-verifier-owner test; only registered verifier group was targeted |
| Resource/cleanup | Owned process inventory retained; <=12 controlled processes; executor128MiB heap; final PID observation contains no remaining observed owned processes |

Each fault/integration invocation was serial and externally bounded by120s. No server/Docker/CI/provider/GPU invocation occurred during this repair.

The installed R150-03 test's monotonic evidence is retained in `verifier-timing.json` and raw `owner.stdout`:

| Observation | Milliseconds on the same process monotonic clock |
|---|---:|
| Verifier owner start | 182.175541 |
| Durable ownership ACK before command release | 228.220583 |
| Declared verifier deadline | 2182.175541 |
| Parent stop request | 2184.592666 |
| SIGKILL request for owned group | 2192.313416 |
| Group inactivity confirmation | 2261.804041 |

Signal request time is not represented as the exact OS exit instant. Confirmation is a later independent observation. The observed timer lateness is retained, not removed or used to redefine the2s limit. Generation-worker shutdown subsequently reported48.420125ms in its separate event. The original R03 probe timing was not changed to obtain this result.

## Prior server matrix, bound only to be2a81e

Before this repair and before Master's STOP, candidate `be2a81ea1cf46954c4c90c8a1ac69824d39ed5a7` completed the individually bounded installed Docker goal (12.60s), deadline (9.17s), plus unchanged `first`, `probes`, `resources`, `export-probes`, `crash-probes`, `gap-probes`, `reader-crash`, `demo`, `unavailable` and `unsupported` gates, each exit0. Sequence ended07:23:45.69Z. No new tests started after STOP.

Server evidence is mirrored at `/Users/panyiming/.local/state/pan-agent/execution150-builder/server-repair1-be2a81e`; `evidence-manifest.json` SHA256 `0540906038e4cf95a2b52f076d766714ce0786d4a82f65f62fa6433210676620`. Final inventory checked19 states, no running owned processes/containers. Four intentionally rejected unsafe-export cases retain stopped containers and sole volumes; they were not pruned. All earlier failed server evidence/volumes also remain preserved.

Those passes do not cancel R150-03 or automatically transfer to this new implementation. No new server GO exists. Current-SHA Docker applicability/revalidation remains for Master and independent Regulator to decide prospectively. All acceptance and supplemental high-risk gates remain open; no project/resume fact is promoted.

Human/Master supplied scope, criteria and authorization. Regulator independently found the missing failure mode. Builder implemented this correction, retained the failed reasoning and produced these executable observations.
