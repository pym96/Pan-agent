# #79 fixed public five-task campaign — candidate results

Working Agent (Builder), Criteria1.0. Independent Verdict and new-result attribution review pending; this report does not declare accepted or promote a project/resume fact.

[Contract](https://github.com/pym96/Pan-agent/issues/79#issuecomment-5788203099) · [formal activation](https://github.com/pym96/Pan-agent/issues/79#issuecomment-5788226734) · [machine-readable five-row report](terminal-bench-baseline-79-summary.json).

## Identity and single execution

Actual runner and result base: `08f6db5d2f8ce977acd2bc1b2180e634a0630102`; clean detached runner `/private/tmp/wo79-runner`. Result branch `workorder/79-candidate` changes reports only. Human authorization `H-LIVE79-20260923-001`, run ID `fc6f81d3-78c8-4e46-8dfd-b4123c787efa`, valid UTC 2026-09-23T03:00:34.278Z through 2026-09-24T03:00:34.278Z.

Activation SHA256 `5d7c3c8be195f12d2bf90efa5c2396ac3c6ccb8f7c21b179a1278319e4c5a1e9`; public key SHA256 `1b9ef153f96b4577ad1b81feb6a8a3f85933c2d4d75fc32fbba884fb44528fab`. Package SHA256 `e7da84c88b4eadb1395914720b85514d54cfdb52a93a2b87bd3c8b0baf8c7ecb`; manifest SHA256 `74433498d6a551c86ccc6e5faad2f9d8d3c099e5b872170e54edf23769fe6503`. Model: existing Kimi Code membership, k3-256k/high, frozen coding endpoint. Per-task 40 requests / 80 executed tools, campaign 200 requests; max_tokens4096, 120-second dispatch and 30-second tool limits; original official agent/verifier/resource limits retained.

Preflight checked controller KIMI_API_KEY presence only, valid signature/window, clean source SHA, 80 installed files, fixed Python / 363 Harbor files, 46 official task source files and five pinned linux/amd64 cached images. New ledger and output were absent before launch. No key value was printed, Keychain/file credential search, balance/probe request, repeated environment preflight or image pull occurred. Controller retained actual HOME; broker children use the accepted environment allowlist.

Exactly one authorized CLI invocation, exit code 0. No controller/provider automatic retry, campaign restart, task replacement, budget reset or code/prompt/score repair. Model-generated repeated commands inside an attempt remain in the raw trace; these are not hidden as “no repetition.” Official verifier ran only for the two normally completed attempts. CLI exit 0 alone is not task success.

## All five results, denominator 5

| Task | Result classification | Original reward | Requests | Executed tools | Reported input / output tokens |
|---|---|---|---:|---:|---:|
| overfull-hbox | agent_timeout; unscored | null | 31 | 31 | 330730 / 11745 |
| dna-insert | tool timeout; unscored | null | 5 | 7 | 20601 / 907 |
| nginx-request-logging | valid official success | 1 | 9 | 8 | 14483 / 1721 |
| merge-diff-arc-agi-task | tool timeout; unscored | null | 5 | 9 | 6702 / 1056 |
| break-filter-js-from-html | valid official success | 1 | 6 | 5 | 17970 / 3031 |

**Confirmed successes: 2 of 5. Valid official scores: 2 of 5. Three attempts stopped unscored.** Environment-start errors 0, evaluation errors 0, not-started 0. The three missing rewards stay null; they are not valid zero scores and no five-reward average is calculated. All tasks reached ready, but this is not equivalent to solving them.

For nginx-request-logging, original reward.txt is 1, verifier exits are [0,0], and official pytest reports **8 passed in 2.61s**. For break-filter-js-from-html, reward.txt is 1, exits are [0,0], and official pytest reports **1 passed in 11.28s**. These are test execution durations from logs, not total task or scoring-installation duration. Both official scripts installed dependencies before testing; logs support valid scores rather than an installation-failure zero. The inherited original visible-test exception for break-filter remains as frozen in the manifest; no extra solution/hidden-test injection occurred.

Totals: **56 request reservations, 60 executed tool reservations, 390486 reported input + 18460 output = 408946 tokens**. All 56 dispatches have reported usage; unknown-usage dispatches 0. There were 60 tool proposals/results, 10 error results and **0 invalid-argument rejections**. Normal nonzero shell commands are included in tool-error counts; not every tool error is a task failure. No CNY estimate, remaining-quota inference or token-cost comparison is made.

The machine summary and original rewards are unchanged. Additional diagnosis annotates tool-stage dependency failures without relabelling them as official model-task failures. No scoring script or official task was rerun after a stop.

## Representative issue records (AGENTS rule 17)

### 1. More requests do not guarantee completion within the official deadline

Goal/constraint: let the fixed Pan/model solve overfull-hbox under 40 requests and the unchanged 750-second agent deadline. The accepted runner can exceed 20 turns; that justified executing the new authorized campaign, not assuming success. The actual run used 31 requests and stopped at agent_timeout before formal verification.

Evidence: `overfull-hbox/pan/report.json` shows background Python/Perl script attempts, multiple sleep/pgrep/status checks, and later revised bounded scripts. Commands 12–19 repeatedly checked/waited for progress; tool 20 returned no matching process, after which the model investigated and revised its approach. The final tools returned normally, but there was no completed model turn and no official verifier result. Their exit codes cannot establish task correctness. Some stdout/exit combinations also reflect shell pipelines rather than the success of every command in a pipeline.

Verified cause of termination is the official total deadline; repeated monitoring is observed, but the exact time attributable to each model/tool action and any hypothetical successful earlier solution are unknown because the frozen ledger lacks per-dispatch timing. Builder observed without intervening, extending time or converting final tool output to a score. A later separately authorized experiment could test bounded progress checkpoints and a finishing reserve within the same total deadline; no benefit is measured here.

### 2. Ready environments can still lack tools and fail during package acquisition

Goal/constraint: solve dna-insert and merge-diff with original official images; do not preinstall dependencies or modify host network settings. #76/#78 readiness proved environment creation/command capability, not that every tool selected by the model was installed. Missing dependencies remained a known risk at launch.

Evidence: dna-insert effect 4 reports `python3: command not found`; effect 6 reports `Unable to locate package primer3`, although a trailing pipe yields exit 0. Effect 7 runs apt-get update and hits the 30-second tool boundary. Merge-diff effects 1–2 report git missing; effect 4 includes package-index HTTP 502 and repository-signature errors, again hidden by a successful tail process in the aggregate exit code. Effect 9 repeats apt-get update and terminates at the tool boundary. Both terminal reasons are timeout; the containers are stopped, rewards null, and official scoring never starts. A tool result may show completed/137 because the subprocess returned after the timeout-triggered container stop; the explicit attempt stop reason remains controlling.

Verified observations are missing commands, package-source errors and timeout stops. The underlying cause of the 502/proxy/upstream failure is unknown; no host networking probe or repair was attempted. These outcomes are not evidence that the model failed the official task tests. The choice was to retain the constrained result rather than expand the 30-second deadline or install outside the authorized model workflow. Future work could separately test actionable dependency/error feedback and correct handling of pipeline failures, using offline fixtures first; changing official environments or budgets would require its own contract.

Human supplied direction, budget and permission; Master froze contracts/identities and signed the activation; earlier Agents implemented the accepted harness; the model generated the task commands; this Builder checked admission, ran the single campaign, preserved evidence and prepared the report. These records do not attribute Agent-authored implementation or model work to the Human as independently performed work.

## Lifecycle, resources and comparison limits

All five task containers were independently inspected after completion: Running=false/Pid=0, images match configuration. All five newly created networks have removal receipts and are absent; old custom-network inventory is unchanged. No old container/image/network was deleted. The old #77 ledger SHA256 remains `61087c150935b7d19eba403e129e5ebf45c2a95d68c9359e660675b459a725f2`. Current ledger is `/Users/panyiming/.local/state/pan-agent/wo75/ledger/fc6f81d3-78c8-4e46-8dfd-b4123c787efa.jsonl`; the inherited wo75 directory is intentional. Five unique attempt reservations are retained.

315 resource samples span UTC **2026-09-23T03:37:41.054Z–04:03:25.002Z**, 1543.948 seconds. Minimum sampled free bytes 84676087808; maximum accounted growth 1344802816 bytes under the frozen owned-bytes + positive Docker.raw growth formula. No 24 GiB growth / 60 GiB free guard hit. This is sampled operational accounting, not a sub-sample peak guarantee. Container start/stop timestamps are also retained; per-dispatch exact durations are unavailable. The observed campaign interval is entirely inside the authorization window.

#77 remains separately archived at tag `archive/wo77-accepted-8661c9f07c20`: all five were unscored. It is not a zero-success-rate baseline. This campaign uses changed lifecycle handling, timeout feedback and doubled request/tool ceilings on the same public diagnostic tasks. No equal-budget comparison, single-change causal improvement, unseen holdout or full-leaderboard claim follows from the two successes. No new project/resume fact or disclosure approval is created.

## Evidence and review

External root `/Volumes/WD_BLACK/pan-agent/wo79-baseline-20260923/`; raw archive contains unchanged five-row machine summary, official reward/test logs, public Pan archives and tool reports, ledger, resource samples, container/stop/network receipts and offline recomputation/classification evidence. Public activation/authority/previous-authority backup and contract are separately retained; no private key is included. Git contains only this report, the compact summary and appended navigation, not raw task content/tool output.

Structured JSON/JSONL scanning found no serialized credential/private-reasoning keys; the scan did not read the real key. This structural check does not prove absence of arbitrary unknown secret strings. Accepted isolation and retained child environment-name/configuration evidence support the specified credential boundary.

C-LIVE79-01 admission/identity/single-run accounting, C-LIVE79-02 full five-row raw-score/classification evidence, and C-LIVE79-03 terminal/resource/scoped-delivery evidence are supplied for independent review. Regulator must use the exact remote Handoff SHA and recompute offline; no model, task-environment or formal-verifier rerun is authorized. After technical review, Human/different-family review applies only to these new result classifications. The original host whitelist BLOCK and historical failures remain; exact-SHA isolated path/package checks are recorded in Handoff. main is unchanged and freezes through Verdict.

Raw archive SHA256 `53d9e649582d3b3a695f7774de461cc99341818f425f8577efd8234cf05d582c`; evidence-index.json SHA256 `46684a3f399703e4fbaa2183972fc29fd7e839c604425fbdbaa7fe88a887ee7f`. `Handoff.md` binds the full pushed candidate SHA; `host-checks/` retains subsequent exact-SHA validation receipts.
