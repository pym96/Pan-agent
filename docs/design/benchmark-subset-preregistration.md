# #72 public baseline preregistration — blocked proposal

Criteria1.0. This is preparation only; `execution_authorized=false`, campaign ID/runtime SHA/activation unset. The official fixed sample is **not finalized**. [Generated proposal](../../scripts/benchmark-subset/generated/proposal.json), [complete population ledger](../../scripts/benchmark-subset/generated/pool.json), [counterexample](../../scripts/benchmark-subset/generated/membership-counterexample.json).

## Population, exact rule and blockers

Pinned SWE-bench Lite revision `b0dde1093fe417d83b7184254edf8199c1f0dff5`, **test** parquet SHA256 `438e281d80587aa7be470896ce410557002fde02d2ceee3e099331d308f62dd3`; official file inventory and LFS identity retained. Pinned DA-Code `b211daf51fdc9b52d5087c9df28ac50191bcabed`, official task/eval all.jsonl and untruncated recursive Git tree. [Input lock](../../scripts/benchmark-subset/input-lock.json) binds every raw byte source; upstream remains authoritative.

Every source task has one eligibility decision. SWE requires unique ID, nonempty problem/repo/base/version and valid official scoring test-name metadata. DA requires unique task/eval mapping, nonempty instruction, task source/gold tree entries and statically present referenced gold files. Missing requirements exclude; dynamically unresolved requirements stay unresolved, never silently dropped for cost or expected difficulty. Instruction filename extraction is explicitly a conservative static aid: ambiguous generated/input references stay unresolved. README/dataset-license/dependency/image validation remains future work for every task; no directory or image tag is treated as runnable evidence.

| Domain | Source IDs | Known eligible | Excluded | Unresolved |
| --- | ---: | ---: | ---: | ---: |
| da | 500 | 36 | 448 | 16 |
| swe | 300 | 299 | 1 | 0 |

Historical exposure is six SWE IDs (the five react-mvp development cases plus `sympy__sympy-20590`) and DA `data-sa-001`. The tracked audit found no additional ID beyond those seven; protocol corpus references the same five-case inventory. The SWE test pool contains the sympy control, so that one row is excluded. Absence from tracked records is not proof of pretraining cleanliness.

**Exposure incident:** the official DA eval metadata embeds expected answers in `result.number`. Builder parsed 71 such entries and a structural diagnostic printed five answer-bearing entries (`di-text-001`, `di-text-002`, `di-text-003`, `di-text-004`, `data-sa-061`) to its context. No reserve gold file was downloaded/opened. This breached the intended no-answer-inspection boundary and is retained explicitly, not erased or represented as pristine preparation. All 71 machine-parsed inline-answer IDs are conservatively marked exposed; the candidate does not claim this interpretation is already accepted. Master/Regulator must adjudicate the incident and the resulting population change before any final sample. Original eval source is retained externally; answers and answer-substitute hashes are not copied into candidate projections.

441 DA rows lack a source or gold task directory at the pinned revision. One additional plot task (`plot-line-015`) has an official required image missing from its gold inventory. These structural omissions are not substitutes for the unresolved cases below. Reasons overlap with exposure: counts must be recomputed by task, not added across reasons.

Frozen sampling: seed `pan-public-baseline-v1`; stratum SWE=official repo, DA=official evaluator function. With total N and stratum n, floor(15*n/N), remaining slots by descending (15*n) mod N, ties by ascending UTF-8 stratum. Within stratum use SHA256(seed + NUL + domain + NUL + ID), then UTF-8 ID to break a hash tie. Output order is UTF-8 domain, UTF-8 stratum, rank. No tuning after outcomes. This is a proportionally stratified convenience subset of the available declared pool, not a representative full-benchmark claim.

## Category inventory and selection sensitivity

| Domain / stratum | Full source | Known eligible | Unresolved | Diagnostic allocated |
| --- | ---: | ---: | ---: | ---: |
| da / compare_competition_ml | 20 | 7 | 0 | 3 |
| da / compare_csv | 243 | 11 | 6 | 5 |
| da / compare_image | 78 | 0 | 9 | 0 |
| da / compare_ml | 80 | 18 | 1 | 7 |
| da / compare_sqlite | 8 | 0 | 0 | 0 |
| da / compare_text | 71 | 0 | 0 | 0 |
| swe / astropy/astropy | 6 | 6 | 0 | 1 |
| swe / django/django | 114 | 114 | 0 | 6 |
| swe / matplotlib/matplotlib | 23 | 23 | 0 | 1 |
| swe / mwaskom/seaborn | 4 | 4 | 0 | 0 |
| swe / pallets/flask | 3 | 3 | 0 | 0 |
| swe / psf/requests | 6 | 6 | 0 | 0 |
| swe / pydata/xarray | 5 | 5 | 0 | 0 |
| swe / pylint-dev/pylint | 6 | 6 | 0 | 0 |
| swe / pytest-dev/pytest | 17 | 17 | 0 | 1 |
| swe / scikit-learn/scikit-learn | 23 | 23 | 0 | 1 |
| swe / sphinx-doc/sphinx | 16 | 16 | 0 | 1 |
| swe / sympy/sympy | 77 | 76 | 0 | 4 |

