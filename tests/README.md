# Tests

The accepted implementation baseline is split across:

- `test_package_identity.py`;
- `test_runtime.py`;
- `test_trace.py`.

`test_general_runtime_contract.py` exercises the accepted ADR-0009 caller Interface: two exact Pack selectors through one Runtime, explicit Adapter configuration identity, recomputed and per-run revalidated Pack content, fail-closed task admission, authority non-escalation, and terminable evaluator failure/limit isolation. `test_proof_packs.py` also rebinding-probes live data/coding helpers to verify registered execution uses its frozen globals snapshot.

`test_benchmark_campaign_contract.py` exercises accepted ADR-0010 behavior: recomputed source/case/transform/Suite identity, exact selection, baseline provenance retention across all-Runtime-error campaigns, visible pre-run ineligibility, failure attribution, usage aggregation, failed-attempt cost retention, and append-only raw attempt artifacts. The campaign calls only the injected Runtime's public `run` seam.

`test_regulator_negative_probes.py` was authored by the independent Regulator session reviewing the 2026-08-19 backlog (fifth independent review), not by the Working Agent. It probes module data-global rebinding fail-closed revalidation, original-helper `__code__` replacement, evaluator process-group timeout cleanup with a grandchild process, Pack method rebinding, forged evaluator identity, resource traversal, caller-wider-than-ceiling authority, campaign root overlap, repetition append-only artifacts, and unregistered required packs.

`test_proof_packs.py` is the concrete Generality Proof integration contract. It must run the accepted `data-analysis` and `workspace-coding` seed Pack Adapters through one Runtime and one Model Adapter while preserving distinct capability and evaluator behavior.

Run the full handoff command with:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The complete suite must be green for the implementation candidate. That result does not establish concrete proof packs, a benchmark Adapter/result, or independent acceptance.
