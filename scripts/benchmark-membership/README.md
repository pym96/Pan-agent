# #73 membership investigation — ScopeChallenge pending

This is a partial investigation, not completion of #73 Criteria1.0. No final membership decisions, overlay or subset were produced. The accepted #72 pool, flags and selector remain unchanged.

- [projection.py](projection.py): allowlisted task fields, restrictive README projection and closed-vocabulary observations. This is not universal semantic redaction.
- [test_projection.py](test_projection.py): synthetic answer-canary and malformed-input checks.
- [audit.py](audit.py): offline integrity verification and exact reconstruction from retained inputs; upstream code is never executed.
- [source-provenance.json](source-provenance.json): pinned Git blobs, whole-file hashes, paths and acquisition URLs.
- [observations.json](observations.json): 16 task instructions, pinned file inventories and restricted README observations; every membership decision remains unresolved.
- [Design and ScopeChallenge](../../docs/design/benchmark-membership-resolution.md).
- [Evidence](../../docs/evidence/benchmark-membership-73.md).

Run from repository root, with the retained archive extracted into an isolated evidence directory:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/benchmark-membership -v
PYTHONDONTWRITEBYTECODE=1 python3 scripts/benchmark-membership/audit.py --inputs /path/to/evidence/inputs --output /tmp/wo73-observations.json
cmp scripts/benchmark-membership/observations.json /tmp/wo73-observations.json
```

Raw README prose stays in retained evidence, not in model-visible excerpts or the repository. Closed-vocabulary presence and filenames do not establish complete source semantics or missingness. Review needs a disposition of the concrete questions below before membership work can resume.

## Criteria1.1 continuation

Historical artifacts above remain intact. [SC-73-02](../../docs/design/benchmark-membership-resolution.md#criteria11-continuation--sc-73-02-pending) records two remaining source questions and the conservative excerpt-budget accounting gap. This is still partial work.

- [reader.py](reader.py) / [test_reader.py](test_reader.py): bounded, source-role-verified input sections; explicit Solution sections withheld.
- [excerpt_budget.py](excerpt_budget.py) / [test_excerpt_budget.py](test_excerpt_budget.py): append-only pre-display byte accounting, including AST inventories; adopted after the reported gap.
- [overlay.py](overlay.py) / [test_overlay.py](test_overlay.py): original-selector reuse, fixed base, restricted mutations and fail-closed incomplete-decision handling.
- [decisions-v11.json](decisions-v11.json): 8 excluded, 6 eligible, 2 unresolved Builder judgments; no real overlay or selection.
- [continuation-lock.json](continuation-lock.json): base/decision/selector integrity identities.
- [source-provenance-v11.json](source-provenance-v11.json): all 35 acquired metadata/code files.

`python3 scripts/benchmark-membership/overlay.py --output /tmp/wo73-result` must currently refuse because the real ledger is unresolved. Do not change unknowns to exclusions just to make it run. Synthetic test results are not actual selected tasks.

- [audit_v11.py](audit_v11.py): verify all retained source identities and frozen decision bytes offline, without source display.
