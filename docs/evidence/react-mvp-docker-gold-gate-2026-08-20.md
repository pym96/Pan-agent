# ReAct MVP Docker Gold Gate | 2026-08-20

Status: candidate environment Evidence; not a Verified Project Fact and not a benchmark result.

## Criterion

Before any DeepSeek Agent run for a selected case, that case's official SWE-bench reference patch must complete and resolve under the pinned official evaluator. Infrastructure failure, image mismatch, an incomplete run, or an error cannot be counted as a task failure or a passing Gate. A separate Verified-set probe first establishes the local ARM-to-amd64 execution path.

## Pinned inputs

- SWE-bench runner: `https://github.com/SWE-bench/SWE-bench.git` at `7a21e05772954cc81471ae19d56f436cecf43c54` (`swebench==5.0.2`).
- Dataset: `SWE-bench/SWE-bench_Verified`, `test` split.
- Probe instance: `sympy__sympy-20590`.
- Prediction: official `gold` patch.
- Docker image: `swebench/sweb.eval.x86_64.sympy_1776_sympy-20590@sha256:3a282752833ce34730ee0621e22033501c993f45742775ca57f04c9ff27178a0`.
- Image properties observed locally: `linux/amd64`, uncompressed size `2773912299` bytes.
- Local Docker server: `28.0.4`, Linux `arm64`; amd64 execution therefore crosses Docker Desktop's emulation boundary.

## Attempts

### Attempt 1 | expected platform-discovery failure

Run ID: `react-mvp-gold-probe`.

The official Python Harness requested the published `linux/amd64` image through an ARM-default Docker client. The registry contained an amd64 manifest, but the implicit pull returned `ImageNotFound`; the official summary correctly recorded `completed_instances=0`, `resolved_instances=0`, and `error_instances=1`.

Raw generated report locator (ignored scratch state): `.scratch/swebench-probe/gold.react-mvp-gold-probe.json`.

Report SHA-256: `96a16557d84fa910fec449212a24668cd679f72bbaa7a3dfe8a826b6720f3138`.

Remediation: explicitly pull the exact image with `docker pull --platform linux/amd64 ...`; do not reinterpret the error as an unresolved task.

### Attempt 2 | pass

Run ID: `react-mvp-gold-probe-amd64-v2`.

Command:

```bash
.scratch/venvs/swebench/bin/swebench eval verified \
  --gold \
  -i sympy__sympy-20590 \
  --run-id react-mvp-gold-probe-amd64-v2 \
  -j 1 \
  -t 900 \
  --report-dir .scratch/swebench-probe
```

Official summary:

```json
{
  "total_instances": 1,
  "submitted_instances": 1,
  "completed_instances": 1,
  "resolved_instances": 1,
  "unresolved_instances": 0,
  "infra_failure_instances": 0,
  "ambiguous_failure_instances": 0,
  "error_instances": 0,
  "unstopped_containers": 0
}
```

Generated-artifact hashes:

| Artifact | SHA-256 |
|---|---|
| aggregate report | `21ce17ca478679292a6bbd9d1c6aaf29b5f2efdd80e9d5a6bd153514c3dd55f5` |
| run metadata | `2f867f3b190f6d531720c868b7f7017c484cad078d23d5552522e858c8c44b36` |
| instance report | `8b9789cc302b46bed7edeaed0ecc1e0f8af15c9263c46131c34440347f809717` |
| raw test output | `e0bdb0c414017be8afaea56ea4b9ba171fe7059c2f5c3f9a7c67343c4b6ea54a` |
| gold patch | `2726d808ea27b330fcec46cf49e60de768796feb42a36d62b0f164444c785876` |
| run log | `6313197b017526b2c1dc583356f26c042472486a6efc3631ad809c095c5d3be8` |

Generated artifacts remain under `logs/run_evaluation/react-mvp-gold-probe-amd64-v2/` and `.scratch/swebench-probe/` in this working checkout. The hashes preserve identity if local generated state is later cleaned.

## Frozen `react-mvp-5` case gates

The five selected cases were evaluated from the exact `SWE-bench/SWE-bench_Lite` revision `b0dde1093fe417d83b7184254edf8199c1f0dff5`. The official runner read the revision's local `data/dev-00000-of-00001.parquet`, SHA-256 `b90bcbfaca1b5f65155500124a977876c264a4003ab384aca4dfc39a54bef89f`, so later Hugging Face default-branch drift cannot change these receipts.

Every image was pulled explicitly for `linux/amd64`. Each run reported `total=1`, `submitted=1`, `completed=1`, `resolved=1`, `unresolved=0`, `infra_failure=0`, `ambiguous_failure=0`, `error=0`, and `unstopped=0`.

| Instance | Image registry digest | Run ID | Aggregate report SHA-256 |
|---|---|---|---|
| `sqlfluff__sqlfluff-2419` | `sha256:881e3b830d8a68b52041b8ec79af813d12adf75d0c1838b17950e5a5b6238353` | `react-mvp-gold-sqlfluff-2419` | `6a37b01702a212d611b65c7ed603eb0d84d23e0a9382dcd1cef150c38da9e7dc` |
| `marshmallow-code__marshmallow-1343` | `sha256:a61197e0b29461e34010cd83570424eb91a7f265574a81c82ff79e55c6c10f29` | `react-mvp-gold-marshmallow-1343` | `6db463fac37edf7644563ef349dbf428e550296a9591c36d3f9a4aba0e0ffc64` |
| `pydicom__pydicom-1694` | `sha256:80521627a8f3f69682f16743158b1bc8555c9253c42164a4b59050293d84ba12` | `react-mvp-gold-pydicom-1694` | `58e2d386f0e0e5fa0d6c1ba87fcf878532c879b2afe96b5502ea260e99dfd6bc` |
| `pylint-dev__astroid-1196` | `sha256:ddf6350d124714cb8cc0f100e536479fa6376130ea4ec3afbd112debac4ac9b9` | `react-mvp-gold-astroid-1196` | `dc2489c7a26c5a91ed0e4e756d32a38fbfb9312abec511f4c32b8f14d27f77e1` |
| `pydicom__pydicom-901` | `sha256:9eefbfc3074839815a9f3a319a78980aa2d568b828087457df54e11caf849865` | `react-mvp-gold-pydicom-901` | `50e8bee2e3b9bd8d1ecefad1c222bc312eceb20383424e22b1cd31bf44aeecbf` |

Aggregate reports remain under `.scratch/react-mvp-gold-5/`; raw official evaluator artifacts remain under `logs/run_evaluation/<run-id>/`. Both locations are ignored generated state. [`../../scripts/swebench_gold_gate.sh`](../../scripts/swebench_gold_gate.sh) reproduces the per-case procedure and fails closed on config, dataset, image-digest, or official-result drift.

## Result and limits

The preliminary gate passes for the one Verified-set probe, and the case-specific gate passes for all five frozen Lite development instances after explicit amd64 image acquisition. This establishes evaluator eligibility for those exact inputs on this host, not general ARM support or any Agent capability. No model was called in the gold gates, no Agent patch was generated, and no SWE-bench score may be reported from them.
