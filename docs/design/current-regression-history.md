# Current regression and fixed-version historical proof

WorkOrder [#167](https://github.com/pym96/Pan-agent/issues/167),
REGRESSION-SEAM1.0, starts from accepted
`ee3bd081f5523e669be22b7bb740a05cfca55f8b`. This is a verification maintenance
change, pending independent review. Product source, bin, dependencies, build
implementation, conformance fixtures and other implementations remain unchanged.

## Current verification interface

[`scripts/runtime-ci/run.py`](../../scripts/runtime-ci/run.py) remains the one
complete local/CI entry. Its implementation installs locked development tools,
typechecks, discovers every top-level `typescript/test/*.test.ts`, builds and
packs, installs into a fresh consumer, compares package bytes, runs installed
lifecycle tests, onboarding and the walkthrough. Conformance runs inside the
source suite. New current tests at that location require no runner or manifest
edit. Empty collections, nonzero exits, timeout, skipped/TODO/cancelled tests,
missing logs and artifact mismatches remain failures. `npm run check` remains
the smaller typecheck/source-only entry, not the complete installed gate.

The current path needs only its checked-out tree and ordinary HEAD metadata;
Git history, a parent worktree, the private career workspace, prebuilt `dist`,
Pi dependencies and historical external logs are not prerequisites. CI uses
an actual depth-one checkout in both Node cells. Dependencies and commands are
listed in the [current entry guide](../../scripts/runtime-ci/README.md).

## Affected baseline assertion map

The scope below is defined by assertions, not test totals. Every unlisted
baseline test file and every fixture remains byte-identical. The new manifest
integrity test is additional maintenance coverage; it is not a replacement for
the historical graph oracle.

| Baseline assertion | Current disposition | Historical proof |
|---|---|---|
| `module-layout`: C-LAY-01/02 exact relocation, complete 17-source map, fidelity and resolved graph | Entire assertion concerns the restored #41 snapshot, not current source; explicit replay. Current Product source still compiles and runs all behavioral/conformance/installed checks. | `layout41` runs original accepted test and checker at `75de6de…`, reading `97fb7db…`. |
| `module-layout`: C-LAY-02 static import, type import, re-export, import-type and literal dynamic runtime→DeepSeek rejection | All five original negative declarations stay in the historical test; no current graph policy is inferred from its result. | Same original `layout41` test, unchanged declarations and failure diagnostics. |
| `module-layout`: C-LAY-01 missing relocation map entry | Original map completeness obligation belongs to #41. | Same original negative mutation of `typescript/src/session.ts` mapping. |
| `module-layout`: C-LAY-04 executable `maxModelTurns: 64`→`65` | Original exact-relocation scope obligation belongs to #41. | Same original mutation and source-fidelity rejection. |
| `memory-lanes`: C-MEM-08 ledger is not trajectory; corrupting sealed events with a ledger line fails integrity | Retained unchanged in the same default test. | No reclassification. |
| `memory-lanes`: C-MEM-08 facts file equals `c366060…` forever | Current test captures the facts file **before** memory operations and compares after; operations must not auto-promote interpretations. The revision freeze is separate. | `facts25`: original exact assertion excerpt at accepted `3dc834e…`, with original base `c366060…`. No original negative probe existed for this excerpt. |
| `cutover`: C-CUT-01 source `npm ci`, `npm run agent`, `--kernel native`, explicit workspace/memory paths | Retained for the supported developer source route; the default-route assertion now covers the prebuilt npm install, configure and first-task commands. | `routing43` also executes the original source-only route assertion unchanged. |
| `cutover`: C-CUT-01 literal `read -s`, export and no Python install in default route | Current installed setup checks hidden `read -r -s`, export and `pan-agent configure`; source/default routes still exclude Python setup. Literal earlier wording is historical. | `routing43` retains all original regexes at accepted `eda8bd58…`. |
| `cutover`: C-CUT-06 exact “Active mission #43” heading | Current verification checks the accepted #43 foundation; its quoted original routing snapshot remains verbatim. | `routing43` checks the original then-active heading. |
| `cutover`: C-CUT-06 accepted foundations #32/#31/#28, retained #24, retired ReAct lane; all ADR-0016 semantic assertions | Retained unchanged. | Full original file also runs in `routing43`. |
| `cutover`: C-CUT-04/08 classifications, C-CUT-03/05 language-neutral conformance/specification, C-CUT-09 links | Retained unchanged. | Full original file also runs in `routing43`. |

The old `module-layout.test.ts` locator remains for preserved design links. Its
current test validates the local replay manifest's immutable revisions and
criteria snapshot hashes without resolving old Git objects. The original four
tests are read from Git at their original revision; no old checker, design,
evidence or criteria file is rewritten.

## Reuse, independence and costs

Reuse the existing verification Module rather than add another current suite
list or forwarding command. Its small interface (`--output NEW_EXTERNAL_DIR`)
already owns command execution, limits, package identities and result accounting.
Local and CI callers cross that same seam. Removing it would force those callers
to reconstruct the build/installation/evidence sequence.

Historical assertions consume a different resource: immutable old source and
its checker/criteria. The [replay entry](../../scripts/history-replay/README.md)
creates a private Git object database, HOME/TMP and retained logs, using only an
explicit local history repository and preseeded npm cache. Source code may be
reused; mutable checkouts and output are independent. This is filesystem/process
ownership, not a security sandbox. Replay pays the fetch/setup/storage cost only
when requested, and missing inputs fail with named prerequisites.

Moving files alone would keep the hidden Git dependency. Keeping full history in
every CI checkout would violate the chosen shallow-current contract. A generic
plugin registry would add an interface without another current implementation
to justify it. The selected split changes only which inputs answer the current
question versus a historical one; no speed, quality or coverage percentage is
claimed. A future current contract that explicitly consumes history would need
a new decision and disclosed prerequisite.

## Provenance and validation limits

[ADR-0016](../adr/0016-authoritative-typescript-product-path.md) records the
original TypeScript/Pi cutover. [ADR-0017](../adr/0017-product-isolation-and-frozen-pi.md)
then separates Native Product and Pi Frozen Reference. Their original text and
status are preserved. Neither makes an old relocation policy a universal rule
for later Product modules.

The replay manifest pins complete source SHAs, original tests/checker, criteria
snapshots and the facts excerpt; original commits also pin their transitive
source tree. It reproduces only the enumerated assertions, including original
negative controls where present. It does not transfer acceptance to new bytes,
recreate unavailable external logs or repeat entire old WorkOrders.

#167 evidence must include real independent depth-one clones, absence of old
objects before/after, protected-file identities, full current results, historical
results and externally injected discovery/failure probes. Counts are result
accounting, not a proof of equivalent coverage. Independent review and final-SHA
CI remain required. [Evidence navigation](../evidence/regression167/README.md).
