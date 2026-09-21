# #72 Builder evidence — Criteria1.0

**Blocked proposal; pending independent Regulator and Human H-SEL-METHOD.** No finalized/executable 30-task selection or benchmark result. Base `04f0627d5641faeb613d0725f919a006234e024f`; branch `workorder/72-candidate`; final Handoff binds full pushed SHA.

Human directly assigned this session the same immutable Working Agent (Builder) role to #72 after #70 had been accepted/landed. This is the existing Builder session, not a claimed fresh session; the new direct Human assignment is retained in conversation. No old #70 activation or ledger was used. [Contract](https://github.com/pym96/Pan-agent/issues/72#issuecomment-5757039722), [design/method summary](../design/benchmark-subset-preregistration.md), [selector runbook](../../scripts/benchmark-subset/README.md).

## Inputs and output identity

Primary retained root `/Volumes/WD_BLACK/pan-agent/wo72-benchmark-subset-20260921/`; active work `/private/tmp/wo72-work`; clean candidate worktree `/private/tmp/pan-wo72-builder`.

`raw-inputs.tar.gz` SHA256 `010ff8f907e98bf923987377031a129812a7b7aa841e72c87f0b05e76cc8540b` preserves external metadata/source bytes and modes. [Input lock](../../scripts/benchmark-subset/input-lock.json) binds all 34 input files and source URLs/revisions. Do not indiscriminately print the original eval metadata or parquet gold columns. No raw tasks, gold answers, patches, tests or upstream code are committed.

SWE test parquet SHA256 `438e281d80587aa7be470896ce410557002fde02d2ceee3e099331d308f62dd3` is verified against the exact revision's public file/LFS metadata. Existing Python3.12/pyarrow read only named non-patch/non-test-patch/non-eval-script/non-hints columns. DA task/eval and evaluator source bytes are verified against the full untruncated pinned Git tree's Git blob IDs, with original feasibility hashes checked before reuse. Selected SWE scoring source files were read from the hash-verified retained #71 archive. No upstream evaluator import/execution occurred.

[Pool](../../scripts/benchmark-subset/generated/pool.json): 300 SWE rows, 500 DA rows. SWE299 metadata eligible/1 historical exclusion. DA36 known eligible/448 excluded/16 unresolved after structural, exposure and static-reference checks. Reasons may overlap; they are not additive counts. Every source row remains visible. Both diagnostic samples and their allocations are reproducible, but formal `selected=[]` because unresolved DA membership changes the result and the exposure incident below requires adjudication. [Feasibility](../../scripts/benchmark-subset/generated/feasibility.json) covers all 35 unique tasks in the union of diagnostic lists, preserving upstream metric/options and unknown environment/image/license fields. Unknowns are not runtime guarantees.

## Exposure incident and original failures

During structural exploration the official eval JSON's inline `result.number` answers were parsed. Five such entries were printed into Builder context: di-text-001, di-text-002, di-text-003, di-text-004, data-sa-061. No reserve gold payload file was downloaded/opened. This was an unintended answer-inspection breach, not pristine metadata-only handling. `receipts/inline-answer-exposure.json` records the five displayed IDs and all71 machine-parsed inline-answer-bearing IDs without reproducing answers. The candidate conservatively marks all71 exposed and blocks the proposal pending Master/Regulator methodology adjudication. It does not silently narrow compare_text or conceal the incident. Human review does not retroactively make the incident compliant; Regulator may require ScopeChallenge or reject the candidate.

The historical scan separately retains seven known public exposures with hashed source locations, including the extra sympy gold probe. Existing corpus/config pointers identify the same five-case react-mvp inventory. No unrelated private directories or credential stores were scanned. Reserve IDs have metadata/instruction machine inspection, not an accepted untouched holdout.

Other retained preparation failures: initial sandbox DNS failure before successful bounded public fetch; exploratory code assumed the older compact DA tree had list/truncated fields (KeyError), then used the existing full #71 tree; attempted nonexistent upstream test_spec.py archive path (StopIteration) prevented input-lock generation, followed by missing-lock failure. These did not execute tasks, mutate protected files, change source revisions or relax limits. `receipts/preparation-incidents.json` records them. Original generated v1/v2 summaries remain as diagnostics; static reference handling was corrected to include unquoted input filenames before the final candidate, without viewing any task score.

## Builder verification

- 26 synthetic tests pass: proportional/remainder/UTF-8 ties; hash ties; input shuffle; duplicate rejection; exposure exclusion; shortfall/unknown/external block; tampered result/activation refusal; official option preservation; missing task/eval/tree/gold references; inline-answer non-disclosure; gold-basename behavior; unquoted ambiguous inputs; post-processing ambiguity; input hash/path drift.
- Raw-input reconstruction equals every final generated output byte. Three shuffled real DA task/eval/tree orderings preserve output bytes.
- Proposed ceiling arithmetic and non-activation/one-attempt refresh rules checked mechanically. These are policy proposals, not implemented runtime enforcement or quota approval.
- Bounded fetch receipts include failure and redirect response bytes: 2,704,980 bytes total over4 request receipts, longest3.0013182163238525 seconds. No image registry access, data payload download (other than authorized SWE test parquet), model/credential/account access, Docker startup or task/scorer execution. GitHub WorkOrder control-plane reads are separate from public benchmark acquisition; no benchmark acquisition used an unbounded client.
- Initial input-package receipt bounds newly allocated work+candidate+archive well below1GiB, free space above60GiB, conservative elapsed envelope1700.9210710525513 seconds including600 seconds before worktree creation. Final host/check/evidence resource receipt extends that same envelope; it is never reset.
- Final Handoff supplies candidate-bound scope/protected-byte/whitespace/link checks and original/isolated unchanged host results. Product/Reference checks reuse accepted #71 only after zero protected-byte diff. No duplicate #71 containers, Human boundaries or UI tests.

Exact commands and reader versions are in external scripts/receipts and [runbook](../../scripts/benchmark-subset/README.md). Acquisition had a64MiB cumulative streaming cap and60s alarm per request, counts redirects and failures, never discovers credentials or downloads DA source/gold payloads. All raw receipts are external; final manifest binds them plus the full candidate SHA.

## Handoff boundary

Only the new scripts/benchmark-subset tree, new design/evidence docs and three allowed append-only navigation additions change. Host SOURCE_OF_TRUTH updates return to Master. C-SEL-01–05 require independent recomputation and incident disposition; C-SEL-06 requires candidate-bound Human H-SEL-METHOD after that review. Builder does not pass its own Criteria. No campaign/runtime activation, main push, benchmark score, VPF/Wiki/resume disclosure or final holdout is claimed.