**Both lists below are sensitivity diagnostics, not approved tasks or a choice of competing campaigns.** The formal selected list is empty. Including unresolved DA rows changes allocation and IDs; therefore freezing the known-only list would silently restrict categories. [Feasibility matrix](../../scripts/benchmark-subset/generated/feasibility.json) covers the union with exact metric options, artifact filenames, source/gold inventories, published Git sizes and unresolved dependencies.

| Domain | Stratum | Known-eligible-only diagnostic IDs |
| --- | --- | --- |
| da | compare_competition_ml | `ml-competition-003`, `ml-competition-009`, `ml-competition-006` |
| da | compare_csv | `dm-csv-011`, `dm-csv-009`, `dm-csv-044`, `dm-csv-043`, `dm-csv-052` |
| da | compare_ml | `ml-regression-012`, `ml-regression-002`, `ml-cluster-010`, `ml-regression-015`, `ml-cluster-019`, `ml-cluster-014`, `ml-regression-004` |
| swe | astropy/astropy | `astropy__astropy-14995` |
| swe | django/django | `django__django-12453`, `django__django-12983`, `django__django-16820`, `django__django-15790`, `django__django-14017`, `django__django-11049` |
| swe | matplotlib/matplotlib | `matplotlib__matplotlib-23562` |
| swe | pytest-dev/pytest | `pytest-dev__pytest-7373` |
| swe | scikit-learn/scikit-learn | `scikit-learn__scikit-learn-25570` |
| swe | sphinx-doc/sphinx | `sphinx-doc__sphinx-8627` |
| swe | sympy/sympy | `sympy__sympy-20154`, `sympy__sympy-18057`, `sympy__sympy-13471`, `sympy__sympy-12171` |

If unresolved members are included, diagnostic removals: `dm-csv-043`, `dm-csv-052`, `ml-cluster-014`, `ml-competition-006`, `ml-regression-004`.
Diagnostic additions: `data-sa-029`, `data-sa-039`, `plot-bar-005`, `plot-bar-007`, `plot-scatter-002`.

| Unresolved DA ID | Reason |
| --- | --- |
| data-sa-026 | instruction file reference not statically classified; source inventory has no recognized data payload; external/dynamic requirements unresolved |
| data-sa-028 | instruction file reference not statically classified; source inventory has no recognized data payload; external/dynamic requirements unresolved |
| data-sa-029 | instruction file reference not statically classified; source inventory has no recognized data payload; external/dynamic requirements unresolved |
| data-sa-031 | source inventory has no recognized data payload; external/dynamic requirements unresolved |
| data-sa-039 | instruction file reference not statically classified; source inventory has no recognized data payload; external/dynamic requirements unresolved |
| data-sa-043 | source inventory has no recognized data payload; external/dynamic requirements unresolved |
| ml-multi-003 | instruction file reference not statically classified |
| plot-bar-004 | official post-processing prerequisites unresolved: plot_process |
| plot-bar-005 | official post-processing prerequisites unresolved: plot_process |
| plot-bar-006 | official post-processing prerequisites unresolved: plot_process |
| plot-bar-007 | instruction file reference not statically classified; official post-processing prerequisites unresolved: plot_process; source inventory has no recognized data payload; external/dynamic requirements unresolved |
| plot-bar-015 | official post-processing prerequisites unresolved: plot_process |
| plot-line-006 | instruction file reference not statically classified; official post-processing prerequisites unresolved: plot_process |
| plot-pie-005 | official post-processing prerequisites unresolved: plot_process |
| plot-pie-008 | official post-processing prerequisites unresolved: plot_process |
| plot-scatter-002 | official post-processing prerequisites unresolved: plot_process |

## Official scoring and separation

SWE uses unchanged official harness `7a21e05772954cc81471ae19d56f436cecf43c54`, official per-task version/log-parser/eval-type and test metadata. The required output is a patch against the exact base commit, with evaluator-only test/gold material kept outside task visibility. Report official resolved count over the fixed 15 planned slots; include resolved/unresolved/infra-error/unknown counts separately. R/15 is observed resolved yield over planned tasks, not proof that missing tasks failed. Report scorer-available denominator separately. No local replacement threshold or altered test selection is proposed.

