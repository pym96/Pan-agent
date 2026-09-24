# WO95 — five-task live evaluation after #94, Criteria1.0

**2/5 valid successes, 0/5 valid scored failures, 3/5 unscored, 0/5 unstarted.** Exactly one campaign and five attempts. No restart, extra trial or cross-run score stitching. [Machine-readable summary and all 96 structure snapshots](terminal-bench-continuation-95-summary.json). Independent Regulator and subsequent Human H-LIVE95-RESULT remain pending; this is a Builder report, not acceptance.

## Execution identity

[WorkOrder #95](https://github.com/pym96/Pan-agent/issues/95), local `40-规划与路线/Pan-Terminal-Bench-95-执行合同-v1.0.md` and `Pan-Terminal-Bench-95-激活记录-20260924.md` authorize the run. Copies and GitHub body/comments are archived. Base and actual runner: `e1541f7ad74af55adf8cfbe2148933af0699d4c6`, clean `/private/tmp/wo95-runner`. Candidate `workorder/95-candidate`; Handoff separately binds the complete report commit SHA.

#94 independent accepted Verdict SHA256 `7d3ea364763b1ba3053cd61b3238c90383dd3a5b0c2d4e138e20cab826d67071` verified. Installed Product `/private/tmp/wo94-kimi/consumer/node_modules/pan-agent/dist/index.js`; package SHA256 `12a1e82bbb59c5572c3b59140c4222308d9bf4296deafa84b539c50d25fa7b61`. Verified 82 installed files, 363 Harbor files/Python, 46 task-file Git blobs and five cached image IDs before launch; installed/Harbor/Python/package identities rechecked after completion. No task solutions were displayed during identity hashing.

Run `0480c268-4c28-496a-ad8e-8e0895fb792f`; Human authorization `H-LIVE95-20260924-001`; version2/metered/run-bound, notBefore `2026-09-24T08:51:19.872Z`, expiresAt null. Activation SHA256 `4ac9e1543110e071032cc757fc6733bdbb6227efa1f5a892ef3cc17097f1e8e7`; public-key SHA256 `1d577f5e580a33570cbe1c7f214123e3b59c14136fb1f165f119fe296cd2729e`; previous authority backup SHA256 `045308815875bf2e696d2a02ae104d62c3f40a6f966135375e66302c1b4d2cfe`. Signature/window checked through frozen `authorize`; official CLI independently gates selection/identity before effects. Eight old ledger hashes match Master's activation snapshot and remain unchanged.

Own controller KIMI_API_KEY checked nonempty only; no credential search, display, Keychain/balance/probe call. New ledger and campaign absent before launch; exclusive `launch-once.json` guards one CLI invocation. Node identity, command and environment variable names retained. Temporary/cache paths under `/private/tmp/wo95-live/`. Kimi Code k3-256k/high, Chat Completions endpoint `https://api.kimi.com/coding/v1/chat/completions` unchanged.

## Five results

| Task | Raw reward | Valid score | Evidence classification | Model rounds / send entries | Tools | Unknown usage |
|---|---:|---:|---|---:|---:|---:|
| overfull-hbox | 0 | null | Agent timeout; verifier preparation failed | 18 / 20 | 20 | 2 |
| dna-insert | 1 | 1 | Success: 1/1 official tests | 27 / 27 | 26 | 0 |
| nginx-request-logging | 0 | null | Verifier preparation failed | 22 / 23 | 21 | 1 |
| merge-diff-arc-agi-task | 1 | 1 | Success: 5/5 official tests | 24 / 24 | 24 | 0 |
| break-filter-js-from-html | null | null | Incomplete: model_output_length; no verifier | 2 / 2 | 1 | 0 |

Overfull reached the official 750s Agent limit, with archive terminal `cancelled` and runner cause `agent_timeout`; this was deadline cancellation, not a Human cancellation. Handoff/quiescence proceeded to verifier. Official preparation encountered apt HTTP502, repository metadata errors and unmet dependencies, then missing curl/env/uvx. Nginx Agent completed, but verifier curl reported `SSL_ERROR_SYSCALL` at astral.sh, followed by missing env/uvx. Neither has CTRF or actual task-test execution evidence. Both original reward0 and runner `official_scored` state are retained; interpreted valid scores are null. Runner exit pair `[0,0]` does not establish scoring validity. Underlying network/proxy/server causes remain unknown; no on-site repair or rerun.

DNA and merge retain reward1, actual pytest output and CTRF 1/1 and 5/5 respectively. Dependency preparation eventually succeeded in these two environments; this does not establish dependency reliability or repair prior failures. No verifier timeout occurred this run.

Break finished as `incomplete/model_output_length` after its second HTTP200 exchange. Parser completed, finish=`length`, done=1, no tool fragments on that response, observed355502 bytes, elapsed110656.9736250001ms; retained Provider-reported usage output4099 for that exchange (recorded as reported, not clipped to the request setting). This is not a dispatch timeout, protocol rejection or missing reasoning. The reason for reported output4099 versus requested max_tokens4096 is unknown; usage accounting semantics were not investigated by extra calls. Frozen max_tokens4096 remains in force. No verifier/raw reward exists; null is not0. No limit was changed to rescue the attempt.

## Structure coverage and consumption

All96 exchange snapshots retained:93 parser complete and3 send-stage failures. **Zero accepted tool responses lacked assembled reasoning.** Successful deltas often omit the field, but every completed response observed at least one reasoning string, which may be empty; no observed null/invalid. This run therefore does **not exercise or prove** missing/null reasoning continuation. #94 offline round-trip evidence remains separate; no extra call was made to force coverage. `continuation-audit.json` correlates archive rounds/tool IDs if an absent response exists, and retains event counts even when the set is empty. There were21 empty-string reasoning tool responses (overfull6/nginx6/merge9): all21 have correlated started/settled tools and20 have a subsequent completed model exchange. The remaining overfull exchange20 ended at the official Agent deadline. These are empty-string observations, not missing/null coverage. No private reasoning body or full sensitive request is retained by the observer; field/character counts and usageParsed flags are not Token values or full wire evidence.

| Task | Missing deltas | Null | Empty | String | Invalid | Known input / output Tokens |
|---|---:|---:|---:|---:|---:|---:|
| overfull-hbox | 1340 | 0 | 18 | 956 | 0 | 172180 / 7129 |
| dna-insert | 2005 | 0 | 1 | 4822 | 0 | 367841 / 8269 |
| nginx-request-logging | 2862 | 0 | 26 | 3718 | 0 | 111152 / 7816 |
| merge-diff-arc-agi-task | 773 | 0 | 24 | 965 | 0 | 145115 / 6145 |
| break-filter-js-from-html | 13 | 0 | 1 | 1682 | 0 | 2230 / 4189 |

Ledger, archive events and original reports agree: **93 model rounds,96 exchanges,96 reservations,96 local send entries,92 tools,3 scheduled retries**. All92 tools have started/settled archive events; settlement includes errors/cancellation, not guaranteed task success. Three sends failed `kimi_network_econnreset`: overfull exchanges1 and17, nginx exchange1. Each recovered in the same model round through frozen backoff and subsequently completed a response/tool execution. No campaign or task was restarted. Send-entry is a local observation, not proof of Provider receipt or billing.

**93 known usages: input798518/output33548 Tokens;3 unknown** from those failed sends, never filled with zero. Character counts and response bytes do not supply missing usage. No pre-send request-size refusal, quota/authentication error or parse failure occurred. Maximum single response355502 bytes, below former524288-byte cap; task/campaign byte sums are different quantities and do not prove a single-response cap crossing. The repaired missing-reasoning path was not triggered, so no causal score benefit is claimed. Fixed repeated development five, not holdout, full benchmark or statistical comparison; prior #88/#90/#92 remain separate and unchanged.

## Time, environment and terminal audit

Controller elapsed2682.5405521250213s, exit0 at `2026-09-24T09:43:51.700596+00:00`; exit0 means controller completed, not all-task success. Preflight identity-check0.30638441699557006s; earlier navigation duration unknown, not zero. Phase timings in JSON derive from adjacent original monotonic markers, not reconstructed timestamps.

Official Agent/verifier limits750/360,1800/1800,900/900,900/900,1200/1200s retained. No administrative total-time/call/tool/cumulative-response-byte cap; per-request120s, max_tokens4096 and requestBytes131072 remain. No implementation/task/image/test/time-limit changes, preinstalled dependencies, prewarming or control-cache mounts.

543 resource samples: minimum free76589723648 bytes, maximum accounted growth671162368 bytes, within60GiB/24GiB guards. Read-only final Docker inspect confirms all five owned containers stopped/PID0/noOOM, manifest CPU/memory within2CPU/4GiB and frozen mount/privilege boundaries. Five owned networks removed by original cleanup; no global prune or old-resource deletion. Eight old ledgers and previous-authority backup unchanged; runner clean.

## Evidence and verification boundary

Working `/private/tmp/wo95-live/`; archive `/Volumes/WD_BLACK/pan-agent/wo95-metered-20260924/builder-final-evidence.tar.gz`, SHA256 `8dc89b1a7233c86b55585e262ba95be8cd8bf65d08dfbaa180f4e75858c39479`. Index `builder-final-evidence-index.json`, SHA256 `1e195c25f2bb9cf62f2b5d7365d266530935557b5ec985b6869efdef11287a9e`;90 entries rehashed from tar. Contains original ledger/events/reports/rewards/test logs/CTRF, all snapshots, activation/contracts, identities, launch/controller/completion, resource/config/stop/network records and audit scripts/results. Candidate checkout/cache/tmp excluded; report identity is its Git SHA. Configured secret-value scan found no match.

Read-only `summarize.py` and `recompute.py` cross-check counts/usage/rewards; `structure-audit.py` preserves snapshots; `continuation-audit.py` checks coverage; `final-audit.py` verifies raw rewards and container states; `classify.py` asserts actual success tests and preparation failures. No new model/official-task/scoring run or implementation regression was executed; unchanged #94 accepted evidence is reused by exact identity.

Host feedback reread empty. Host whole-package check passed feedback then retained pre-existing root-extra BLOCK on `.DS_Store` and `潘佳祥——agent简历.pdf`; subsequent host stages did not run. No root cleanup/waiver. Candidate only changes this report, summary and evidence README. Root SOT stays outside Builder's write scope for Master update.

## Learning record and Handoff

Human requested one full-five observation without a score target; Master fixed accepted package, identities and authorization; Builder launched once, monitored and classified primary evidence. Draft verification caught and corrected two overstatements: empty-string fields had been described as nonempty, and break reported output4099 had been assumed equal to request max_tokens4096. The failed draft and correction record are retained; no original live evidence changed. Earlier raw0 lessons prevented overfull/nginx preparation failures becoming false task failures. The new evidence limits the claim: DNA/merge passed, while break hit the still-frozen output limit and the missing-reasoning case did not arise. Generic transient errors recovered, but that does not prove scoring benefit. Upstream tasks/verifiers and provider outputs supplied the measured behavior; this is not a claim of Human-authored implementation or model capability improvement.

Next decisions should separate verifier preparation reliability, output-length handling and missing-reasoning coverage rather than infer one root cause or rerun for a better score. Any further run requires a new authorized identity/purpose. Independent Regulator must inspect exact remote Handoff SHA in another clean process/worktree, rederive classifications/counts and add offline negatives; no real reruns. After independent technical review, Human H-LIVE95-RESULT confirms five-row classification/boundaries once. Builder does not self-accept, merge main, promote VPF/resume facts or start another campaign.
