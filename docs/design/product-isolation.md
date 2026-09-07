# WorkOrder #34 Product isolation | Builder candidate

Criteria-Version: `1.0`. Base: `55afc93deff70035810666f0efbf583357ad12fc`. This is candidate implementation and check navigation, not Verified Project Facts or an independent Verdict. Full candidate SHA, exact changed-file list, raw outputs and their hashes are bound in the GitHub #34 Handoff after commit/push.

## Product and Frozen Reference

`typescript/` is Product: explicit `--kernel native`, Pan DeepSeek/Faux and Pan Tools, one GeneralAgentSession lifecycle. Omitted selection is `kernel_selection_required`; explicit Pi is `kernel_not_in_product`; both exit 2 before any setup. `--help` returns 0. Programmatic construction requires Native or an explicitly supplied AgentKernel; injection carries adapter identity for the existing archive metadata. The injected reference implementation uses the same runTask/cancel/close/memory path. The lifecycle from `get isRunning()` onwards is byte-identical to the base.

`references/pi/` is Frozen Reference. Its manifest/lock/compiler/entry/tests are independently installed; direct Pi pins remain `0.84.4`. Product has no install dependency in either direction towards reference. Reference consumes repository-local Pan interfaces in the opposite direction and retains baseline default/explicit-Pi behavior and Pi differential-oracle coverage. Its source package requires Pan source in the same repository, not Product node_modules. It copies no upstream Pi library source.

## Relocation inventory

| Baseline | Candidate destination | Permitted adaptation |
|---|---|---|
| `typescript/src/model-adapter.ts` | `references/pi/src/model-adapter.ts` | relative Pan profile imports only |
| `typescript/src/tools.ts` | `references/pi/src/tools.ts` | byte-identical |
| `typescript/src/pi-compatibility.ts` | `references/pi/src/pi-compatibility.ts` | relative Pan type/contract imports only |
| `typescript/src/kernels/pi-kernel.ts` | `references/pi/src/kernels/pi-kernel.ts` | relative Pan imports only |
| Pi branch of `typescript/src/session.ts` constructor | `references/pi/src/session.ts` | composition facade injecting PiKernel; no duplicate lifecycle |
| `typescript/src/cli.ts` baseline entry | `references/pi/src/cli.ts` | relative Pan imports and Runbook path only |
| `typescript/test/general-agent.test.ts` | `references/pi/test/general-agent.test.ts` | shared Pan import paths only |
| `typescript/test/kernel-selection.test.ts` | `references/pi/test/kernel-selection.test.ts` | shared Pan import paths only; original defaults conserved |
| `typescript/test/native-kernel.test.ts` | same Product path plus `references/pi/test/native-kernel.test.ts` | Product canonical inputs; Pi obligations retained; Native-only case remains solely in Product |
| `typescript/test/kernel-conformance.test.ts` | same Product path plus `references/pi/test/kernel-conformance.test.ts` | Product canonical inputs; reference shared-source location changes |
| `typescript/test/conformance.test.ts` | same Product path plus `references/pi/test/conformance.test.ts` | Product Pan Tools/Faux; reference imports and fixture-root location |
| compatibility-source assertions in `pan-contracts.test.ts` | `references/pi/test/compatibility.test.ts` | same three assertions, moved source locator |

The scope check emits exact before/after SHA-256 for relocated source and byte-compares all non-import content. It byte-compares the remaining protected core modules, old Evidence, Python source/tests, Wiki, Runbook and all fixture bytes. No executable changes to NativeKernel, protocol, ModelAdapter/AgentTool contracts, Faux, DeepSeek/profile/transport, Tools, TUI, Archive or Ledger are needed.

## Coverage map

[Versioned baseline-to-candidate case inventory](workorder-34-coverage.json) accounts for all 78 baseline test titles; each destination is checked against an actual discovered test. The map, not a raw count, preserves the obligation. Product runs Native versions of the same kernel fixture cases; reference retains the Pi differential oracle. Both run all v1 and kernel-v1 fixture cases with frozen oracles. Product normalizes canonical `tool_result` to the shared fixture's historical role spelling only when comparing that oracle.

