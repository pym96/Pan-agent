# WO90 — live structure observations, Criteria1.0

One authorized five-task campaign completed, without restart. **0/5 success, 1/5 valid scored failure, 4/5 unscored, 0/5 unstarted.** Three raw reward files contain zero, but two reflect verifier dependency failures and are not valid task-correctness measurements. Raw values and the runner's `official_scored` labels are retained unchanged. [Full machine summary and every exchange structure snapshot](terminal-bench-structure-90-summary.json). Independent Regulator and Human H-LIVE90-RESULT remain pending.

## Identity and execution

[Contract](https://github.com/pym96/Pan-agent/issues/90#issuecomment-5808221879), [activation](https://github.com/pym96/Pan-agent/issues/90#issuecomment-5808222134). Accepted base and actual runner: `c01b78ff046e7146dfd222f5e5b64c5a0f98e205`, clean `/private/tmp/wo90-runner`. Candidate branch `workorder/90-candidate`; exact report SHA is bound by the issue Handoff, separately from execution identity.

Run `9a94d17a-8a3a-4385-9f6e-6b3b44cda0fc`; authorization `H-LIVE90-20260924-001`, version2/metered/run-bound, notBefore `2026-09-24T05:23:08.813Z`, expiresAt null. Activation SHA256 `d6f378c93d7547734aad1e19d00ce239af8186fdb20db1b16f00c2ebf5e0f06e`; signature verified against public authority (public-key hash `9d38decf2f89a7ed0ad77267c830e29ec01e91edb42b0f3778c2a510c84e1fa3`). Six old ledgers and prior authority backup remained unchanged; backup SHA256 `69197ed33175dd11346b2800ad30c2380e72df7ea21669576ef641db813ede58`.

Installed entry `/private/tmp/wo89-artifacts/consumer/node_modules/pan-agent/dist/index.js`; package SHA256 `964e0852068e45f457b0502f8f654577240a64ae6c8c752fa5c22371c736dba9`. Preflight checked all 82 installed files, Python/363 Harbor files, 46 task-file Git blob identities and five cached image identities. Task bytes were hashed without displaying solutions. Node v26.7.0 executable identity recorded. Only own control-process KIMI_API_KEY nonempty presence was checked; no credential value printed, Keychain/search/balance/probe call performed.

Exclusive `launch-once.json` preceded the sole frozen CLI launch. Campaign and new ledger were absent. The exact contract command ran with temporary/cache paths inside `/private/tmp/wo90-live/`. No implementation, task, scoring, official environment or time limit was changed; no dependency preinstallation, prewarming, #89 control-cache mount, manual solution or additional control run. No new signature was issued by Builder.

## All five outcomes

| Task | Raw reward | Valid task score | Classification | Model rounds | Send entries | Tools | Retries | Unknown usage |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| overfull-hbox | 0 | null | Verifier preparation failure | 16 | 16 | 16 | 0 | 0 |
| dna-insert | 0 | 0 | Valid scored failure | 16 | 16 | 15 | 0 | 0 |
| nginx-request-logging | null | null | Protocol rejection | 4 | 4 | 3 | 0 | 1 |
| merge-diff-arc-agi-task | 0 | null | Verifier preparation failure | 24 | 25 | 24 | 1 | 1 |
| break-filter-js-from-html | null | null | HTTP403 / global authentication stop | 3 | 3 | 2 | 0 | 1 |

Overfull raw test stdout records Ubuntu archive HTTP502, dependency resolution failures, missing `curl`, missing `/root/.local/bin/env` and unavailable `uvx`. Merge stdout records unmet dependencies and the same missing commands. Both shell scripts produced raw reward0 and exit pair `[0,0]`; neither has a CTRF test result. Those zeros are not evidence that the task solution failed its actual tests. DNA has a CTRF result of one failed test: forward/reverse primer melting temperatures must be within five degrees. No rerun or environment repair was performed.

An earlier Builder progress message classified all three zeros as valid failures based on runner labels. Reading original test stdout disproved that interpretation; this report corrects it without changing raw files. `computation.stdout` retains the initial mechanical classification; `computed-summary.json` and the candidate summary explicitly separate `runner_state`, raw reward, valid score and final classification. Independent review should make the same distinction from original logs.

Nginx exchange4 returned HTTP200, 7350 observed response bytes, then `kimi_reasoning_missing` at parser stage `tools`. Snapshot: 31 events / 29 deltas; reasoning missing29, null0, empty0, string0, invalid0; assembledReasoning=false; 27 tool fragments, one assembled and complete tool, finish=tool_calls, done1, usagePresent1, usageParsed=true. This directly describes the parser's observed missing field at rejection, not private reasoning contents, a complete retained wire, or the cause of the Provider's omission. Usage values were not retained for this rejected exchange and remain unknown despite usageParsed=true.

Merge exchange15/modelRound15 failed at `send` with `kimi_network_econnreset`, 0 observed response bytes and unknown usage. The frozen runner scheduled one 250ms wait and the next exchange recovered; tool execution continued and Agent completed. Snapshot at send has no deltas; zero missing-field counts there mean no observed deltas, not a field-presence conclusion. The eventual verifier preparation failure prevents claiming task-success benefit or general reliability from this recovery.

Break exchange3 returned HTTP403, classified `kimi_http_403_forbidden`; the frozen runner emitted global stop `authentication`, cancelled Agent work and did not score or retry. Snapshot stage=http contains no SSE observations. After completion, Human supplied a screenshot showing frequency usage100%, reset3min, weekly53%, and stated the five-hour quota was temporarily exhausted. This corroborates a temporary-limit interpretation but is not a retained HTTP error body or definitive server-cause proof. Human requested continuation from this task after reset. Human subsequently reported the allowance restored and asked to continue; latest issue comments still contain only the original activation. That intent is recorded; **the terminal run was not restarted**. Master must bind a fresh single-task contract and signed run before that continuation; no renewed overall budget request is needed.

## Structure, accounting and boundaries

All **64 actual exchange snapshots** are retained in the original ledger and candidate JSON, including successes and failures. Original per-task report diagnostic snapshots are retained too. Parser stages: 61 complete, one tools rejection, one send failure and one HTTP failure. Per-task reasoning field observation counts (missing/null/empty/string/invalid):

| Task | Missing | Null | Empty string | Nonempty string | Invalid |
|---|---:|---:|---:|---:|---:|
| overfull-hbox | 3626 | 0 | 16 | 5105 | 0 |
| dna-insert | 1139 | 0 | 16 | 1145 | 0 |
| nginx-request-logging | 146 | 0 | 0 | 85 | 0 |
| merge-diff-arc-agi-task | 701 | 0 | 24 | 628 | 0 |
| break-filter-js-from-html | 65 | 0 | 2 | 60 | 0 |

These count observed fields across deltas, not requests or tokens. Missing on individual successful deltas does not imply the assembled response lacked reasoning. Empty and nonempty counts can coexist within an exchange. No observed null/invalid field is not proof those cases never occur. Parsing can end early; counts and usageParsed are not token amounts. No private reasoning body or full sensitive request was logged by the observer.

Ledger, archive model events and reports agree: **63 model rounds, 64 exchanges/reservations/local send entries, 60 tools, 1 scheduled retry**. Local Fetch entry is not proof of Provider receipt or billing. Known usage from 61 exchanges totals input480184/output22643; three exchanges remain unknown. Per-task known input/output: 170489/9653, 123478/7158, 3336/367, 180481/5033, 2400/432.

Largest observed response by task: 518996, 166529, 24273, 112783, 14967 bytes. No individual response crossed the former 524288-byte threshold and no response_size/request_size error occurred. Cross-exchange byte totals are not single-response threshold crossings. No live cap-removal performance claim follows. #88's one success/one valid failure/three unscored versus this run is descriptive only: repeated development five, not holdout, controlled experiment or causal improvement.

Elapsed supervisor time1316.4495734579978 seconds; controller exit0 at `2026-09-24T05:51:26.120877+00:00`. Exit0 is controller completion, not task success. Identity preflight0.3058265419967938 seconds; earlier contract/navigation duration unknown. No arbitrary campaign count/time ceiling was added. Official Agent/verifier limits remain750/360,1800/1800,900/900,900/900,1200/1200 seconds; requestBytes131072, max_tokens4096 and dispatchSeconds120 remain, metered call/tool/response-byte caps null.

270 samples: minimum free80235819008 bytes, maximum accounted growth513298432 bytes, within60GiB/24GiB guards. Final read-only inspect verified all five owned containers stopped/PID0/noOOM, actual CPU/memory equal frozen per-task manifests and within2CPU/4GiB. Five networks removed by frozen cleanup; no global prune or old-resource removal. Six old ledgers unchanged; actual runner remains clean.

## Evidence and checks

Raw working root `/private/tmp/wo90-live/`. Durable `/Volumes/WD_BLACK/pan-agent/wo90-metered-20260924/builder-evidence.tar.gz`, SHA256 `78d97fd0983a54d5295746f6c7743040eda920f8dfad034621e63691b9d9751d`; index `builder-evidence-index.json`, SHA256 `2bda9eb6e7a74666f5167eec10b444113afa1319a1a9fb76ec96518642e58fcd`. **77 entries rehashed from tar**; includes original ledger/rewards/stdout/reports/events, resource/config/stop/network records, contracts/activation/public identity, scripts/preflight/controller/completion, structure summary, final audits and Human screenshot/context. Candidate checkout/cache/tmp excluded. Configured credential value scan found no matches in archived source files.

`summarize.py` and `recompute.py` reproduce mechanical counts/raw rewards; `structure-audit.py` retains every observation; `final-audit.py` checks raw reward equality and terminal resources. Mechanical runner classification is explicitly superseded by raw-log interpretation above. No model/task/scoring rerun was used for reporting. #89 accepted implementation checks are reused by exact identity, not claimed newly run.

Host feedback reread empty. Whole-package check passed feedback then BLOCKed on pre-existing root `.DS_Store` and `潘佳祥——agent简历.pdf`; subsequent stages did not run. No root cleanup/waiver. Candidate changes are only this report, summary JSON and evidence README; root SOT remains outside Builder write scope and requires Master navigation update.

## Learning and handoff

Human supplied scope/budget and later quota evidence; Master signed the fixed accepted runner; Builder operated one campaign and audited original evidence. The important correction is that a raw reward file plus process exit0 does not establish valid test execution. Reading dependency logs changed two outcome classifications. Next diagnostic work should separate verifier preparation from task correctness and route a fresh signed single-task continuation for the HTTP403 interruption, without rewriting this run or merging later scores into it.

Independent Regulator must inspect exact remote candidate SHA and raw artifacts offline, recompute and add negative probes without real reruns. After technical review, Human H-LIVE90-RESULT confirms the five rows and limits once. Builder does not accept, merge main, update VPF/resume facts, or issue another activation.
