# Do grading criteria steer generation quality before any feedback loop?

- Type: open-learning-question
- Verification: open
- Source: the qualitative first-iteration observation in [Anthropic's long-running-harness article](../sources/2026-08-26-anthropic-long-running-harness.md) ("outputs were noticeably better than a baseline with no prompting at all... before any evaluator feedback"), exposed as unproven by the user's 2026-08-28 distinction: this repository's M1 evidence measures format constraint, not criteria content
- Updated: 2026-08-28

## Question

Does the *semantic content* of grading criteria — not merely the presence of a constraint — steer generation quality on the first iteration, before any evaluator feedback? And if so, how large is that effect relative to the evaluator loop's contribution?

## Why it matters

If criteria content steers generation on its own, then criteria/guidance design (Domain Pack guidance, evaluator rubrics, criteria wording) is a measurable engineering surface that deserves the same frozen-matrix rigor as transport constraints — and the total improvement of a generator/evaluator loop decomposes into a generation-side M1 effect and a feedback-side M2 effect, which can be priced separately. If it does not, the article's loop does all the work and criteria wording is decoration.

## Known boundaries

- Already established, not to be reopened: *format* constraint improves machine-checkable protocol validity in this repository's fixed-corpus replay (Strict 93/120 vs JSON 57/120 original L3; see VPF-010 and the protocol experiment). That result concerns constraint on output *shape*, not criteria steering output *direction*; entropy reduction speaks to peakedness, not peak location.
- The article's claim is a single author's qualitative observation with no quantified ablation; its baseline was "no prompting at all", not "prompting without criteria" — so even taken at face value it shows criteria language helps, not that criteria beat other good prompting.
- The article's "museum quality" wording shifted outputs toward a visual convergence, which is evidence for directionality but also for unintended steering side effects.
- Subjective quality requires a judge; the poor-QA-agent finding means a naive LLM judge cannot be trusted to measure the effect.

## Verification path

1. First calibrate the measuring instrument: an evaluator-calibration experiment — few-shot-calibrated judge, score-drift measurement across iterations, and agreement against human reference scores. The dependent variable must pass M2 before measuring anything.
2. Then a pre-registered, content-hash-frozen three-arm matrix over the same task set with repetitions: (a) no criteria, (b) criteria in the generator prompt with no evaluator loop, (c) the full generator/evaluator loop — scored blind by the calibrated evaluator.

## Links

- [Anthropic: Harness design for long-running applications](../sources/2026-08-26-anthropic-long-running-harness.md) — the observation that exposed this question.
- [Signal–decision separation](../concepts/signal-decision-separation.md) — this question prices the generation-side M1 effect apart from the feedback-side M2 effect.
- [Fixed-context DeepSeek action-protocol reliability](../experiments/2026-08-23-protocol-reliability-v1.md) — the format-constraint evidence that does *not* answer this question.
- [Why does self-generated thought improve action quality?](why-self-generated-thought-helps.md) — adjacent open question on the entropy framing.
