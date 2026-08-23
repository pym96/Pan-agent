# SWE-bench Harness, dataset metadata, and ARM Docker execution

- Type: verified-learning-fact
- Verification: experiment-reproduced
- Source: official `SWE-bench/SWE-bench` checkout at commit `7a21e05772954cc81471ae19d56f436cecf43c54` (`swebench==5.0.2`); `SWE-bench/SWE-bench_Lite` dataset revision `b0dde1093fe417d83b7184254edf8199c1f0dff5`; local run IDs `react-mvp-gold-probe` and `react-mvp-gold-probe-amd64-v2`; [environment Evidence receipt](../../docs/evidence/react-mvp-docker-gold-gate-2026-08-20.md)
- Updated: 2026-08-20

## Verified facts

- The current official runner resolves its Lite dataset name to `SWE-bench/SWE-bench_Lite`. At the pinned revision, its records include execution metadata such as the exact evaluation image and evaluation script. The older `princeton-nlp/SWE-bench_Lite` copy inspected during setup does not expose the same current execution fields, so it is not an interchangeable source for a runner-ready frozen configuration.
- On the local Docker Desktop server (`28.0.4`, Linux `arm64`), the official Harness's implicit acquisition of the published x86_64 image for `sympy__sympy-20590` failed before evaluation. The official aggregate retained this as one error with zero completed instances rather than an unresolved patch.
- Pulling the same image explicitly with `docker pull --platform linux/amd64` and rerunning the pinned official gold evaluation completed one instance and resolved one instance, with zero unresolved, infrastructure-failure, ambiguous-failure, error, or unstopped-container counts.
- A gold-patch run is an environment/evaluator gate: it demonstrates that the pinned task image, reference patch, and evaluator can complete together. It does not test an Agent.
- Docker serves two separate purposes in this experiment: disposable task isolation while the Agent edits `/testbed`, and reproducible execution of the official evaluator image. Docker is not part of the ReAct reasoning mechanism itself.
- On this ARM host, architecture selection is part of experiment provenance. Treating image discovery failure as an Agent task failure would corrupt both the denominator and failure attribution.
- The same explicit-platform procedure was then reproduced for all five frozen Lite development cases using a revision-pinned local parquet. Every gold run completed and resolved exactly one case with zero infrastructure, ambiguous, evaluator-error, or unstopped-container counts.

## Boundaries

- The reproduced receipts cover one Verified-set probe plus the five exact frozen Lite development cases; they do not establish x86_64 emulation for other images or datasets.
- No model was called and no Agent patch was evaluated in either run.
- A one-instance gold gate is not a SWE-bench score, implementation acceptance, Verified Project Fact, or resume fact.
- Generated run artifacts are local and ignored; their stable paths and SHA-256 values are recorded in the Evidence receipt.

## Links

- [ReAct-to-SWE MVP design](../../docs/design/react-to-swe-mvp.md)
- [ReAct paper](2026-08-20-react-paper.md)
- [SWE-agent paper](2026-08-20-swe-agent-paper.md)
- [Visible ReAct versus Act-only experiment result](../experiments/2026-08-23-react-vs-act-swebench.md)
- [Docker gold-gate Evidence](../../docs/evidence/react-mvp-docker-gold-gate-2026-08-20.md)
