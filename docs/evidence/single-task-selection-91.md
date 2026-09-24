# WO91 — signed single-task execution, Criteria1.0

Builder candidate from accepted base `7951710fd40f1533108bbf8c7beba4e6fc81240f`, branch `workorder/91-candidate`. [Contract](https://github.com/pym96/Pan-agent/issues/91). Independent Regulator acceptance remains pending. This is offline execution-scope adaptation, not the requested real follow-up attempt.

## Change and trust boundary

The existing CLI always constructed the expected task list and execution loop from all five manifest entries; its report hardcoded denominator5. A one-task signature therefore could not authorize a one-task run. The new small `selection.mjs` validates `activation.binding.taskIds` as a nonempty, duplicate-free, ordered subset of the complete frozen manifest. Images must have exactly the selected keys and SHA256 image-ID syntax. The subset contains the original task objects, retaining official configuration, image reference and time limits.

Selection shape is validated before admission. `authorize` still verifies the entire activation signature and expected runner/package/full-manifest/model/budget/task/image binding. There is no unsigned CLI selection override. Changing task or image binding without signing rejects before ledger, environment, credential or model effects. A malformed image mapping rejects before those effects too. Actual image content checks remain the existing broker's responsibility; a syntactically valid image ID signed by the authority is not independently authenticated by the selection helper.

Only selected tasks enter the execution loop, image mapping and ledger; reports derive denominator/rows/taskIds from the same subset. A full five-task permit still runs all five in its signed order with the existing five-task label. Additive report fields identify the independent attempt and warn that raw reward alone does not establish valid task-test execution. Raw rewards, null usage, not-started rows and original runner state meanings are retained. This does not implement a verifier-validity classifier or rewrite #90 results.

Unchanged: Product package/model/tool code, policy/signature/ledger semantics, session/broker/cancellation/official deadlines/cleanup, manifest, package identity and resources. No real model/provider/balance/credential read, Docker startup or official scoring; all test credentials/keys/authorities/brokers/providers are synthetic and local to this workorder. Existing installed Product consumer was read-only verified against all82 lock entries, package SHA256 `964e0852068e45f457b0502f8f654577240a64ae6c8c752fa5c22371c736dba9`.

## Checks

- Actual CLI targeted suite:21 pass,0 fail. Includes historical full-five execution, signed metered single-break execution through installed Session, single-task HTTP403/no scoring, exclusive run reuse rejection, empty/unknown/duplicate/missing IDs, missing/wrong/extra image mapping, tampered selection/image signatures and unsigned CLI override rejection before effects. Single-break fixture creates one environment, one attempt, two synthetic sends and one synthetic verifier; report has one row and denominator1.
- Full pilot Node suite:148 total,140 pass,0 fail,8 existing skips (unauthorized container controls and historical skipped coverage). No container authorization was enabled. Targeted tests overlap this suite; counts are not additive independent tests.
- Report controls cover single/full not-started rows, protocol failure/null rewards, raw0 retention and independent-attempt labels. Selection control preserves signed order and original manifest objects without mutation.
- Seven actual old ledger hashes unchanged across full regression. Frozen manifest/package lock/policy/session/broker hashes match base; `identity-before.json`/`identity-after.json` retain results. Product package unchanged; no rebuild required.
- Host feedback empty. Host whole-package check remains BLOCKed by pre-existing `.DS_Store` and `潘佳祥——agent简历.pdf`; later stages did not run. No root cleanup or waiver. Root SOT is Master-owned outside this write scope.

Commands used matching consumer `/private/tmp/wo89-artifacts/consumer/node_modules/pan-agent/dist/index.js`, TMPDIR and WO75_TEST_ROOT under `/private/tmp/wo91-single-task/tmp`. Full regression explicitly removes real KIMI_API_KEY and container-control activation from test environment. No real credential value was read or printed. Raw outputs, synthetic fixture directories/authorities/ledgers/events/reports and identity checks retained. Synthetic fixture signatures cannot authorize the real controller.

Durable evidence `/Volumes/WD_BLACK/pan-agent/wo91-single-task-20260924/builder-evidence.tar.gz`, SHA256 `dc9463a65641f1d267a92a874b29f1f4d25bb7d9f17b59eaabe9d5b918273ce8`; `builder-index.json`, SHA256 `ed89b2a59bd1a7f6e8819b65f68e09badcc1d86cd4e7da8ea876ef7c9358535f`. All719 entries rehashed from archive. Working root `/private/tmp/wo91-single-task/`; candidate source identity is the full Git SHA in Handoff.

## Master signing and next execution

After independent acceptance and same-SHA integration, issue a separate real-execution contract and a fresh signed activation:

1. Bind `runnerSha` to the accepted actual runner, keep existing Product package hash, full unchanged manifest hash, model and approved budgets/validity.
2. Set `taskIds` exactly `["break-filter-js-from-html"]`; set `images` exactly to that task and its resolved approved image ID. Do not include the other four image keys. Sign the complete activation with the trusted authority matching the accepted runner.
3. Use a new run UUID, untouched ledger destination and nonexistent output directory. Invoke the existing CLI flags `--activation`, `--entry`, `--task-root`, `--output`; there is no task override flag.
4. Preserve #90's terminal run, signature, raw failures, usage and five-row report. The later single-task attempt has denominator1 and must never replace or be spliced into #90's five-task result.

Existing Human budget and single-task continuation intent remain; this implementation issues no real permit and claims no live task success. A cryptographically valid signed image value is authority input; this module does not query Docker to resolve it. The future execution contract must provide the correct identity.

## Learning record and review

The blocked #90 continuation was caused by two coupled assumptions: admission expected all manifest tasks, and reporting assumed denominator5. Changing only signature or execution iteration would leave either rejection or misleading reporting. Using the same signed subset for admission/execution/reporting removes both assumptions while preserving frozen task objects and existing gates. Human chose the one-task follow-up, Master scoped it, Builder implemented and tested the adapter; no success-rate improvement follows from offline controls.

No test failed during this implementation. One documentation append initially used the host cwd and failed with missing path before writing; it was repeated at the authorized candidate path. No runtime repair or historical evidence reset was needed.

Regulator must fetch exact remote Handoff SHA into a clean independent worktree, inspect original test artifacts, rerun relevant offline tests and add negative probes outside the candidate. Builder does not self-accept, merge main, update VPF/resume facts or begin the real follow-up campaign.
