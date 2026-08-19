# Python package modules

- `__init__.py`: domain-neutral AgentLoop, General Agent Runtime, explicit Adapter configuration identities, per-run Pack/Adapter drift checks, canonical Pack/Suite fingerprints, process-isolated evaluator limits, workspace/Trace primitives, Runtime provenance, and Evaluation Campaign kernel.
- `proof_packs.py`: concrete `data-analysis` and `workspace-coding` seed Pack Adapters, fixtures, capability Adapters, scripted proof Model Adapter, deterministic evaluators, retained coding-test process evidence, and the explicitly non-publishable two-case development-smoke suite.

The Runtime Module does not import `proof_packs.py`. Composition code and integration tests may depend on both; adding a third Pack remains outside the current Gate.
