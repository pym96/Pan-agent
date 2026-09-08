# Reproducibility scripts

These scripts prepare ignored local state and invoke pinned external tooling. They do not produce benchmark Claims or update the project fact register.

## WorkOrder #33 direct Pan DeepSeek Adapter checks

Run the content-hashed offline Provider fixtures and verify the frozen write scope, protected Kernel/Tool/TUI/Archive bytes, direct Native composition, Pan-only Provider module graph, unchanged dependencies, and required scan-tool availability:

```bash
npm --prefix typescript run pan-deepseek
bash scripts/check_workorder_33_scope.sh
```

The focused suite uses only injected byte streams and synthetic transport failures. Provider calls, Provider credential reads, balance queries, paid/formal Runs, and cost are `0 / 0 / 0 / 0 / CNY 0`. Passing these commands does not accept #33, remove Pi, switch the default Kernel, or authorize #34–#36, #29, or #17.

## WorkOrder #32 Pan Faux and trusted-local Tool checks

Run the focused reusable Faux/product Tool tracer and verify the frozen write scope, protected bytes, Pan-only import graph, direct Native Tool composition, unchanged Provider Adapter, and unchanged Pi dependency declarations:

```bash
npm --prefix typescript run pan-faux-tools
bash scripts/check_workorder_32_scope.sh
```

The checks are deterministic and temporary-workspace-only. Provider calls, credential reads, balance queries, paid/formal Runs, and cost are `0 / 0 / 0 / 0 / CNY 0`. Passing them does not accept #32, replace the production Provider bridge, remove Pi, switch the default Kernel, or authorize #33–#36, #29, or #17.

## WorkOrder #31 Pan-owned contract checks

Run the focused Pan protocol/Adapter/Tool suite and verify the frozen write scope, protected bytes, NativeKernel import boundary, and unchanged Pi dependency declarations:

```bash
npm --prefix typescript run pan-contracts
bash scripts/check_workorder_31_scope.sh
```

The checks use only test-local scripted adapters/tools. Provider calls, credential reads, balance queries, paid/formal runs, and cost are `0 / 0 / 0 / 0 / CNY 0`. #31 is independently accepted and landed; these historical commands do not accept a downstream candidate or authorize #32–#36 work.

## WorkOrder #28 Native Agent Kernel checks

Run the versioned language-neutral Kernel contract against both `pi` and `native`, verify that the TypeScript product remains runnable with the historical Python package physically absent, and confirm WorkOrder #28 did not change protected Python, Evidence, Wiki, benchmark-lock, or accepted v1 conformance paths:

```bash
npm --prefix typescript run kernel-conformance
bash scripts/check_typescript_without_python.sh
bash scripts/check_workorder_28_scope.sh
```

These checks use deterministic Faux model responses. Provider calls, credential reads, balance queries, and paid cost are `0 / 0 / 0 / CNY 0`; they do not accept the candidate or authorize Native default cutover.

## WorkOrder #24 cutover checks

After committing the candidate bytes, run `bash scripts/check_typescript_without_python.sh` to archive the exact commit into an isolated directory, physically remove the reference product package, and execute the TypeScript checks. Run `bash scripts/check_workorder_24_scope.sh` to prove that historical Evidence, Wiki, and Python implementation paths still match accepted base `c4796f7da173f1717d5c9adb07a9d2e13cc1cf8b`.

## SWE-bench gold gate

Run one frozen `react-mvp-5` case from the repository root:

```bash
bash scripts/swebench_gold_gate.sh sqlfluff__sqlfluff-2419
```

The script validates the content-hashed experiment config, prepares the official SWE-bench runner at commit `7a21e05772954cc81471ae19d56f436cecf43c54` in `.scratch/`, downloads the exact pinned Lite development parquet, verifies its SHA-256, explicitly pulls the case's `linux/amd64` image, and runs the official gold patch. It exits non-zero unless exactly that instance completes and resolves without evaluator or infrastructure errors.

Generated runner, dataset, reports, and evaluator logs are ignored local state. The script deliberately does not remove the downloaded Docker image. After preserving the receipt and hashes, reclaim only that exact image if needed:

```bash
docker image rm swebench/sweb.eval.x86_64.sqlfluff_1776_sqlfluff-2419:latest
```

Do not use broad Docker prune commands: this machine contains unrelated user images and build cache.

## One Agent attempt

