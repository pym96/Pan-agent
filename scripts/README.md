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
