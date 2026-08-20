# ReAct: Synergizing Reasoning and Acting in Language Models

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://arxiv.org/abs/2210.03629> (v3, ICLR 2023; Yao, Zhao, Yu, Du, Shafran, Narasimhan, Cao — Princeton / Google Brain; local copy at `30-已有资产与参考/reference_paper/REACT.pdf`, main body read 2026-08-20)
- Updated: 2026-08-20

## Verified facts

- ReAct augments the agent's action space to `A ∪ L`, where `L` is the language space: a thought action does not affect the environment and produces no observation; it only updates the context to support later reasoning or acting (decompose goals, track progress, handle exceptions, adjust plans).
- The setup uses a frozen PaLM-540B prompted with few-shot, human-written interleaved thought-action-observation trajectories. Knowledge-intensive tasks (HotpotQA, FEVER) use dense thoughts at every step; decision-making tasks (ALFWorld, WebShop) let the model place sparse thoughts where relevant.
- For HotpotQA/FEVER the model interacts with a deliberately weakened Wikipedia API (`search[entity]`, `lookup[string]`, `finish[answer]`) that can only retrieve by exact entity name — forcing explicit linguistic reasoning about what to retrieve.
- Results with PaLM-540B prompting: HotpotQA EM — Standard 28.7, CoT 29.4, CoT-SC 33.4, Act 25.7, ReAct 27.4, ReAct→CoT-SC 35.1; FEVER accuracy — Standard 57.1, CoT 56.3, Act 58.9, ReAct 60.9, CoT-SC→ReAct 64.6. ReAct consistently beats Act; the ReAct↔CoT-SC combinations are best overall.
- Human analysis of 200 HotpotQA trajectories: hallucination is CoT's dominant failure mode (56% of failure cases; ReAct 0%), while ReAct's interleaved structure raises its reasoning-error rate (47% vs CoT 16%, including loop traps) and 23% of its failures come from uninformative search results. The paper frames groundedness vs. reasoning flexibility as a tradeoff.
- Finetuning on 3,000 correct ReAct trajectories: PaLM-8B finetuned on ReAct outperforms all PaLM-62B prompting methods; PaLM-62B finetuned on ReAct outperforms all 540B prompting methods.
- ALFWorld (134 unseen games): best ReAct trial 71% success vs best Act trial 45% vs imitation-learned BUTLER 37%; even the worst ReAct trial beats the best Act trial. WebShop (500 instructions): ReAct success rate 40.0, about +10 points over IL (29.1) and IL+RL (28.7), but well below human experts (59.6).
- An ablation replacing internal reasoning with dense external feedback (ReAct-IM, Inner-Monologue style) drops ALFWorld success from 71 to 53, which the paper presents as evidence for the value of internal reasoning beyond external feedback.

## Boundaries

- The core results come from the PaLM-540B prompting era, before native function calling; transferring exact numbers to current models is not established.
- The Wikipedia API is artificially restricted; the QA numbers are not comparable to retrieval-augmented systems with real retrievers.
- The authors note some HotpotQA answer labels are outdated.
- All figures are the paper's own measurements, not independently reproduced here.
- ReAct is a trajectory/loop structure; it does not by itself specify tool schemas, authority boundaries, or evaluation.

## Links

- [Harness Engineering fact](../concepts/harness-engineering.md)
- [Hung-yi Lee Harness Engineering lecture](2026-08-17-harness-engineering-lecture.md)
- [SWE-agent paper](2026-08-20-swe-agent-paper.md)
- [Multi-agent collaboration survey](2026-08-19-multiagent-collaboration-survey.md)
