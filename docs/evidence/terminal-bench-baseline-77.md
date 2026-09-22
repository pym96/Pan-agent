# #77 fixed public five-task baseline — candidate

SessionRole: Working Agent (Builder). Criteria-Version: 1.0. Independent Verdict pending; this report does not declare accepted or promote any project/resume fact.

Contract: https://github.com/pym96/Pan-agent/issues/77#issuecomment-5778274636

Formal activation: https://github.com/pym96/Pan-agent/issues/77#issuecomment-5778327110

## Identity and execution

- Result branch: `workorder/77-candidate`, base `1aa30d96cd826e22907bbba06199e9d46fbef49d`.
- Frozen clean runner: `a74c0675d0a3eefea282a62585925617a89a7da3`, `/private/tmp/wo77-runner`.
- Human authorization: `H-LIVE77-20260922-001`; run ID `6130046a-3003-4102-b450-f47b0d4601b5`.
- Signed activation SHA256: `e40ddf9d82df942e266ed42667417e44d1461ae123e90117219ca1bf85428ce1`; window UTC 2026-09-22 14:27:45.502 through 2026-09-23 14:27:45.502.
- Package SHA256: `e7da84c88b4eadb1395914720b85514d54cfdb52a93a2b87bd3c8b0baf8c7ecb`; manifest SHA256: `74433498d6a551c86ccc6e5faad2f9d8d3c099e5b872170e54edf23769fe6503`.
- Preflight: controller key presence true, signature/window valid, 80 installed files / 363 Harbor files / fixed Python identity / 46 task files verified; five pinned linux/amd64 images cached. No credential value displayed, probe request, or repeat preflight container.
- Exactly one authorized CLI invocation. Ledger and output were absent before launch. Same run ledger remains at `/Users/panyiming/.local/state/pan-agent/wo75/ledger/6130046a-3003-4102-b450-f47b0d4601b5.jsonl`; no reset, retry, repair, or new run ID.
- Model: Kimi Code membership, k3-256k/high, frozen endpoint and budgets. Actual controller HOME retained. No recharge or balance probe.

## Complete result table

| Task | Terminal classification | Official reward | HTTP dispatch reservations | Executed tools | Reported input/output tokens |
|---|---|---|---:|---:|---|
| overfull-hbox | Agent stopped: turn_limit | unscored (null) | 20 | 7 | 93547 / 2765 |
| dna-insert | environment_start RuntimeError | unscored (null) | 0 | 0 | unavailable; no dispatch |
| nginx-request-logging | environment_start RuntimeError | unscored (null) | 0 | 0 | unavailable; no dispatch |
| merge-diff-arc-agi-task | environment_start RuntimeError | unscored (null) | 0 | 0 | unavailable; no dispatch |
| break-filter-js-from-html | environment_start RuntimeError | unscored (null) | 0 | 0 | unavailable; no dispatch |

Fixed denominator **5**: confirmed successes **0**, valid official scores **0**, infrastructure errors **4**, Agent stops **1**, evaluation errors **0**, environments not attempted **0**; model execution never started on **4** tasks. This is not an observed 0% task success rate: all five rewards are missing. No official verifier ran, no reward file exists, and no installation/network scoring failure can be inferred. CLI exit code 0 is only controller completion.

All 20 reserved dispatches produced reported usage: 93,547 input + 2,765 output = 96,312 reported tokens; no dispatch has unknown usage. There were 21 model tool proposals, 14 validation rejections, and 7 executed tool calls. Ledger tool budget counts execution reservations, not rejected proposals. Repeated model proposals inside the one attempt are retained; Builder did not restart any attempt.

## Two evidence-grounded diagnoses

