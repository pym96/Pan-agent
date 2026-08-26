# Anthropic: Harness design for long-running applications

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://www.anthropic.com/engineering/harness-design-long-running-apps> (Anthropic Engineering, Prithvi Rajasekaran, published 2026-03-24; fetched 2026-08-26)
- Updated: 2026-08-26

## Verified facts

The article addresses two persistent failure modes in long-running agentic coding:

- **Context degradation**, including a named behavior — **"context anxiety"** — where models "begin wrapping up work prematurely as they approach what they believe is their context limit".
- **Self-evaluation leniency**: "agents tend to respond by confidently praising the work — even when, to a human observer, the quality is obviously mediocre." The article also reports that "out of the box, Claude is a poor QA agent": it finds real issues, then talks itself into approving anyway.

Mechanisms the article describes:

- **Context resets versus compaction**: a reset clears the window entirely with a structured handoff artifact; compaction summarizes in place. Sonnet 4.5 required resets; per the article, "Opus 4.5 largely removed that behavior on its own".
- **Generator/evaluator split** (described as GAN-inspired): separating the working agent from the judging agent because "tuning a standalone evaluator to be skeptical turns out to be far more tractable".
- **Making subjective quality gradable**: four weighted frontend criteria (design quality, originality, craft, functionality), evaluator calibration with few-shot score breakdowns, hard per-criterion thresholds that fail a sprint, and the evaluator navigating the live app via Playwright rather than scoring static screenshots.
- **Three-agent full-stack architecture**: a Planner that expands a 1–4 sentence prompt into a deliberately non-granular spec (so errors don't cascade), a Generator working in sprints, and an Evaluator that clicks through the running app; the generator and evaluator negotiate what "done" means for a chunk before code is written, communicating entirely via files.
- Reported results: a solo 20-minute / $9 retro-game-maker run produced plausible-looking but broken gameplay, while the full harness (6 hours, $200) produced a working 16-feature, 10-sprint result; a later simplified-harness DAW test on Opus 4.6 (3h50m, $124.70) had QA catch stub-only audio recording and display-only core interactions.
- **Stale-assumption warning and closing thesis**: harness components "encode assumptions about model limits" that go stale as models improve, so pieces should be removed one at a time; "the space of interesting harness combinations doesn't shrink as models improve. Instead, it moves."

Session synthesis recorded during the grill (interpretation layer, not article claims): context anxiety and the runaway/length-termination behavior observed in this repository's max-token sensitivity experiment are opposite-direction phenomena — overreaction to a *perceived* limit versus pathological response to a *real* ceiling; both motivate explicit, typed output ceilings (ModelProfile). The poor-QA-agent observation is the separability evidence for Signal–decision separation. The reset mechanism refines the slot-identity rule — see the three-gates concept page.

## Boundaries

- This is a vendor engineering blog: its evaluations are Anthropic's own, on Anthropic models, without an independently reproducible benchmark artifact; cost and quality numbers are the article's own measurements.
- Model-specific behaviors (Sonnet 4.5 resets, Opus 4.5/4.6 improvements) are dated claims about specific deployments and will go stale — the article itself makes this point.
- The GAN analogy is the author's framing, not a validated equivalence.
- Nothing here is a Verified Project Fact or resume evidence.

## Links

- [Honest capability degradation and the three-gate model](../concepts/honest-degradation-three-gates.md) — the slot-identity rule this article's reset mechanism refined.
- [Signal–decision separation](../concepts/signal-decision-separation.md) — the poor-QA-agent separability evidence.
- [Maximum-token sensitivity in Strict ReAct action generation](../experiments/2026-08-24-protocol-max-token-sensitivity.md) — the runaway counterpart to context anxiety.
- [Harness Engineering](../concepts/harness-engineering.md)
