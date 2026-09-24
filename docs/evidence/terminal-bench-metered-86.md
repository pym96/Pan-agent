# WO86 metered fixed-five live results

Criteria1.0 Builder evidence; independent Verdict and H-LIVE86-RESULT pending.
[Contract](https://github.com/pym96/Pan-agent/issues/86#issuecomment-5805915954) /
[activation](https://github.com/pym96/Pan-agent/issues/86#issuecomment-5805916335).
[Machine summary](terminal-bench-metered-86-summary.json).

Accepted base and actual runner: `5326bcc2b1bd45fc89c1b152fdb98a5dba0028ee`.
Report branch `workorder/86-candidate`; full report SHA is bound by the Handoff.
Run `439d0fa4-0a8e-4c56-87b4-8cddc9647bc1`, Human authority
`H-LIVE86-20260924-001`. Exactly one controller launch and one attempt per task.
No restart, manual solving, implementation/scoring edit or extra model probe.

## Complete result

**Official successes 2/5; valid official scores 3/5; unscored 2/5; unstarted 0/5.**
A null is not a measured zero. The denominator remains five.

| Task | Reward | Classification | Send entries | Tools | Unknown usage exchanges |
|---|---:|---|---:|---:|---:|
| overfull-hbox | null | unscored | 4 | 3 | 1 |
| dna-insert | 0 | official_scored_failure | 15 | 16 | 0 |
| nginx-request-logging | 1 | official_success | 13 | 12 | 0 |
| merge-diff-arc-agi-task | 1 | official_success | 25 | 29 | 0 |
| break-filter-js-from-html | null | unscored | 2 | 1 | 1 |

DNA's original CTRF has 0/1 passed; Nginx 8/8; merge 5/5. Each scored task's
verifier exit pair is `[0,0]`; original reward files, stdout and CTRF hashes match
these classifications. The two unscored tasks have no verifier reward file.
No previous score is substituted.

## Diagnosis and metering

Overfull stopped at exchange 4: HTTP200 observed, stream `response_size`,
525319 observed bytes versus the frozen 524288-byte response limit. Break stopped
at exchange 2 with the same stage/reason, HTTP200 and 527533 observed bytes.
Both had dispatch reservation and local Fetch-entry evidence; both keep usage
unknown. They are post-send local response-limit refusals, not pre-send oversized
requests and not a proven network/authentication/quota failure. Neither was
retried unchanged. The retained evidence does not establish which response
content or SSE framing caused the size, nor a Provider token-limit violation.
These observations cannot establish the causes of #84's generic errors.

59 model rounds, 59 exchange attempts, 59 reservations and **59 local send entries**;
61 tool reservations/executions, **0 scheduled retries**. Ledger, Session events
and per-task report counters were cross-checked. Local send entry does not prove
Provider receipt or billable completion. 57 exchanges reported input **351976** /
output **18182** tokens; 2 exchanges remain unknown, not zero. No invented cost or
membership balance estimate. No recoverable transient failure occurred, so this
run supplies no live evidence of retry effectiveness. No task crossed the old
40-per-task/200-campaign/80-tool limits; #85's crossing proof remains offline.

Signed metered mode has null count ceilings and run-bound validity, with no
administrative total timer. Official Agent/verifier deadlines and accepted
per-request120s/max_tokens4096/request131072/response524288 limits remained.
No task hit the Agent deadline, and no time-end scoring claim is made.

## Identity, duration and terminal evidence

Activation SHA256 `d9b6602e92db8615750a0b685bf911ce440c112df7569fa98cd3dff2d79556e1`;
package identity `ff1be95187d83b90b2485255541b7f66fde54f5a6fcf2d86fa4db1eef5c525c8`.
The designated wo85 consumer-final's 80 installed files match the frozen lock;
363 Harbor files, Python, 46 task files and five cached image IDs were checked.
Task solution files were only included in the frozen byte-identity inventory,
not inspected for solving. Signature/public-key/runner bindings were checked
without consuming the run; new ledger and campaign output were absent.
Only credential nonemptiness was reported; no value, Keychain search, account
balance query or credential probe occurred. Actual executable Node v26.7.0 and
its binary hash are retained, not mislabeled as the prior Node22 offline test.

Controller elapsed **1688.5245506669744 seconds**, exit0, ended
`2026-09-24T02:13:43.543271+00:00`. Identity checks were timed at
0.2579384170239791 seconds; initial contract/navigation reading
was not timed and remains unknown rather than included as zero. Per-task phase
intervals and all resource samples are retained in the machine evidence.

344 resource samples: minimum free **82046140416 bytes**, maximum accounted growth
**781193216 bytes**, within60GiB/24GiB. Frozen per-task allocations were 1–2CPU,
2–4GiB, all at or below the contract ceiling and equal to the task configuration.
No privileged/host-network/extra-capability/device mode; broker-mounted verifier
logs and configuration records retained. All five environments have stopped/PID0/
noOOM evidence and a fresh final read-only Docker inspection. Each owned empty
network was released by the frozen lifecycle. No global prune or old cleanup.
Four pre-existing ledgers and the previous-authority backup were rehashed unchanged.

## Evidence and checks

Raw files and failed post-processing evidence stay under
`/Volumes/WD_BLACK/pan-agent/wo86-metered-20260924/`; working originals are
`/private/tmp/wo86-live/`. Handoff binds the archive/index hashes. Key files:
`preflight.json`, `signature-check.json`, `controller.json`, `completion.json`,
`consumption-ledger.jsonl`, `computed-summary.json`, `verifier-audit.json`,
`final-container-inspection.json`, `runtime-identity.json`, `supervision.jsonl`,
and all campaign reports/archives/reward/stdout/CTRF/configuration/stop/network files.
No extra runtime regression or control trial was run; unchanged #85 implementation
acceptance is reused by exact identity.

One post-run analysis check initially required every task to have exactly2CPU/4GiB.
The frozen configurations showed smaller allocations for four tasks. The original
analysis script/failure receipt are retained; the check was corrected to the
ceiling and additionally compared exactly with each task's frozen allocation.
This changed only offline reporting, not the runner, task inputs or campaign.
One progress message guessed a pending request from unchanged counts; subsequent
archive inspection established that DNA was in scoring. That stage inference was
corrected, and monitoring then used explicit Agent terminal events.

## Limits and responsibility

#84 also had2/5 successes but only2/5 valid scores. This round's3/5 valid scores
are a descriptive observation on the same development tasks, not a controlled
causal improvement, holdout result, leaderboard/general accuracy or best-of score.
No fact-register/resume/Wiki promotion is authorized. Historical host-directory
BLOCK and #85 exceptions remain historical; they do not grant new scope.
The old #47 current-assignment map is not this WorkOrder's authority.

Representative case: Human wanted results and attributable consumption; Master
froze/activated the accepted runner; Builder checked identities and supervised
one launch; the model supplied task actions and the unchanged official verifier
scored. The useful new observation is two precise response-limit failures with
send-entry and unknown-usage evidence. Recovery and uncapped-count performance
were not exercised here. Further size-limit diagnosis or changes need a later
WorkOrder, not an in-run adjustment.

Independent Regulator must inspect the exact remote report SHA and originals,
recompute counts/results and add offline negatives without model/task/verifier
reruns. After technical review, Human confirms the five-row classification and
limits once via H-LIVE86-RESULT. Builder does not self-accept and stops at Handoff.