1. **Tool timeout feedback did not lead to recovery.** Archive records show 13 proposals with timeout=120 and one with timeout=60 rejected as `invalid_task_command` against the unchanged <=30-second validator. Seven permitted commands exited 0, mostly reading inputs or querying pdflatex availability/version. The model exhausted 20 turns without completing. The schema only declares timeout as a number; neither tool description nor generic validation error conveys the maximum. This is a plausible interface contribution, not a measured causal improvement or a claim that pdflatex failed. A separately authorized next change could expose the same limit in schema/description and return actionable validation feedback, first tested offline with 30/60/120-second proposals. No prompt, limits, or code changed here.
2. **Startup error detail is missing.** Four per-task Harbor `failure.json` files preserve `RuntimeError`, and controller failures preserve `environment_start`; there is no configuration/container ID or Agent ledger reservation for those tasks. Frozen `broker.mjs` discards child stderr and `broker.py` stores only the exception class. Existing logs cannot establish whether Docker/Compose/network or another start operation caused these failures. **SC-LIVE77-01:** request a future scoped change to preserve sanitized startup diagnostics and test the multi-environment lifecycle offline; any fresh real execution requires a new contract. No diagnosis-by-rerun, environment repair, or source modification was performed.

## Termination and resource evidence

The one discovered campaign container is `a7630b0b9fb438ed778f2e210ab4547cbbeb98adcc15329db03abb598a98cf58`. Raw configuration matches its pinned image and official limits; stop records and post-run inspection agree `Running=false`, `Pid=0`. No campaign container remained running. A post-run Docker enumeration and 36 matching retained events support the lifecycle observation; they do not restore discarded startup error messages. Existing stopped containers from older work were untouched. No prune or container cleanup was needed.

Resource samples span UTC `2026-09-22T14:44:09.276Z`–`2026-09-22T14:46:25.933Z` (136.657 seconds), 34 samples including boundary checks. Minimum free bytes 87,923,687,424; maximum accounted growth 303,104 bytes, using the frozen formula owned allocated bytes + positive Docker.raw growth from baseline. No 24 GiB growth / 60 GiB free boundary hit. Container timestamps separately record 14:44:12.126 start and 14:46:23.755 stop. The fixed runner does not timestamp every dispatch or failed startup; those exact durations are unavailable, not fabricated. The full observed interval falls within authorization.

## Evidence and review boundary

Machine-readable report: [five-row summary](terminal-bench-baseline-77-summary.json). Machine-produced original summary is unchanged in the raw archive. Raw tool output/task inputs remain outside Git.

Evidence root: `/Volumes/WD_BLACK/pan-agent/wo77-baseline-20260922/`.

- `raw-evidence.tar.gz`: SHA256 `6ab1c04ea3389a224a5cee2afb892845adc5be22892c04f34df68da02301eec0`.
- `evidence-index.json`: SHA256 `90023494a351fdad926c15ecb0e289a076fa8d63bc34f79b259d365281c2bf8c`; individual live files include ledger, original summary, public Run Archive, report, resource samples, configuration/stops, four original typed failures, controller logs, preflight and terminal inspection/events.
- `activation.json`, `authority.json`, `contract.json`, `preflight.json`, `source-preflight.json` preserve authorization and preparation inputs. No private signing key is included.
- `Handoff.md` binds the pushed full candidate SHA; `host-checks/` contains post-commit validation and exact candidate handling.

C-LIVE77-01: signature/identity and single-run accounting supplied. C-LIVE77-02: all five outcomes and missing scores supplied; four root causes remain unknown. Independent technical review plus Human/different-family review of these new five rows remains pending. C-LIVE77-03: stopped container and scoped artifact evidence supplied; no self-acceptance. Regulator must not rerun model tasks or official verifier under this authorization.

Only the two new result files and appended evidence navigation are changed. Original host `.DS_Store` and `潘佳祥——agent简历.pdf` whitelist BLOCK, historical failed evidence, #70 ledger, and #73 state remain unchanged. Host checks use the existing exact-SHA isolated-mirror procedure; exclusions apply only to that mirror and do not waive the original BLOCK. No implementation, main, VPF, Wiki, or resume changes. No score threshold, comparative improvement, full-leaderboard claim, or disclosure approval follows from this candidate.
