# Why does self-generated thought improve action quality?

- Type: open-learning-question
- Verification: open
- Source: session discussion on 2026-08-24 (user's question after reading the ReAct paper); empirical basis in [ReAct paper](../sources/2026-08-20-react-paper.md)
- Updated: 2026-08-24

## Question

Is there a citable theoretical account — or a feasible toy experiment — explaining why model-generated thought tokens improve action quality, given that self-processing cannot add external information? Candidate mechanisms discussed: autoregressive chain-rule factorization replacing one high-entropy sample with many low-entropy steps, materialization of parametric knowledge into directly attendable context, and lossy summarization of the trajectory history.

## Why it matters

A principled explanation would tell harness designers which mechanisms are load-bearing: whether to encourage dense or sparse thoughts, when thoughts risk collapsing the action distribution onto a wrong answer (the ReAct paper observed a higher reasoning-error rate than CoT), and how much of the gain is extra serial computation rather than information movement.

## Known boundaries

- The ReAct paper's empirical results (ReAct beats Act-only consistently; failure-mode tradeoffs) are already recorded and are not what this question asks about.
- The entropy/compression framing from the session is an interpretation, not an established theory; any valid explanation is bounded by the data processing inequality — thought cannot add information about the world.
- The user's refined Runtime formulation from the same session (declaration vs enforcement layers, model-portable rather than model-independent) is consistent with existing concept pages and adds no open question of its own.

## Verification path

Locate and read primary theoretical sources on chain-of-thought/scratchpad computation (the user intends to find these); alternatively, run a controlled toy experiment — same model, same observations, varying thought presence and density — and measure action quality and failure modes. The repository's frozen five-case ReAct-vs-Act experiment already provides one local data point.

## Links

- [ReAct paper](../sources/2026-08-20-react-paper.md)
- [3Blue1Brown: cross-entropy and compression](../sources/2026-08-19-cross-entropy-compression.md)
- [Visible ReAct versus Act-only experiment](../experiments/2026-08-23-react-vs-act-swebench.md)
- [Trace versus thought trajectory](../concepts/trace-vs-thought-trajectory.md)
