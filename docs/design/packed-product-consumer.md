# Compiled Product and offline consumer | WorkOrder #35

Status: Builder candidate, pending independent Regulator review. [Activation](https://github.com/pym96/Pan-agent/issues/35#issuecomment-5567129723) freezes Criteria-Version `1.0`, C-PFREE-E101…E107, on accepted base `13d659a7292748f7f01dd592aa417848917d9065`. This document specifies the packaging proof; implementation facts remain in the protected [fact register](../evidence/verified-project-facts.md).

## Build and interface

The existing locked TypeScript `5.9.3` compiler emits JavaScript and declarations from Product `src/`. [`tsconfig.build.json`](../../typescript/tsconfig.build.json) enables `rewriteRelativeImportExtensions`: emitted runtime imports target `.js`. [`build.mjs`](../../typescript/scripts/build.mjs) clears only its own generated `dist/`, then invokes that compiler. There is no hand-written Runtime translation. All existing source files, the Runbook, accepted fixtures, #34 coverage map and the complete Pi Reference remain byte-identical to the base.

The new [`src/index.ts`](../../typescript/src/index.ts) facade exposes existing public interfaces. [`bin/pan-agent.mjs`](../../typescript/bin/pan-agent.mjs) delegates directly to compiled `runCli`; package exports `pan-agent`, `pan-agent/cli` and `pan-agent/faux` resolve within `dist/`. The old CLI asset locator still finds `../RUNBOOK.md` from `dist/cli.js`, so no runtime behavior or path fallback changes. The manifest includes only generated JS/declarations, the executable, README, Runbook and npm's package metadata. It stays private with no runtime dependencies or lifecycle install repair.

The build choice follows the [TypeScript compiler option](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html), [Node's restriction on stripping TypeScript in dependencies](https://nodejs.org/api/typescript.html#type-stripping-in-dependencies), and [npm files/bin/exports semantics](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/). These references explain the packaging choice; local tests establish candidate behavior.

## Reproduction

Use a clean checkout of the Handoff SHA. Install the existing development lock with empty task npm user/global configurations before consumer isolation. Obtain Node `22.19.0` for the host platform from the official Node distribution into a new temporary directory; verify its archive against the official `SHASUMS256.txt`. Do not upgrade global Node. The verifier uses that Node and its bundled npm explicitly, and records their actual versions and OS/architecture.

From the repository root:

```bash
npm --prefix typescript ci --ignore-scripts
python3 scripts/check_workorder_35_scope.py
python3 scripts/verify_packed_consumer.py \
  --node /absolute/path/to/node-v22.19.0-platform/bin/node \
  --output /absolute/path/to/new-evidence-directory
```

`--output` must not exist. Formal verification rejects dirty source. `--allow-dirty-development` exists only for local iteration and labels its evidence ineligible for a formal source identity. The verifier runs normal `npm pack` twice, triggering clean compiler output each time. `runtime-files.json` compares every regular-file path, exact permission mode and SHA-256; no content normalization is used. Raw tar owner/time/mode headers and the gzip header are retained separately. `artifact-identity.json` binds source SHA, actual retained tarball SHA, normalized manifest SHA and compiler/toolchain identities; `source-build-map.json` links every input source file to emitted JS and declarations. Static compiler parsing checks runtime imports remain within the shipped JavaScript or Node built-ins.

The retained exact tarball can also be reinstalled without rebuilding it:

```bash
python3 scripts/verify_packed_consumer.py \
  --node /absolute/path/to/node-v22.19.0-platform/bin/node \
  --output /absolute/path/to/new-independent-consumer \
  --tarball /absolute/path/to/retained/pan-agent-0.1.0.tgz \
  --manifest /absolute/path/to/retained/runtime-files.json
```

For independent review, first verify the tarball hash against the Handoff and independently rebuild its manifest from that same source SHA. The retained-artifact mode then repeats installation, executable, task and negative controls against the supplied archive. Its `source_sha` identifies the verifier checkout; the Handoff supplies the original build binding. Python and the compiler are orchestration/build tools outside the consumer; no Product process loads or invokes them.

## Installed task and measured closure

The consumer is a newly created directory outside the repository, with no `.git`, ancestor `node_modules`, inherited `NODE_PATH`, private npm configuration or credentials. npm uses empty task config/cache and an explicit consumer prefix; it installs the exact tarball with `--omit=dev --offline --ignore-scripts --no-audit --no-fund`. The temporary official npm toolchain is permitted only for installation and `npm ls`. Runtime allows only the installed package and copied verification inputs. The graph contains one installed package, `pan-agent`; each installed file's mode/hash and each executable/export realpath are checked. No repository link, post-install copy, package patch or missing dependency repair is permitted.

The actual installed executable runs help, omitted/native/pi/unknown selector cases. Native startup uses real TUI setup and a rejected trusted-local confirmation. The full task is separately driven through the same installed `runCli` plus existing `createNativeAdapter`/`startTui` seams. The external [plain JS driver](../../scripts/wo35-consumer-driver.mjs) imports only shipped Product exports and Node built-ins. It feeds real `runTui` streams and uses Pan Faux to return the exact [synthetic fixture](../../scripts/fixtures/packed-create-run-verify-v1.json): write `hello.js`, execute `node hello.js`, read its exact bytes, then return `verified PAN_PACK_OK`. Expected counts are four model exchanges and three admitted tools. The driver never writes or executes the answer itself.

At each subsequent exchange the driver examines the real model-visible Context for ordered, adjacent correlated calls/results, exact source and actual child stdout. It verifies actual archived tool arguments/results, exit code, four settled model turns, one completed terminal, sealed manifest and packaged Runbook revision. `:replay` must add zero exchanges/effects and preserve all sealed JSON/JSONL bytes. Raw output, four Context snapshots, records, file hashes and the manifest remain in the consumer evidence.

The [guard](../../scripts/wo35-consumer-guard.mjs) records module resolution, file access, child execution and network attempts. Prohibited attempts increment a counter before throwing, and force a nonzero process exit even if caught. Three separate controls attempt a Pi dynamic import, a checkout-file read and a fetch intercepted before connection. A separate installed copy with its Runbook removed must fail before creating memory/run state, with no checkout fallback; the nominal installed files are rehashed afterward. These finite probes validate the verification instrumentation and accepted behavior; they do not establish a new OS security boundary.

All nominal real Provider calls, Provider credential reads, balance queries, paid/formal runs and cost must be zero. The consumer starts with an empty credential environment; attempted credential reads and network transport use fail the guard. The only task child is the real trusted-local `node hello.js`, whose exact synthetic source is checked. Toolchain and public build-dependency downloads before isolation are disclosed separately. Results on Node 22.19.0 Darwin arm64 establish only that tested environment, with host-Node regression results recorded separately.

## Criterion and evidence map

| Criterion | Evidence and oracle |
|---|---|
| E101 | Two clean builds; source-build map, complete tar members, modes and byte hashes; deterministic manifest; exact retained tarball identity |
| E102 | Offline install log/exit, empty configs/cache, consumer lock, physical production graph, realpaths and installed-file equality |
| E103 | Actual `.bin/pan-agent` subprocess diagnostics/exits and real native TUI decline; no run or Provider effects |
| E104 | Actual four Contexts, write/bash/read results, child exit/stdout, final text, one sealed terminal/Runbook identity, unchanged replay |
| E105 | Nominal static/runtime/file/network graphs and zero attempts, three separately failing caught controls, missing-Runbook copy |
| E106 | Exact protected hashes and bounded changed paths from scope check; observed zero external meters; no core source changes |
| E107 | Product 67 baseline plus packaging tests/typecheck/conformance 18; Reference 34/typecheck/conformance 13; without-Python; historical Python; scope/links/whitespace and candidate-mode host fixture |

[`check_workorder_35_scope.py`](../../scripts/check_workorder_35_scope.py) protects all baseline files except explicitly enumerated packaging/documentation paths. The only baseline test edit updates its current-assignment heading locator; every original assertion and test title remains. The new packaging suite checks stale build elimination, exact repeat output, package completeness and frozen fixture expectations. The stronger installed integration proof is performed by the consumer verifier, with raw command logs/exits/hashes in `commands.json` and separate per-process guard reports.

Before each verification round, read the host feedback queue. The original host's known root resume PDF whitelist failure is retained as an actual failure. Full outer validation uses only the preauthorized disposable host copy: preserve original validators/config/required docs/reference identities, exclude only the extra root PDF and copied project `.agents/`, `.claude/`, `skills-lock.json`, checkout the exact candidate, then run candidate mode against the accepted #34 anchor. Historical raw Evidence remains in that copy so all 259 Python cases execute without skipped prerequisites. Do not move originals or change validators/pins. The host navigation truth is already updated by Master; Builder changes only project indexes and reports candidate integration for subsequent landing.

A separate Regulator checks the exact remote SHA, distrusts Builder summaries, independently rebuilds/reinstalls and supplies additional probes before issuing its own Verdict. This WorkOrder neither publishes npm nor authorizes a live call, default cutover, new fact/resume claim or downstream implementation.
