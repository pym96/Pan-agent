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