`typescript/test/pan-fixture.ts` builds canonical Pan outcomes and drives the accepted Faux Adapter; script callbacks inspect durable-before-exchange and retained Context at the same public boundary. Explicit `setUncheckedResponses` is used only for duplicate-correlation malformed fixtures so NativeKernel itself, rather than Faux pre-validation, remains the admission oracle. It is test-only, with no Pi codec or dependency. Memory assertions and archive bytes retain their original contracts. Restricted-reasoning projection now supplies a synthetic private field on an offline canonical fixture; direct DeepSeek tests separately preserve Provider-private reasoning continuation tests.

New Product selection tests pair the deliberate default transition with old reference checks. `general-agent.test.ts` also runs the real TUI through CLI with deterministic write/read/shell verify, checks completed terminal, tool sequence and sealed archive, and prints P-D6 actual admission/environment/cancellation/malformed-transport observations. The process-group command, 30 ms cancellation and 1000 ms delayed-marker window are inherited exactly from #32, not a new timing contract.

## Reproduction and evidence

Run from the committed clean candidate repository:

```bash
npm --prefix typescript ci --ignore-scripts
npm --prefix typescript run check
npm --prefix typescript run conformance
npm --prefix references/pi ci --ignore-scripts
npm --prefix references/pi run check
npm --prefix references/pi run conformance
python3 scripts/check_workorder_34_scope.py
python3 scripts/check_product_isolation.py /tmp/wo34-new-isolation-evidence
bash scripts/check_typescript_without_python.sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
git diff --check 55afc93deff70035810666f0efbf583357ad12fc
```

The isolation check clones the exact candidate, physically removes only its disposable reference copy, uses fresh public-registry dependencies and empty npm configuration/home, verifies no ancestor node_modules, physically inventories installed package identities, checks npm ls/lock and compiler files, parses all Product static/type imports, records source packaging inventory, and runs Product tests/conformance/CLI with module, filesystem, transport and credential sentinels. A separate intentional caught-forbidden-import subprocess must exit nonzero and log the attempt. Main runtime reports must contain zero forbidden accesses and external meters. Registry install traffic is disclosed separately. These are source-package checks, not #35 packed-consumer proof.

P-D6 requires independent Regulator plus different-model-family OR explicit Human review of its retained actual output before landing. This Builder is GPT-6/Codex; no independent different-family review is performed here and no Human approval of unseen results is inferred.

## Host validation fixture

Keep the real root resume PDF, `.agents/`, `.claude/`, `skills-lock.json`, authoritative validator code and accepted-main anchor untouched. Record the real host failure. In a disposable host fixture copy the canonical required host layout, original validation code/config and required files/reference identities byte-for-byte. Copy candidate checkout at full remote SHA, excluding only the three named Human tooling paths from the project copy and the known extra root PDF from the host fixture. Run unchanged `80-监管与验收/自动检查/run_acceptance.sh` with `WORKORDER_CANDIDATE_SHA` and `WORKORDER_CANDIDATE_BRANCH=workorder/34-candidate`. Retain fixture/exclusion/identity manifest and raw output. The original host is not claimed PASS. No additional failure is waived.

Host `SOURCE_OF_TRUTH.md` and the HEAD anchor are outside Builder's allowed write scope; Master owns post-Verdict truth-navigation/integration updates. This candidate updates all directly affected repository indexes and preserves the host's existing #34 activation entry.

## Limits

No #29 default cutover, #35 packed-consumer install, #36 live validation, #17 website, Qwen, paid/formal Run, model capability, sandbox claim, fact register, Wiki or resume change. Real Provider calls / Provider credential reads / balance queries / paid-formal runs: zero, cost CNY 0, subject to raw sentinel reports bound in Handoff. Package registry traffic is installation only. Candidate is for independent review, never self-accepted.
