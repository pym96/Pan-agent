# WO89 Builder evidence — Criteria1.0

Base `6317f1b8ec6823431cfb7a7c2ae017a379e0d23b`, branch `workorder/89-candidate`. [Contract](https://github.com/pym96/Pan-agent/issues/89#issuecomment-5807836748), [protocol decision matrix and source applicability](../design/protocol-verifier-89.md), [machine summary](protocol-verifier-89-summary.json). Full candidate SHA is bound by the issue Handoff. Independent review pending; no self-acceptance or new task scores.

## Findings and implementation

The historical #88 wire was not retained, so nginx/merge's local HTTP200 `kimi_reasoning_missing` cannot be resolved into definite Provider omission versus null versus an assembly defect. No evidence proves account concurrency caused it. Kimi Code's documented HTTP400 missing-thinking-history error is a different request-side event. Official source snapshots and pinned SDK inspection support empty-vs-absent distinction but do not guarantee missing/null tool reasoning is safe on this frozen endpoint/model. **No compatibility/admission rule was relaxed**, no thinking text fabricated, and thinking remains high.

A minimized actual installed-Adapter test reproduced the observation gap: the expected reasoning rejection occurred, but zero structural records were emitted (expected1). `diagnostic-red.log` preserves this red signal. The candidate adds `kimi-structure.ts` plus an optional Provider-specific `onStructure` observer; no ModelAdapter/Runtime/tool interface changed. Actual decoding tracks fixed-shape reasoning presence/type counts, assembly state/character count, event/DONE counts, finish kind, tool fragments/assembled/complete counts, usage presence/parsed flag and parser stage. A frozen detached snapshot reaches existing evaluation exchange completion/failure records. No private reasoning, request, argument/body or unrecognized Provider string is logged. Observer errors are isolated.

This distinguishes received/decoded absence, null, empty/nonempty strings and invalid types from downstream validation. Partial streams only describe what was observed; they cannot prove the complete upstream response. Existing output/continuation remains byte-for-byte semantically preserved, including empty strings and multiple reasoning chunks. Known input/output from valid outcomes stays exact; missing/rejected/truncated usage remains unavailable under the unchanged accounting policy. A parsed usage flag on a later rejection is structural evidence, not newly retained token values; no historical unknown is backfilled. This remaining failure-usage limitation is explicit in the design.

## Criteria coverage and tests

- C-PV89-01: installed missing/null/empty/nonempty/invalid reasoning at 1-byte and4096-byte boundaries, multiple events, missing DONE/terminal, partial arguments, invalid finish, and subsequent exact private continuation. Empty/nonempty complete tool responses execute once; rejected/incomplete responses execute no tools. Existing anti-tamper continuation tests remain covered. Decision matrix retains unknown historical origins.
- C-PV89-02: actual installed Session's ledger and report include structure on failure and success; synthetic thought/secret canaries absent from diagnostic serialization. Unknown finish strings collapse to `invalid`; observer-throw test preserves exact ModelOutcome. Known usage10/5 remains exact on valid responses, unknown does not become0. Counts/byte diagnostics remain covered by #85/#87 regressions.
- C-PV89-03: original frozen task.toml/test.sh and #88 stdout hashed; one dependency-only control detailed below. No official test/Oracle/solution read or rerun, no new score, no cache/image mutation used by formal evaluation.
- C-PV89-04: new compiled package installed offline and all82 installed hashes recorded; built dist matches installed dist. Pilot recovery/response-unlimited/deadline/cancellation/authorization regressions pass, original Harbor/Python/manifest identities unchanged, dependency control stopped.

`pilot-regression.log`: **121 pass/0 fail/0 skip**, including first19 PV89 cases plus #85/#87/CLI/Session/policy/handoff/broker/recovery controls. `protocol-final.log`: **23/23**, with four later multi-event/Session-negative additions; overlaps pilot and is not additive. `provider-regression.log`: **15/15**, configure wizard explicitly excluded to avoid unrelated credential-management behavior. Typecheck/build pass. No full Product suite or real Provider regression claimed.

Reproduction from this candidate:

```sh
TMPDIR=/private/tmp/wo89-artifacts/tmp \
PAN_TEST_ENTRY=/private/tmp/wo89-artifacts/consumer/node_modules/pan-agent/dist/index.js \
node --test scripts/harbor/pilot/test_protocol_89.mjs scripts/harbor/pilot/test_85.mjs \
  scripts/harbor/pilot/test_response_stream_87.mjs scripts/harbor/pilot/test_cli.mjs
```

The archived tarball `pack/pan-agent-0.1.0.tgz` SHA256 is `964e0852068e45f457b0502f8f654577240a64ae6c8c752fa5c22371c736dba9`. Fresh consumer `/private/tmp/wo89-artifacts/consumer/node_modules/pan-agent/dist/index.js`;82 files match package-identity and current dist, including new structure module JS/declaration. Only Product package hash/installed-file map changed in the lock; prior baseline field is historical, Harbor/Python fields unchanged. Node v26.7.0; no new minimum-Node claim. TMPDIR/npm cache/logs all under `/private/tmp/wo89-artifacts`; dependencies read from prior accepted node_modules into this candidate's ignored build directory, no old cache write.

## One dependency-only control

Cold-cache control used cached original image `sha256:14636c361ced3673ad2a80291343b30916af81c26d954567e6f3d9de04df3b76`, a fresh owned container, Ubuntu24.04.3/x86_64,2CPU/4GiB, bridge network, no binds/cap additions/privilege/model credentials. Package preparation used one360-second window after startup. No official tests or pytest test command ran; the final entrypoint was Python version/package imports via `uvx --from pytest==8.4.1 -p3.13 -w pytest-json-ctrf==0.3.5`.

| Stage | Seconds | Exit | Observation |
|---|---:|---:|---|
| Identity | 1.0038171249907464 | 0 | x86_64 Ubuntu24.04.3, no initial uv cache listing |
| apt update | 53.18531895900378 | 0 | Repository metadata prepared |
| curl installation | 54.28516225001658 | 0 | curl installed in this control only |
| uv installation | 12.078159374999814 | 0 | uv0.9.5 installer HTTP200 |
| Python/packages/imports | 45.16623829200398 | 0 | CPython3.13.9, pytest8.4.1, pytest-json-ctrf0.3.5 |

Total controller lifetime171.10378758297884seconds includes startup/stop; all preparation stages fit360seconds. This is a new dependency experiment, not timing of the original verifier. Its staged shell/diagnostic verbosity/final entrypoint differ from the official script; success does not establish an official score or next-run guarantee.

Actual installer redirect: `https://releases.astral.sh/github/uv/releases/download/0.9.5/uv-installer.sh`, HTTP200. Resolved Python source: `https://github.com/astral-sh/python-build-standalone/releases/download/20251014/cpython-3.13.9%2B20251014-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz`. PyPI/files.pythonhosted.org URLs and resolved transitive versions are in verbose stderr. That log includes transient metadata request failures followed by successful package resolution/download. The probe did not expose per-download HTTP status or a definite lower-layer failure cause beyond uv's messages; these remain unknown. Only installer HTTP200 was explicitly measured.

#88's last CPython-download line still does not identify its exact stall/root cause. The new successful download falsifies a blanket claim that this source is permanently unavailable; it does not diagnose the historical event. No additional identical probe was useful or run. No cache/preinstalled solution was applied. If future work prewarms dependencies, initial image/cache state and potentially resolved unpinned transitive versions change, requiring a new versioned Master contract and explicit comparability treatment.

Resource samples: minimum free81051078656bytes, maximum observed Docker.raw growth156794880bytes. This control's sampler tracked free disk and Docker growth; it did not separately sample peak host log occupancy. Raw logs are retained for size review, and no24GiB boundary approach was observed. Final inspect confirms stopped/PID0/noOOM and exact resource/isolation config. The stopped owned container is retained for audit; no old resources or image deleted, no global prune. Six old consumption ledgers rehashed unchanged.

## Evidence, failures and next step

Raw root `/private/tmp/wo89-artifacts`; durable archive `/Volumes/WD_BLACK/pan-agent/wo89-protocol-verifier-20260924/builder-evidence.tar.gz`, SHA256 `15600d028e23bdf20158368e04c16b74649b65e191a8767f95be7d7f6ab4356c`. Index SHA256 `e54d135056570031d13803125bed40799821e8f37cf6cf450467d781c8987c22`, **1211 entries rehashed from tar**, including synthetic reports/ledgers/archives, source snapshots, final Product tar, all test/build logs, dependency stdout/stderr/commands/timing/resource/inspection. Installed package and npm cache duplication excluded. Contract test code is bound by candidate Git SHA. Sources index records URLs/hashes and immutable SDK revision; content snapshot retrieval time is not a Provider-version claim.

Retained development errors: initial diagnostics red test; a build command mistakenly applied `--prefix typescript` from inside typescript and failed, after which a provisional pack used prior build output. It was not installed/tested; corrected build→pack→install succeeded with dist/hash checks. The provisional tar was overwritten, so only its original pack/build logs remain; no claim of complete earlier tar preservation. `development-notes.json` records this. No protocol predicate was weakened to make controls pass.

Host feedback empty; whole-host acceptance passed feedback then blocked on existing `.DS_Store` and `潘佳祥——agent简历.pdf`, later stages not run. This historical host BLOCK is not represented as candidate acceptance/failure. Root truth/control/VPF/resume/Wiki/main untouched; permitted navigation updated, Master owns root SOURCE_OF_TRUTH.

Human set stabilization priority; Master defined scope; Builder added observation and conducted the new control; upstream parser/Harbor/task behavior otherwise retained. The evidence separates protocol assumptions from missing historical data and changing dependency availability. Next: independent Regulator at exact remote SHA with additional offline negatives and original evidence, then Master may bind a fresh live run under existing authorization. No additional Human trial/budget gate is introduced. Whether compatibility can be safely broadened or preparation should be cached remains a concrete future decision supported by fresh structural/runtime evidence, not a claimed fix or performance gain today.
