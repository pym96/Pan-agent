# #78 recovery candidate — blocked real ready validation

SessionRole: Working Agent (Builder). Criteria-Version: 1.0. Base `1aa30d96cd826e22907bbba06199e9d46fbef49d`; branch `workorder/78-candidate`. Independent review pending; **C-REC78-01 is not satisfied**. No accepted or performance-improvement claim.

[Contract](https://github.com/pym96/Pan-agent/issues/78#issuecomment-5779207476) · [design](../design/terminal-bench-recovery-78.md) · [unsigned proposal](../../scripts/harbor/pilot/recovery-78-proposal.json).

## Observations and cause boundary

| Task | Original #77 | Unchanged broker reproduction | Candidate diagnostic sequence |
|---|---|---|---|
| overfull-hbox | ready, then turn_limit; unscored | compose create: exhausted address pools | same cause, stage/project/exit retained |
| dna-insert | environment_start RuntimeError; unscored | compose create: exhausted address pools | same cause, stage/project/exit retained |
| nginx-request-logging | environment_start RuntimeError; unscored | compose create: exhausted address pools | same cause, stage/project/exit retained |
| merge-diff-arc-agi-task | environment_start RuntimeError; unscored | compose create: exhausted address pools | same cause, stage/project/exit retained |
| break-filter-js-from-html | environment_start RuntimeError; unscored | compose create: exhausted address pools | same cause, stage/project/exit retained |

Both sequences used the fixed five-task order, existing image IDs and exact #76 sources, real controller HOME/socket, isolated credential-free child environment and official resources. Neither reached ready; neither ran a task-solving command, model or verifier. The old reproduction command was `python3 /private/tmp/wo78-work/run.py legacy-sequence node /private/tmp/wo78-work/reproduce.mjs` (exit 1, five `broker_failed` outcomes). Its bounded captured stderr identified Compose return code 1 and `all predefined address pools have been fully subnetted`. Candidate sequence exposes `compose_create` / `docker_address_pool_exhausted` in structured parent and child evidence.

Read-only Docker inventory found 32 networks: 3 built-ins and 29 custom networks. Many are retained #74/#76/#77 projects with no active endpoints; stopping a container did not release its Compose network/address segment. #77's first container created network `wo75-8d8597238dc14e17_default`, subnet `192.168.240.0/20`, at UTC 2026-09-22 14:44:12.048. Its original retained event/configuration/stop records and current network identity are consistent with consuming the last available pool, but **historical causation remains an inference**, because the four original error messages were discarded. This report does not restore or modify #77 evidence.

Hypotheses: (1) address pool exhaustion predicts failure before container creation across images; directly reproduced. (2) task-specific Compose/source failures predict task-dependent errors; all five instead share the explicit pool error, with frozen inputs. (3) HOME/socket mismatch previously caused #76's initial failure; the corrected real-HOME arrangement was used here and the daemon reached Compose creation. A separate intentionally unavailable socket negative probe is now distinguished at daemon admission. Current host resource samples stay above the disk floor; error text is not a generic network-connectivity diagnosis.

## Candidate work and checks

- Network lifecycle release is limited to the newly allocated broker project's empty networks, after stopped-container evidence. Old networks are never selected automatically. Offline tests prove exact-ID ownership checks, refuse active/foreign networks and require pre-removal evidence. Actual successful release/next-task ready remains unverified on this full host.
- Bounded allowlisted stderr/cause projection retains stage, project, exit code and evidence path. Synthetic secret/Authorization canaries do not enter output; >64 KiB stderr sets truncation. Source, daemon, Compose and audit-stage fault tests retain failures.
- Real Python-child probes distinguish missing source and an unreachable socket. First socket assertion failed because formatted Docker info returned no Linux output yet reached Compose; candidate admission now checks output, and the revised negative probe passes. Old probe evidence is retained.
- 23 Node tests and 8 Python tests pass. Actual installed Session/Adapter with fake transport reaches 40 requests, five attempts share one 200-request ledger, and a two-tool-per-turn fixture executes exactly 80 tools. Policy rejects 41/task, 201/campaign and 81/tools before reservation; lower budgets, expiry/cancel, old identity, invalid signatures and used IDs remain rejected. Real provider fetch is blocked in Session tests.
- A first three-tool-per-turn fixture expected 80 executions but observed 78: unchanged core admits whole batches and rejects a batch crossing the limit. The fixture was corrected to two tools per turn to reach the exact 80 boundary; no core change or limit weakening. Original failing test log retained.
- Timeout=30 executes; 60/120 are rejected with `0 < timeout <= 30` in the next model-visible tool feedback. No clamping or increased command deadline.
- Real model/Provider/balance calls, real credential reads and official scoring calls are all zero. Synthetic signed fixtures are confined to offline tests; no real authority/private key was created or modified.

## SC-REC78-01: missing cleanup authority blocks full comparison

The current address pool has no slot for the first new environment. The contract allows cleanup only of this work order's recorded stopped objects, while every occupied network predates #78. No #78 container/network was successfully created. Deleting an old network, altering daemon pools, reusing another project's network or switching to host networking would exceed this scope.

A concrete minimal proposed extension is to archive and recheck the empty network `4442cf1826873c05489f810a213a0871e68ef1604280b74bdc5deff3e2b764a6` (`wo75-8d8597238dc14e17_default`), verify its #77 container remains stopped, and remove only that network; keep the container, image, old ledger and evidence. This action has **not** been authorized or executed. Alternatively the controller owner can provide another explicitly approved way to free one address pool. The candidate can then be evaluated through all five ready→harmless probe→stop→owned-network-release transitions. No extra model authorization is requested or implied.

Until that extension and the actual comparison occur, the same-condition repair result is missing. C-REC78-01 must remain NOT_EVALUABLE; adding diagnostics and passing mocked lifecycle tests does not satisfy it. C-REC78-03 also retains its independent technical plus Human/different-family boundary gate. No predicate is waived.

## Evidence and unchanged history

External root: `/Volumes/WD_BLACK/pan-agent/wo78-recovery-20260922/`. `raw-evidence.tar.gz` and `evidence-index.json` retain the command ledger, all original failed/passing diagnostics/tests, network snapshots, resource samples, exact reproduction scripts and historical-file hashes. `Handoff.md` binds the pushed full SHA; post-commit exact-SHA host validation lives in `host-checks/`. Raw task/diagnostic outputs do not enter Git.

The cumulative diagnostic command limit is 3600 seconds; the wrapper records duration/exit for each diagnostic invocation and samples before/after and every five seconds while running. Resource summary and archive hash are recorded below at delivery. The wrapper uses an allowlisted controller environment and never reads credentials. Inspection confirmed no #78 containers exist or remain active. No old network, container, image, ledger or evidence was deleted; frozen manifest/package identity/environment identity/old templates and original #77 activation/authority/ledger/archive/Verdict hashes remain unchanged.

Only permitted pilot implementation/tests, new design/evidence and appended navigation are changed. No main, core, official source/test/score, #77 result, VPF, Wiki or resume changes. Original host whitelist BLOCK and historical regression boundaries remain. Builder submits a scoped blocked candidate, not an accepted repair or new benchmark result.

Delivery snapshot: diagnostic command seconds 41.323/3600 across 14 commands; 45 samples, minimum free 87843172352 bytes, maximum accounted growth 4853760 bytes. Raw archive SHA256 `d00a4c039c6fb5724d4cea7be08fe24b723fb220d7cd86fb415eb49d954f7668`; raw index SHA256 `9a749e9052cf8c33b77a1d0231a17b9c12a0c4adeb02c22b3ec46a3d59fc06b5`. Later host-validation receipts are separate from this immutable diagnostic snapshot.