DA uses unchanged `Evaluator.evaluate`, its exact `func`, `options`, `config` and default `conj=avg`; task-specific options (including upstream misspellings) are preserved. `get_result_file` uses basenames for gold; multi-result shape is retained. compare_csv compares official selected columns/order/score rules; compare_ml and compare_competition_ml select the official config.metric, target-column preprocessing and configured scaling `(score-lower)/(upper-lower)` clipped to [0,1] when scale=true. Image tasks require the official image plus dabench plot.json/result.npy and post-processing lineage; those prerequisites are unresolved rather than replaced with text/CSV scoring. No actual scorer was executed.

Official per-task conjunction can average/max/min/and/or its component scores. The pinned evaluate.py computes `average_score=sum(total_score)/num_results` across returned rows; missing result.json rows are skipped by upstream, and several errors/unfinished trajectories map to zero upstream. Therefore retain the raw official row/error, but separately classify transport/scorer/input failures and missing artifacts. Do not relabel an infrastructure-induced upstream zero as valid task failure. The proposed 15-slot report carries official numeric scores only where validly obtained and explicit null plus cause elsewhere. A fixed-15 DA mean is unavailable while any score is missing; the available-only official mean is accompanied by coverage k/15, not substituted for a full-denominator mean. No combined SWE+DA official success rate is invented.

Retain actual Pan commands, observed effects and termination separately from solver correctness. DA `finished` is observed execution completion only; no fabricated DA-Agent actions or success fields. Provider-reported input/output/total tokens are reported per dispatch with unknown for missing usage; aggregate known sums include coverage and cannot imply a complete sum. Monotonic wall time is measured, actual cash needs separate evidence, and token counts never imply membership quota or money.

## Proposed attempt and resource protocol

[Machine-readable ceilings](../../scripts/benchmark-subset/campaign-proposal.json) are **unapproved policy proposals**, not executable configuration or evidence of capacity. Requested model k3-256k/high must match reported identity; missing/drifting identity stops the campaign. Atomic immutable task claim and dispatch reservation precede effects. Once started or ambiguously dispatched, no retry/resume/reset/replacement is allowed. Only genuinely not-started tasks may continue after quota refresh and future authorized preflight. Thirty fixed slots always reconcile among not-started, started, completed, infra-error, aborted, unknown; execution status and scoring availability are separate fields.

Proposed per task: 30 model calls, 60 tool calls, 1800 seconds active wall, 120 seconds/model call or tool call, 1200 cumulative tool seconds, 4096 requested output tokens/call, 65536 estimated input tokens/call, 524288 serialized request bytes, 1048576 response bytes, 32768 model-visible tool-output bytes. The task wall deadline dominates sub-budgets. Scoring adds a separately proposed 1800 seconds/task. Token estimation/enforcement needs a frozen tokenizer and implementation, and max_tokens is not a proven provider-side quota ceiling.

Proposal arithmetic: 30*30=900 call reservations; 900*4096=3686400 requested output-token allowance; 900*65536=58982400 estimated input tokens; 30*1800=54000 active task seconds; task plus scoring ceiling 30*(1800+1800)=108000 seconds. Proposed future serial image/data storage increment 24GiB and host free floor60GiB inherit the conservative environment policy, without asserting all tasks fit. No image/data acquisition is authorized now. These ceilings bound an intended diagnostic campaign, do not forecast actual demand, and may need Human revision before activation. #70 is only one smoke observation, never a 30-task time/quota/cost estimate. New payments proposed zero; actual quota and allocation unknown.

## Remaining work, holdout and review

First resolve the inline-answer exposure incident and DA membership counterexample without score feedback. Then acquire permitted task metadata/license permissions and public image digests, freeze per-task dependency/data/official-scorer configurations, validate each environment while retaining failures against the frozen population, and obtain a separate runtime/package/campaign/ledger/window/resource-bound Human activation. Tags, published byte sizes, directory presence and #71 control success are not runnable proofs. This blocked proposal deliberately leaves image digests and external dataset permissions unresolved; it triggers no registry login, image pull or task execution.

Implementation gaps only: generalize #71 fixed task staging and exports; compose the existing Kimi adapter instead of synthetic responses; implement durable admission/budget/cancellation; freeze context-token policy; enforce task/gold separation and per-task controls; preserve DA projection lineage. No gap is implemented here.

[Exposure registry](../../scripts/benchmark-subset/generated/holdout-exposure.json) excludes historical/inline-answer-exposed and diagnostic-selected IDs from any future untouched validation claim. Remaining IDs are only reserves; all had metadata/instruction machine inspection, and no accepted holdout exists. A future holdout size/IDs and improvement freeze require their own preregistration. Neither #71 control contributes to the formal30.

Independent Regulator must recompute C-SEL-01–05 in a clean worktree from the full pushed SHA. H-SEL-METHOD then asks Human to accept/problem the transparent selection method, blocked status and limits, bound to the same SHA/Criteria1.0. The incident may require ScopeChallenge rather than acceptance; Builder does not predetermine that judgment. This Human review does not approve budget or real calls. Master alone integrates; no benchmark score, VPF, Wiki or resume fact is asserted.
