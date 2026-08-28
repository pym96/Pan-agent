# SWE-bench and the 2026 software-engineering agent benchmark landscape

- Type: verified-learning-fact
- Verification: source-located
- Source: web search snapshot on 2026-08-28 over mixed-credibility secondary sources — [Digital Applied: SWE-bench Verified scaffolding analysis](https://www.digitalapplied.com/blog/swe-bench-verified-june-2026-benchmark-vs-scaffolding-analysis), [Digital Applied: SWE-Bench vs Terminal-Bench guide](https://www.digitalapplied.com/blog/swe-bench-terminal-bench-benchmark-guide-2026), [SWE-Bench ProMax (arXiv 2608.09802)](https://arxiv.org/html/2608.09802v1), [AI Benchmarks 2026](https://capitalandcompute.net/ai-benchmarks/), [Coding-Agent Benchmarks 2026](https://benchmarkingagents.com/best-benchmarks-for-coding-agents/), [vals.ai SWE-bench leaderboard](https://vals.ai/benchmarks/swebench)
- Updated: 2026-08-28

## Verified facts

Statements below record what these secondary sources claim at snapshot time:

- The SWE-bench family has diverged into variants that should not be compared directly: Original (2,294 issues) and Verified (OpenAI's 500-task human-validated subset) are reported as saturated and contamination-prone (frontier agents above 75–95%; audits finding roughly a third of successful patches involving solution leakage); Pro (Scale AI) is the harder, contamination-resistant variant with top scores near 59%; Live/SWE-rebench continuously harvest post-cutoff issues, with agents solving roughly 18–20%.
- Adjacent 2026 benchmarks by measured dimension: SWE-PolyBench and SWE-Bench ProMax (multilingual, repo-level; ProMax targets large-scale refactoring averaging >5 files modified); SWE-EVO and DeepSWE and Frontier-Bench (long-horizon; Frontier-Bench's top reported score is 34.4%); Terminal-Bench 2.x (hard human-verified CLI tasks); SWE-Lancer (real paid freelance jobs, measured in dollars); GSO (performance optimization, must be ≥95% of expert speed).
- Methodology consensus in the 2026 sources: the harness accounts for a large share of the score (identical weights swinging 10–20 points across scaffolds); vendor-reported and independently reproduced scores diverge structurally (one cited pair: 87.6% claimed vs 64.3% reproduced); editorial guidance is to quote at least two benchmarks together and disclose the harness, treating HumanEval/MBPP as sanity floors only.

## Boundaries

- This is a single-search snapshot over sources of mixed credibility (including community and SEO content); every number is a dated claim by the cited secondary source, not an independently verified measurement. Any benchmark actually adopted by this repository requires its own primary-source ingest and configuration freeze.
- Vendor benchmark claims (e.g., an open-weight model "matching top closed systems") are vendor-reported until independently reproduced; treat accordingly.
- This repository's only SWE-bench contact remains the frozen five-case Lite development smoke — explicitly not a score.
- Nothing here is a Verified Project Fact or resume evidence.

## Links

- [SWE-bench Harness and dataset mechanics](2026-08-20-swe-bench-harness.md)
- [SWE-agent paper](2026-08-20-swe-agent-paper.md)
- [Visible ReAct versus Act-only experiment](../experiments/2026-08-23-react-vs-act-swebench.md) — this repository's development-smoke boundary.
