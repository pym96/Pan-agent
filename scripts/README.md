# Reproducibility scripts

These scripts prepare ignored local state and invoke pinned external tooling. They do not produce benchmark Claims or update the project fact register.

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
