# Python package modules

- `__init__.py`: domain-neutral AgentLoop, General Agent Runtime, explicit Adapter configuration identities, per-run Pack/Adapter drift checks, canonical Pack/Suite fingerprints, process-isolated evaluator limits, workspace/Trace primitives, Runtime provenance, and Evaluation Campaign kernel.
- `proof_packs.py`: concrete `data-analysis` and `workspace-coding` seed Pack Adapters, fixtures, capability Adapters, scripted proof Model Adapter, deterministic evaluators, retained coding-test process evidence, and the explicitly non-publishable two-case development-smoke suite.
- `benchmarks.py`: deep benchmark-configuration Module for fail-closed PinchBench P0 catalog loading and composition of the 15+15 vertical catalog with the two implemented seeds.
- `react_mvp.py`: Phase 0 DeepSeek JSON Adapter, visible Act/ReAct treatment checks, bash-only Docker execution, bounded model observations, and lossless raw command artifacts. It reuses the existing `AgentLoop`; no SWE-bench result exists yet.
- `benchmark_configs/`: shipped PinchBench core/full source locks, the original 30-case vertical catalog, and the frozen five-case ReAct development smoke. These are configuration artifacts, not results.

The Runtime Module does not import `proof_packs.py`, `benchmarks.py`, or `react_mvp.py`. Composition code and integration tests may depend on them; adding a third Pack remains outside the current Gate.
