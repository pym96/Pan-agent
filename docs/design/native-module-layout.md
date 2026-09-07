# Native Module layout | WorkOrder #41

Status: Builder candidate, pending independent Regulator review. [Activation](https://github.com/pym96/Pan-agent/issues/41#issuecomment-5568906007) freezes Criteria-Version `1.0` (C-LAY-01…05), based on accepted #35 SHA `97fb7db1574a240b1a689733bc1b56791879c6d6`. The frozen issue body SHA-256 is `69081958d425e981f9396f55ae7106082a18de9599e6e579077cbbaa15bb88e2`. Implementation facts remain in the protected [fact register](../evidence/verified-project-facts.md).

## Locations and dependency direction

The [complete machine-readable map](workorder-41-relocations.json) maps all 17 baseline Product source files to exactly one destination, including unchanged root CLI/index locations. The [source index](../../typescript/src/README.md) links every concrete Module. Filenames, declarations, literals, callback order and implementations are preserved. No old-path wrapper, extra abstraction or second implementation is retained.

| Group | Existing responsibility | Permitted implementation dependencies |
|---|---|---|
| `protocol/` | Canonical protocol, AgentTool and ModelAdapter contracts | Own group; Node built-ins |
| `runtime/` | GeneralAgentSession, AgentKernel, NativeKernel | Protocol, memory, own group |
| `providers/deepseek/`, `providers/faux/` | Concrete model implementations | Protocol, own Provider group |
| `tools/` | Trusted-local read/write/edit/bash | Protocol, own group |
| `memory/` | Archive, ledger, Runbook | Protocol, runtime, own group; no group cycle allowed |
| `tui/` | Existing terminal interface and observation/replay rendering | Runtime, protocol, memory, own group |
| Root `cli.ts` | Concrete composition and existing source CLI | All implementation groups |
| Root `index.ts` | Existing public export facade | Existing public entries across groups |

All Node imports must name actual built-ins. All other dependencies resolve to an inventoried Product source file. No Pi/reference/Python, external package or new group cycle is allowed. The concrete current group edges are computed by the checker, not inferred solely from directories. Runtime has no concrete Provider/Tool or UI import; TUI consumes the existing Session and archive contracts without owning another loop.

## Fidelity and wiring

[`check_module_layout.mjs`](../../scripts/check_module_layout.mjs) reads the exact accepted Git blob for every Product source, Product test helper/test and Reference source/test. TypeScript's pinned compiler parser identifies import declarations, re-exports, import types, import-equals dependencies and literal dynamic imports/require calls. Nonliteral dependency expressions fail closed. Each relative specifier must point to an existing baseline Module and to that Module's mapped candidate destination. Compiler module resolution and filesystem realpaths independently check the candidate graph.

The checker reconstructs candidate text by changing only the enumerated module-specifier character spans and compares every remaining byte exactly, including comments and whitespace. It does not erase strings, literals or executable expressions with a broad regex. The source map records all 125 changed import spans with original offsets, old/new values and owning file. All 17 source implementations have zero non-import exceptions. Root `cli.ts` stays at the same depth, so the existing `../RUNBOOK.md` asset locator remains exact in both source and compiled JavaScript.

Sixteen explicitly recorded test-locator substitutions point source-reading assertions at the same relocated implementations or update the active assignment heading. They do not remove or modify logical assertions. Three affected design documents receive only exact mapped link-target substitutions, also recorded. The Reference exception changes only relative imports/re-exports and source-read locators; Reference package/dependencies, fixture/test logic and status stay unchanged.

The only manifest edit retargets `pan-agent/faux` to `dist/providers/faux/faux-model-adapter.{js,d.ts}`. Root `pan-agent` and `pan-agent/cli`, all named exports, executable wrapper, CLI options, Node floor, pinned lock, `private: true`, source invocation and recursive compiler recipe are unchanged. New source README indexes are outside the package's generated-runtime whitelist. Generated file paths and tarball hashes change as expected; archived #35 artifacts are never overwritten.

The full scope mode protects every baseline file outside its explicit allowance, including Python/tests, shared fixtures, Runbook bytes, old Evidence, Wiki, fact registers, dependencies, the frozen #35 consumer fixture/driver/guards, and historical #34/#35 scope checkers. Those historical checkers remain runnable at their own accepted SHAs; this WorkOrder adds a current-slice proof instead of rewriting their criteria.

## Checks and reproduction

Prepare the existing pinned build dependencies using empty task npm user/global configuration and public packages only. No new dependency is added. Before each verification round, read the host Human feedback queue.

```bash
npm --prefix typescript ci --ignore-scripts
node scripts/check_module_layout.mjs
npm --prefix typescript run check
npm --prefix typescript run conformance
npm --prefix references/pi run check
npm --prefix references/pi run conformance
bash scripts/check_typescript_without_python.sh
```

`--check fidelity`, `--check graph`, and `--check scope` select individual checks. `--root /absolute/path/to/test-copy` permits negative copies outside the checkout; baseline blobs still come from the checker's owning Git repository. The Product test suite uses `--product-only` with fidelity/graph checks so it does not require a Reference checkout; the default full gate always checks all Reference clients and refuses that flag in scope/all mode. The new [focused tests](../../typescript/test/module-layout.test.ts) verify the real layout, then separately inject runtime→DeepSeek static/type/import-type/re-export/literal dynamic edges, remove a required relocation entry, and mutate the executable `maxModelTurns` default. Each corresponding check must exit nonzero with the intended diagnostic. No control alters candidate code or contributes to nominal zero-effect accounting.

With a clean committed candidate and official temporary Node `22.19.0` toolchain, run the **unchanged** #35 verifier into a new directory:

```bash
python3 scripts/verify_packed_consumer.py \
  --node /absolute/path/to/node-v22.19.0-platform/bin/node \
  --output /absolute/path/to/new-wo41-consumer-evidence
```

The [existing packed consumer procedure](packed-product-consumer.md) builds twice, retains the exact new tarball and normalized manifest, installs it offline production-only, runs the actual installed bin and frozen four-exchange write/bash/read/final task, checks actual Context and memory/replay, and repeats all caught-import/read/network and missing-Runbook controls. It already handles recursive output and root CLI/Runbook placement; **no verifier, driver, guard or fixture edit is needed**. Retained-file replay uses its existing `--tarball`/`--manifest` options into another fresh consumer. Source-only tests do not replace this proof.

The [public package check](../../scripts/check_public_package.mjs) installs the baseline and candidate tarballs into separate fresh probe consumers, imports all three public entry points and compares named-export/value-type inventories. It compiles the same [typed client](../../scripts/fixtures/module-layout-public-types.ts) against both installed declaration graphs:

```bash
/absolute/path/to/node-v22.19.0-platform/bin/node scripts/check_public_package.mjs \
  --npm /absolute/path/to/node-v22.19.0-platform/lib/node_modules/npm/bin/npm-cli.js \
  --baseline-tarball /absolute/path/to/retained-wo35/pan-agent-0.1.0.tgz \
  --candidate-tarball /absolute/path/to/new-wo41-consumer-evidence/pack-1/pan-agent-0.1.0.tgz \
  --output /absolute/path/to/new-public-api-evidence
```

The compiler and Node type libraries remain external build-time tooling; neither is installed in the probe consumers. This API/type comparison is separate from the instrumented real-runtime isolation proof. Both original tarballs are rehashed after use and remain untouched.

## Criterion evidence and host boundary

| Criterion | Primary artifacts |
|---|---|
| C-LAY-01 | Exact 17-source map, parsed import spans, before/after hashes, source byte reconstruction, typed clients and equivalent installed exports |
| C-LAY-02 | Complete compiler-resolved graph including types/re-exports/dynamic imports, group-cycle checks and independent forbidden-edge/mapping controls |
| C-LAY-03 | New source/build/tarball/manifest identities; unchanged verifier's offline installed task, Context, archive/Runbook/replay and all #35 negative controls |
| C-LAY-04 | Exact protected-file hashes, recorded Reference/test substitutions, 69 Product + 34 Reference baseline obligations, rejected default mutation and zero real external meters |
| C-LAY-05 | Product full typecheck/tests (69 baseline + 4 new), conformance 18; Reference full typecheck/tests 34/conformance 13; without-Python; historical Python 259; scope/links/whitespace; host fixture |

Original host validation retains its actual root PDF whitelist failure. The only full-host fixture exclusions are the preauthorized copied extra root PDF and project `.agents/`, `.claude/`, `skills-lock.json`. The disposable complete host copy preserves original validator/config/required-file/reference identities and historical raw Evidence, then checks the exact #41 candidate against the accepted #35 main anchor in candidate mode. The Handoff retains exclusion/hash manifests and raw outputs; original resumes, host tools, validator/pins and shared main remain untouched. Host SOURCE_OF_TRUTH already routes #41 from Master's activation; Builder updates only the affected project indexes.

Real Provider calls, credential reads, balance queries, paid/formal runs and cost remain zero. There is no TUI wording/presentation change, new behavior, public release/default/live/security claim, or #42/#43/#39 implementation. Builder publishes a full SHA-bound Handoff and stops; a separate Regulator reconstructs correspondence, adds probes and independently repeats the installed task before issuing a Verdict.