After the exact case gold gate passes and while its image remains local, run one frozen attempt through the SWE-bench virtual environment:

```bash
DEEPSEEK_API_KEY='...' PYTHONPATH=. \
  .scratch/venvs/swebench/bin/python scripts/run_react_mvp_case.py \
  sqlfluff__sqlfluff-2419 react 1
```

The command refuses an unselected case, invalid repetition, missing/mismatched dataset, absent image, missing/failed gold receipt, missing credential, or existing attempt directory. It writes the full Trace, lossless tool streams, patch, secret-free provider usage, prediction, official evaluator output, and summary under ignored `.runs/react-mvp-5/` state. An unresolved patch is a valid recorded outcome; evaluator/infrastructure failure exits non-zero and remains distinct.

Do not launch the 30-attempt matrix until every case has a passing gold receipt and provider balance is confirmed. The credential belongs only in `DEEPSEEK_API_KEY`; never copy it into configuration, arguments, logs, or committed files.

## Deterministic matrix summary

After every frozen slot has either a complete attempt artifact or a retained failure directory, run:

```bash
python3 scripts/summarize_react_mvp.py > /tmp/react-mvp-5-summary.json
```

The summary enumerates the expected 30 slots from the content-hashed configuration rather than discovering a favorable subset. It separates task outcomes from missing/incomplete attempt artifacts, reports provider-usage coverage instead of treating missing usage as zero, and includes attempt/Trace SHA-256 values. The absolute local run paths and ignored raw artifacts are Evidence locators, not portable benchmark results.

## Protocol reliability v1

Verify that the committed 24-context corpus still regenerates exactly from the retained 30 source Traces:

```bash
PYTHONPATH=. python3 scripts/freeze_protocol_reliability_contexts.py --verify
```

Validate the content hashes and deterministically enumerate all 240 original slots without making a provider call:

```bash
PYTHONPATH=. python3 scripts/run_protocol_reliability.py --dry-run
```

Run the frozen serial matrix, or bound the current invocation while preserving the global deterministic order:

```bash
DEEPSEEK_API_KEY='...' PYTHONPATH=. \
  python3 scripts/run_protocol_reliability.py --max-slots 10
```

Omit `--max-slots` to continue through every missing slot. Completed attempts are skipped during matrix continuation; an incomplete directory or a single-slot overwrite request fails closed. The runner stops after retained fatal HTTP/authentication/balance evidence, three consecutive L0 failures, or non-empty `system_fingerprint` drift within one transport. It never retries automatically.

Each ignored `.runs/protocol-reliability-v1/<attempt>/` directory retains the secret-free request, exact response body, hashes, UTC timing, provider identity and usage, L0-L3 assessment, and original/repair derived scheme results. Repair occurs once only after L1-L3 and never after L0.

Summarize the expected matrix from the lock:

```bash
PYTHONPATH=. python3 scripts/summarize_protocol_reliability.py \
  > /tmp/protocol-reliability-v1-summary.json
```

The summary reports incomplete denominator, J0/J1/S0/S1 original-versus-repair reliability, exact counts, Wilson 95% intervals, Token coverage/cost, challenge/control and variant splits, fingerprint groups, and artifact hashes. It measures provider-protocol behavior during one time window and is not task-quality or benchmark evidence.

## Protocol maximum-token sensitivity

Verify the parent raw Evidence, both content locks, and the exact 75-slot v1.1 matrix without a provider call:

```bash
PYTHONPATH=. python3 scripts/run_protocol_max_token_sensitivity.py --dry-run
```

Run or resume the v1.1 matrix, then summarize it to a new exclusive file:

```bash
DEEPSEEK_API_KEY='...' PYTHONPATH=. \
  python3 scripts/run_protocol_max_token_sensitivity.py
PYTHONPATH=. python3 scripts/summarize_protocol_max_token_sensitivity.py \
  --output .runs/protocol-reliability-v1.1-max-token-sensitivity-summary.json
```

The separately versioned 16K extension binds that completed summary and raw manifest before enumerating its 25 new calls:

```bash
DEEPSEEK_API_KEY='...' PYTHONPATH=. \
  python3 scripts/run_protocol_max_token_sensitivity.py \
  --config workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json
PYTHONPATH=. python3 scripts/summarize_protocol_max_token_sensitivity.py \
  --config workspace_agent_harness/benchmark_configs/protocol-reliability-v1.2-max-token-16k-extension.json \
  --output .runs/protocol-reliability-v1.2-max-token-16k-extension-summary.json
```

