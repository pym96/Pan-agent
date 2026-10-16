# Criteria1.6 — consumed attempt, incomplete evaluation

Builder evidence, not acceptance or a successful release. No new media release is proposed.

## Identity and outcome

- Executed candidate: `dad1e9c2e1326b161135ccaf6cd90c6d7ca9ae9c`.
- Binding SHA-256: `03bcd1eef59572c4995b0229e4828c9564c020bb4b72d00c910050ceea84f95c`.
- [Master activation](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6207891333), execution `b577e512-ce32-4d21-8174-a5c5c3a018fa`.
- Pan run: `2f213c0c-91c5-4c5a-a2a0-374fa2258016`; original task `db-wal-recovery`, unchanged released v0.1.0 runtime, pinned Harbor source and original image recorded in [preparation](HARBOR-PREP.md).
- **Agent timeout; unscored.** Original Verifier was not invoked. There is no reward, CTRF, official success, or official failure score.
- One consumed attempt; no rerun, model retry task, new recording task or replacement successful media. Earlier published videos/results remain unchanged.

## Timeline (UTC, 2026-10-16)

| Event | Time |
|---|---|
| Environment ready | 04:11:54.768 |
| Broker agent phase began | 04:11:54.853 |
| Last executed tool returned | 04:26:43.945 |
| External launcher watchdog fired | 04:26:54.894 |
| SSH broker process exited 255 | 04:26:54.906 |
| Archive inspected; launcher rejected nonterminal state | 04:26:59.961 |
| Server confirmed container stopped, Pid 0 | 04:27:05.479 |
| Owned environment removed | 04:27:06.092 |

The last executed tool reported writing 11 records to `recovered.json`. This is an observed tool result, not verification of their correctness. A subsequent tool request was waiting for approval when the watchdog fired. The archive says `cancelled/operator_cancelled` because the adapter injects Ctrl-C; **the Human did not cancel this run**. Final recording process exit was 1. Container exit137 was cleanup, not an observed OOM (`OOMKilled=false`). Exact-container `docker ps -a` subsequently returned no rows.

## Accounting and operational confound

15 model turns started and settled; all reported usage: input **97,934**, output **8,951**, total **106,885**, cache read 0, unknown usage turns 0. These are archive turn counts, not a claim about hidden transport sends. 15 tool requests settled: 14 approved container executions (two errors), and one `approval_invalidated` without execution. All 14 approvals were Allow once, with no blanket shell trust.

Raw PTY screen timestamps matched to recorder confirmation actions show **678.650 seconds** between visible approval requests and confirmation, including waits of 160.514 and 183.662 seconds. These waits include Builder inspection/response latency and count inside the original 900-second agent phase. The run is therefore heavily confounded by the recording/operator process; it must not be described as evidence of model-only task speed or inability. Without those waits, success is still a counterfactual and is not claimed. `capture/approval-latency.json` retains every request and interval.

## Source-grounded lifecycle gap

Pinned Harbor `f9deaca7f44ab0b91f1dd445d79629e4d97a0716`, `src/harbor/trial/single_step.py`: `_run_agent` catches `AgentTimeoutError` and `NonZeroAgentExitCodeError`, records the exception, then returns. `_run` subsequently calls `_run_verifier`; in shared mode it stops the environment afterward. Verification may be explicitly disabled; other lifecycle errors can also prevent reaching it. This is source inspection, not an executed stock Trial comparison.

Our external `scripts/harbor/demo56/launcher.mjs` instead ends/kills the SSH broker on its 900-second timer, injecting Ctrl-C into the TUI. After CLI return it requires `manifest.settled_state === 'terminal'`; a cancelled manifest raises `agent_not_settled`, so `rpc('verify')` is unreachable. Broker cleanup removes the environment. The APIs were used honestly, but **the timeout orchestration does not preserve Harbor SingleStepTrial's timeout-to-verifier path**. The executed adapter remains unchanged for inspection; no hotfix or second attempt was performed.

## Judgment and next decision (§17)

Human requested a complete scored demonstration. Builder selected an external bridge to preserve released TUI bytes and keep credentials outside the task container; the model performed recovery work. Preparation checked isolation, cancellation and cleanup but did not check the full timeout→retained environment→verifier route. That omission, plus slow operator approvals, prevented the intended delivery. Cleanup success does not repair the missing evaluation.

A separately scoped correction should distinguish ending the agent phase from ending the environment, verify retained state after confirmed agent stop, and test timeout-to-verifier offline before any new activation. An explicit container-scoped approval strategy or prompt operator handling is also needed for a fair timed demonstration. Neither change is implemented here; no second live attempt is authorized by this consumed binding.

Private original artifacts are indexed by [manifest](harbor-attempt-manifest.json): raw PTY, actions, sealed archive, exact binding/activation/receipt, server lifecycle/inspection/stop logs, source reference, and preparation evidence. No provider reasoning or private machine configuration is published in this summary. Independent Regulator must inspect those originals and determine the factual failure verdict/recovery scope. No project or résumé fact is promoted.
