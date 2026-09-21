# #72 deterministic subset preparation

Criteria1.0; **blocked proposal, no campaign authorization**. [Design and methodology](../../docs/design/benchmark-subset-preregistration.md), [Builder evidence](../../docs/evidence/benchmark-subset-72.md).

- [selector.py](selector.py): pure frozen proportional allocation and SHA256 ordering; duplicate/ambiguous/short pools fail closed.
- [inventory.py](inventory.py): verify [input-lock.json](input-lock.json), join official task/eval/tree metadata, project only non-gold provenance, reconstruct [generated/README.md](generated/README.md). No upstream scorer, task, Docker or model is executed.
- [test_selector.py](test_selector.py): synthetic allocation/tie/shuffle/shortfall/exposure/duplicate/projection/drift negative tests.
- [historical-exposure.json](historical-exposure.json): seven known exposed public IDs and hashed tracked-file scan. Current inline-answer exposure is additional and visible in the generated ledger.
- [campaign-proposal.json](campaign-proposal.json): unapproved ceilings and attempt protocol; no callable campaign or credential path.

Inputs are external at `/Volumes/WD_BLACK/pan-agent/wo72-benchmark-subset-20260921/`, archive `raw-inputs.tar.gz`. Original task/eval datasets, inline expected answers and gold fields in the authorized SWE test parquet are **not committed**. Do not display DA `result.number`, SWE patch/test_patch/eval_script/hints or reserve gold payloads. Existing Python with pyarrow is required only for parquet column projection; this task authorizes no package installation. Builder reused `/private/tmp/wo71-work/venv/bin/python`, pyarrow version bound in external receipts.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/benchmark-subset -p 'test_*.py' -v
PYTHONDONTWRITEBYTECODE=1 /private/tmp/wo71-work/venv/bin/python scripts/benchmark-subset/inventory.py /absolute/verified-inputs scripts/benchmark-subset/generated --check
```

Omit `--check` only to generate a fresh candidate projection under authorized scope. Byte-identical inputs must reproduce byte-identical outputs. Timestamps/network/resource receipts are stored separately. Selector imports only standard-library pure logic; tests use no network, model or evaluator. Existing input lock prevents silent revision substitution.

`proposal.json.selected` is empty. Both counterexample lists are diagnostic, not two optional samples to choose between. Metadata eligibility never certifies runtime, licenses, quota or official-scoring readiness. Human H-SEL-METHOD follows independent Regulator review and cannot authorize live execution. Never reuse #70's consumed activation.
