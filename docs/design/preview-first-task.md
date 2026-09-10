# Product-first entry and offline first task | WorkOrder #51

Status: Builder candidate, pending independent Regulator review. [Activation](https://github.com/pym96/Pan-agent/issues/51#issuecomment-5611819446) freezes Criteria-Version `1.0`, C-ENTRY-01…06, on accepted base `4cd830951663a65c24f2ab94d18083bd00a1b249`. Parent: [Preview Spec #50](https://github.com/pym96/Pan-agent/issues/50) stories 1, 3, 17, 24. This document specifies the entry proof; implementation facts remain in the protected [fact register](../evidence/verified-project-facts.md).

## What a newcomer gets

The [root README](../../README.md) now opens with what Pan lets a user do, a clear macOS early-preview boundary and the shortest-path offline try command before any research/governance catalog. The one-command path [`scripts/try_preview.sh`](../../scripts/try_preview.sh) echoes each step: locked build-dependency install (development side only), `npm pack` of the exact local artifact, install into a fresh consumer with `--omit=dev --offline --ignore-scripts --no-audit --no-fund`, then [`scripts/demo_preview.mjs`](../../scripts/demo_preview.mjs) starting the actual installed Pan TUI through the public package surface.

The demo composes the installed `runCli` with a scripted Pan Faux at the existing `createNativeAdapter` seam — the same public seam the accepted #35 packaging proof uses. It is **offline/simulated**: no real Provider, credential, network or paid action, and the UI says so at startup. The deterministic first task [`preview-first-task/v1`](../../scripts/fixtures/preview-first-task-v1.json) visibly writes `hello.js`, executes the frozen `node hello.js` child, reads the exact source back and closes with the frozen `verified PAN_PREVIEW_OK` marker. The sealed run remains inspectable with `:replay RUN_ID`, which adds no exchanges or effects.

## Verification assets

- [check-driver.mjs](../../scripts/fixtures/preview/check-driver.mjs): deterministic C-ENTRY-02 client. Four exchanges, three admitted tools in order `write` → `bash` → `read`, model-visible Context adjacency, archived arguments/results, one completed sealed terminal, packaged Runbook revision. The final marker and produced `hello.js` bytes are checked against an **independent expected result** derived by the verifier into `verification/expected-result.json`, outside the model-visible workspace. The driver never writes or executes the answer itself.
- [replay-driver.mjs](../../scripts/fixtures/preview/replay-driver.mjs): C-ENTRY-03 fresh installed process. `:replay RUN_ID` renders the retained final result with zero model exchanges, zero tool effects (trap tools installed), zero task-workspace reads and byte-identical sealed archive and workspace hashes.
- [interactive-driver.mjs](../../scripts/fixtures/preview/interactive-driver.mjs): Human TTY composition with scripted streaming replies, transcript/report recording and the existing network/credential guard.
- [verify_preview_consumer.py](../../scripts/verify_preview_consumer.py): full C-ENTRY-01/02/03/05 orchestrator, parallel to the accepted #35 verifier: two deterministic clean builds, exact offline install flags, physical production graph (`pan-agent` only), executable probes (`--help`, omitted/`pi`/unknown selector, native decline), missing-Runbook negative, three caught adversarial controls, synthetic provider-key canaries (`DEEPSEEK_API_KEY`/`OPENAI_API_KEY`) placed only in the parent environment, canary scans over the entire consumer tree, and zero-meter guard accounting.
- [check_workorder_51_scope.py](../../scripts/check_workorder_51_scope.py): C-ENTRY-06 scope/obligation audit against [workorder-preview-entry-obligations.json](workorder-preview-entry-obligations.json): exact changed-file inventory, byte-identical protection of every other baseline file, 115 prior Product test obligations unchanged, 2 added fixture tests, Markdown link checks, devtools isolation. The #35 fixture remains byte-identical.

## Reproduction

Use a clean checkout of the Handoff SHA. Install the existing development lock with empty task npm user/global configurations, then:

```bash
npm --prefix typescript ci --ignore-scripts
python3 scripts/check_workorder_51_scope.py
python3 scripts/verify_preview_consumer.py \
  --node /absolute/path/to/node-v22.19.0-platform/bin/node \
  --output /absolute/path/to/new-evidence-directory
```

`--output` must not exist. Formal verification rejects dirty source. The retained exact tarball can be reinstalled without rebuilding via `--tarball/--manifest`, matching the #35 retained-artifact mode. Python orchestrates verification only; no Product process loads or invokes it.

The Human offline preview uses the installed package produced by `scripts/try_preview.sh` and `scripts/demo_preview.mjs`, with records retained under the preview records root. The C-ENTRY-04 disclosure review records the four binary answers, terminal/browser and candidate SHA in the Handoff evidence.

## Criterion and evidence map

| Criterion | Evidence and oracle |
|---|---|
| C-ENTRY-01 | Two clean builds; exact install flags; empty npm config/cache; physical graph with one package; executable/exports realpaths; installed inventory equality; no checkout link, compiler, Python, Pi or network prerequisite inside the consumer |
| C-ENTRY-02 | tracer-report: 4 exchanges, `write/bash/read` order, child stdout `PAN_PREVIEW_OK`, exact `hello.js` bytes vs independent expected result, one completed sealed terminal, Runbook identity |
| C-ENTRY-03 | replay-report: fresh process, `REPLAY` renders final marker, zero exchanges/effects/task reads, sealed+workspace hashes identical |
| C-ENTRY-04 | README claims vs observed behavior; Human four-answer record with terminal/browser and candidate SHA; Regulator link/claim recheck |
| C-ENTRY-05 | Guard zero meters incl. credential reads with canaries present; canary scans over consumer tree, child environment, transcript, archive and package files; Faux task still completes; caught controls fail separately |
| C-ENTRY-06 | Scope audit output; Product typecheck/tests/conformance; retained Reference and historical Python checks; authorized isolated-host outer gate; known original-host extra-file BLOCK reported, never hidden |

## Honest limits

macOS-only early-preview intent; trusted-local authority is not a sandbox; the offline demo is scripted simulation, not live model evidence; the package remains private/unpublished; startup `y` confirmation is retained pending #49; the draggable-scrollbar enhancement is separately routed (#60). No npm publication, live validation (#36), default-kernel cutover (#29) or migration is authorized here.
