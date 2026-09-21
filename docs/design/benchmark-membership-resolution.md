# #73 membership resolution: ScopeChallenge SC-73-01

Status: **partial investigation; ScopeChallenge pending**. Criteria1.0 remains incomplete. Base `3d42cc22df25a6d34cbc5bdc18edde47a1180119`; DA source `b211daf51fdc9b52d5087c9df28ac50191bcabed`.

The contract requires a concrete ScopeChallenge and stopping dependent selection when source semantics conflict or required information cannot be established. This investigation found new source discrepancies beyond #72's generic ambiguity. It does not convert unknowns into exclusions.

## Questions requiring Master disposition

1. **data-sa-039 source alignment.** The allowed task instruction asks about impact forces from Frog D and Frog E and references `sample_result.csv`. The pinned task directory contains only README.md. Its README Git blob `4e3d7f2701837f5ca9d9b075a678aba24277840b` and whole-file SHA256 `59ee801aaca38226cf5659e10fd2629fea001c2d591cd4ebdbdcdf6675f3c999` are identical to data-sa-029, whose instruction concerns bird beaks. The closed-vocabulary README observation identifies birds at line 1. This suggests misaligned task metadata; it does not prove absence of every possible upstream frog-data provider. No complete frog-data provision or generation recipe has been safely established.
2. **plot-scatter-002 task/source/scoring alignment.** The instruction asks for a stacked horizontal bar chart of average days per order stage for the ten cities with highest sales. The pinned sanitized scoring descriptor labels it `scatter`. Its source inventory contains README.md, guidance.txt, plot.yaml and five files named closing_odds/odds_series; inventory identities are recorded in observations.json. Filenames alone cannot establish their schema or absence of order data. The README projection emits no source prose, and the closed vocabulary finds no domain matches. It remains unknown whether official guidance resolves the discrepancy; neither guidance nor data payload was opened. Do not silently repair the instruction, scorer, or input population.
3. **Safe README interpretation.** All 16 strict README projections emitted no text. Closed-vocabulary labels are deliberately insufficient to certify supplied, generated, packaged or missing data. A narrower reviewed metadata source or authorized human interpretation is needed where the raw prose cannot be cleanly separated from possible answer content. This limitation was reported before showing prose; raw prose was withheld.

Requested decision: identify authoritative non-answer provision/semantic locators at the unchanged pin, or issue a revised contract/policy disposition for these inconsistencies and the safe interpretation boundary. If the fixed source cannot support the requested outcome, Master must decide that boundary explicitly. Builder has not changed pins, predicates, task contents or the requested sample size. Independent Regulator may verify these observations; they are not a membership Verdict.

## Established partial producer graph

All nine targeted plotting tasks list official `plot_process` in their allowed task metadata. Static source shows:

- `da_agent/envs/da_agent.py`, `_set_task_info` and `post_process`, takes the configured post-process names and dispatches them after task work.
- `da_agent/configs/post_process.py`, `plot_process` lines 73–127, searches task-produced image and plotting Python script, preprocesses the script and requests controller Python execution. It collects generated capture files into `dabench/plot.json` and `dabench/result.npy`.
- `da_agent/configs/scripts/image.py`, `plot_process` lines 155–198, captures generated plot properties and data into JSON/NumPy artifacts. This is a task-output producer, not evidence that these artifacts must exist among initial supplied files.

These are static source observations only. Complete dependency/export closure, runtime compatibility, integration and scorer correctness remain unverified. No upstream code was imported/executed. Runtime issues do not themselves decide membership.

## Preserved boundary

No final eligible/excluded decisions, pool overlay, 15+15 selection or feasibility matrix is claimed. All 16 observations are unresolved, and every accepted #72 artifact remains byte-identical. No model call, credential lookup, task execution, Docker access, package install, scorer execution, gold/data payload acquisition or new activation occurred. This is a concrete new ScopeChallenge, not the old blocked report offered as completion.

See [evidence](../evidence/benchmark-membership-73.md) and [reconstruction tools](../../scripts/benchmark-membership/README.md).

## Criteria1.1 continuation — SC-73-02 (pending)

The historical Criteria1.0 section above and rejected SHA remain intact. Master disposed of SC-73-01 prospectively in Criteria1.1. The new [decision ledger](../../scripts/benchmark-membership/decisions-v11.json) records eight exclusion judgments under `required_input_unprovided_in_pinned_distribution`, six structural-eligibility judgments and two unresolved rows. These are Builder judgments for independent review, not an accepted subset. No overlay has been applied to the real pool.

| IDs | Builder judgment | Basis / remaining question |
|---|---|---|
| data-sa-026/028/029/031/039/043 | excluded | Required observations are absent from the finite supplied source distribution; normal README context does not specify a dataset asset, exact provider or complete generation recipe. The ledger distinguishes output-format artifacts from requested observations. |
| ml-multi-003 | excluded | Task requires test.csv; neither that fixed split nor postings.csv described by README is supplied, and no split-generation/provision instruction is identified. |
| plot-bar-007 | excluded | Required movie-duration data and plot.yaml are absent; README only describes the dataset and exploratory ideas. |
| plot-bar-004/005/006/015, plot-pie-005/008 | eligible | Required supplied inputs have inventory/description provenance; official plot_process produces the post-task capture artifacts. Runtime execution remains unverified. |
| plot-line-006 | unresolved | Required plot.yaml is absent, but the instruction also refers to supplied tips.txt. Criteria1.1 A names README.md/guidance.txt/plot.yaml for reading. Clarify whether the explicit-reference universe in B authorizes reading the tips metadata, or obtain Human metadata-only interpretation: does it specify/provide generation of plot.yaml? Do not infer absence from an unread named input. |
| plot-scatter-002 | unresolved | Source README describes California data-science job listings; inventory filenames indicate odds-series assets. No schema conclusion is drawn from filenames. Guidance line 1 is marked Solution; its entire section is withheld. Human is asked only whether it supplies an exact order-stage/city-sales data provision locator or an upstream override, with path/URL and line numbers, never solution content. Scorer-property enforcement/override audit is incomplete; scatter metadata alone is not an exclusion. |

### Source excerpt accounting boundary

The revised reader tests ran before real use, and allowed README/guidance snippets were charged to an append-only ledger. A conservative 32,768-byte reservation covered prior source display. The accounted reservation plus subsequent guarded excerpts is 64,296 bytes. A later static AST inventory used an ad-hoc display path outside that gate. Charging an additional conservative 8,192 bytes for those inventories raises the upper bound to **72,488**, above Criteria1.1's 65,536-byte limit. This does not establish an actual answer leak; no gold/eval payload was acquired or shown. It does mean Builder cannot certify C-MEM-03's excerpt limit. The first guard refusal and later accounting gap are retained, not hidden.

Further source display is stopped. Master must dispose of this accounting gap and decide a prospective source-display allowance (98,304 total bytes was requested); original download/time/disk use is not reset. A larger future limit would not retroactively turn the earlier accounting gap into compliance. [excerpt_budget.py](../../scripts/benchmark-membership/excerpt_budget.py) provides a shared pre-display UTF-8 gate, including repeated displays and AST symbol inventories; its negative tests preserve rejected attempts without payloads. It does not retroactively guard prior tool output.

The unresolved source questions and accounting disposition are required before the complete 16-row ledger can be frozen. The new overlay imports the original #72 selector, locks the base pool, changes only membership/reason fields and refuses unresolved/missing/duplicate/extra decisions. Synthetic selection tests do not constitute a real selected subset. H-MEM-DECISIONS remains premature; no Human acceptance gate is requested now.