Both runners retain append-only secret-free requests, lossless response bodies, hashes, L0–L3 assessments, finish reasons, usage, returned markers, and provider identity. The 16K condition is an extension observed after v1.1, not a retroactively preregistered arm.

## Typed Translation Adapter four-cell dry-run

Enumerate the later history-carrier × reasoning-carrier diagnostic without a provider call:

```bash
PYTHONPATH=. python3 scripts/dry_run_translation_matrix.py
```

The deterministic output contains exactly four cells: legacy JSON-text versus native assistant-call/tool-result history, crossed with diagnostic thought-in-arguments versus command-only schemas. Model, DeepSeek Beta endpoint, canonical Context, tool set, temperature, thinking setting, five-repetition plan, and one explicit provider-controlled `ModelProfile` identity remain fixed. `live_calls=0` and `causal_result=null`; this command neither executes a task nor recommends a production output ceiling.

## Deterministic Agent Loop Behavioral Eval v0

Run the frozen 12-case local campaign through the same evented `AgentLoop` used by the TUI:

```bash
PYTHONPATH=. python3 scripts/run_agent_loop_behavioral_eval.py \
  --output .runs/agent-loop-behavioral-eval-v0-manual
```

The output directory is exclusive and retains one `run-event/v1` log per case, `report.json`, and the documented `stable-summary.json`. The script uses a credential-free deterministic Gateway and local tools: it makes no Provider, network, or external benchmark call. A 12/12 reference result checks implementation consistency only and is not a model or benchmark score.

## DeepSeek live Behavioral Eval Stage A dry-run

Enumerate the frozen paired 120-slot campaign without constructing a live transport or reading a credential:

```bash
PYTHONPATH=. python3 scripts/dry_run_deepseek_live_behavioral_eval.py \
  --output .runs/workorder-11-stage-a-manual/zero-call-dry-run.json
```

The output path is exclusive. The artifact binds every slot, both Loop Policy arms, Provider/Translation/Context identities, formal call/Token/CNY ceilings, and stop rules while reporting `live_model_calls=0`, `balance_queries=0`, and `causal_result=null`. It is a Stage A plan receipt, not permission to start Stage B or a model result.

## DeepSeek live Behavioral Eval Stage A-R safe entry

The repaired production entry defaults to the same zero-call behavior while additionally binding the sole serial runner and exact live acknowledgement:

```bash
PYTHONPATH=. python3 scripts/run_deepseek_live_behavioral_eval.py \
  --output .runs/workorder-11-stage-a-r-manual/zero-call-preview.json
```

The command neither reads `DEEPSEEK_API_KEY` nor constructs/calls a live Adapter. `--live` is rejected before credential access unless `--acknowledgement` exactly matches the repaired lock + runner + entry string printed by preview. Stage A-R did not invoke `--live`. The separately authorized v2 Stage B campaign later reached one frozen Provider exchange and terminated under `model_usage_missing`; its accepted Evidence is indexed at [`../docs/evidence/deepseek-live-stage-b-terminal-2026-08-29.md`](../docs/evidence/deepseek-live-stage-b-terminal-2026-08-29.md). Do not rerun or resume v2; any v3 requires a new lock and fresh Human budget authorization.

## DeepSeek live v3 Stage A safe entry

Preview WorkOrder #19's new Provider-controlled/default tool-choice lock without reading a credential or constructing a Provider/balance Adapter:

```bash
PYTHONPATH=. python3 scripts/run_deepseek_live_behavioral_eval_v3.py \
  --output .runs/workorder-19-v3-stage-a/zero-call-preview.json
```

The preview deterministically enumerates the unchanged 120-slot denominator and prints the new exact v3 lock + runner + entry acknowledgement while reporting `formal_runs_started=0`, `balance_queries=0`, `live_model_calls=0`, and `cost=CNY 0`. The v2 acknowledgement is rejected before credential access. WorkOrder #19 did not enter `--live`; the candidate acknowledgement is not paid-execution authority.


## WorkOrder #34 isolation checks

`check_workorder_34_scope.py` validates protected bytes, relocation and baseline test coverage. `check_product_isolation.py` installs a disposable Product checkout with reference physically absent, audits installed/type/runtime graphs and runs the full suite. `wo34-runtime-guard.mjs` blocks forbidden resolution and real transport/credential access in offline checks, recording attempts even when caught. Temporary evidence and host fixture instructions are in `docs/design/product-isolation.md` from repository root.


## WorkOrder #35 local compiled consumer

[`verify_packed_consumer.py`](verify_packed_consumer.py) builds twice, retains the exact tarball and file identities, and installs it into a fresh production-only Node 22.19.0 consumer. [`wo35-consumer-guard.mjs`](wo35-consumer-guard.mjs) records file/module/network attempts and caught negative controls; [`wo35-consumer-driver.mjs`](wo35-consumer-driver.mjs) drives only installed Product exports through real CLI/TUI/Tools. The synthetic input lives in [`fixtures/`](fixtures/README.md). [`check_workorder_35_scope.py`](check_workorder_35_scope.py) checks exact core/reference/fixture preservation and all baseline test obligations. These are verification tools, not package runtime files. Commands, identities and Criterion mapping are in the [packaging design](../docs/design/packed-product-consumer.md).


## WorkOrder #41 Module correspondence

[`check_module_layout.mjs`](check_module_layout.mjs) compares base/candidate source bytes using compiler-parsed import spans, enforces resolved dependency direction, and checks protected files/test obligations. [`check_public_package.mjs`](check_public_package.mjs) installs old/new local tarballs and checks equivalent named exports and the [compile-only public client](fixtures/module-layout-public-types.ts). Negative test copies are created outside Product. The [layout design](../docs/design/native-module-layout.md) specifies exact commands and the unchanged #35 consumer verifier. Historical #34/#35 scope scripts remain tied to their accepted commits.

## WorkOrder #42 compact TUI

[Guide and commands](../docs/design/native-compact-tui.md). `check_tui_scope.mjs` checks current core/graph and prior obligations; `verify_tui_execution.mjs` compares exact base/candidate execution; `verify_tui_pty.py` drives actual PTYs with explicit barriers; `verify_tui_consumer.py` retains all #35 artifact/isolation checks and drives installed compact/details/replay, including fresh-process cancelled archives. `check_tui_public_package.mjs` checks the old typed client plus the single optional runtime export. `demo_tui.mjs` runs actual offline Product CLI; `verify_tui_demo.py` records Builder scenarios, never Human acceptance. Historical scripts stay unchanged.

## WorkOrder #44 streaming candidate

- [verify_streaming_consumer.py](verify_streaming_consumer.py): two compiled packs and offline guarded production install; English successor client [wo44-consumer-driver.mjs](wo44-consumer-driver.mjs).
- [verify_streaming_pty.py](verify_streaming_pty.py): 57 actual source-barrier/PTY/non-TTY cases; accepts --package and --guard for installed execution.
- [verify_streaming_baseline_pty.py](verify_streaming_baseline_pty.py): all ten #42 PTY cases with mapped English labels.
- [verify_streaming_execution.mjs](verify_streaming_execution.mjs): base/candidate × progress/omitted exact semantic comparison.
- [verify_streaming_scope.py](verify_streaming_scope.py): current/historical scope and four disposable negative controls.
- [check_streaming_scope.mjs](check_streaming_scope.mjs) and [check_streaming_public_package.mjs](check_streaming_public_package.mjs): current scope/graph, protected wiring and legacy public client compatibility.
- [demo_streaming.mjs](demo_streaming.mjs) and [verify_streaming_demo.py](verify_streaming_demo.py): actual installed offline interactive demo and Builder trial.
- [Design and commands](../docs/design/native-streaming-tui.md); historical scripts remain unchanged.

#43: [demo_files.mjs](demo_files.mjs), [verify_file_demo.py](verify_file_demo.py), [verify_file_pty.py](verify_file_pty.py), [check_file_scope.mjs](check_file_scope.mjs), [check_file_graph.mjs](check_file_graph.mjs), [verify_file_scope.py](verify_file_scope.py) and [check_file_public_package.mjs](check_file_public_package.mjs). Existing #44 consumer and streaming verifiers run unchanged.

#43 repair 1.1: [verify_file_repair_pty.py](verify_file_repair_pty.py), [demo_file_repair.mjs](demo_file_repair.mjs), [check_file_repair_scope.mjs](check_file_repair_scope.mjs), [verify_file_repair_scope.py](verify_file_repair_scope.py), [check_file_repair_public_package.mjs](check_file_repair_public_package.mjs). Existing verifiers remain unchanged.
