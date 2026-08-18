# DPO and preference-optimization terminology

- Type: verified-learning-fact
- Verification: source-located
- Source: Rafailov et al., "Direct Preference Optimization: Your Language Model is Secretly a Reward Model", arXiv:2305.18290 (2023); acronym usage cross-checked against the [Hung-yi Lee lecture](2026-08-17-harness-engineering-lecture.md) transcript, which references DPO-class methods for verbalized-feedback tuning
- Updated: 2026-08-18

## Verified facts

- DPO expands to **Direct Preference Optimization**; "Deep Policy Optimization" is not a recognized name in the LLM post-training context.
- DPO trains directly on preference pairs (prompt, chosen response, rejected response), increasing the relative probability of the chosen response without training a separate reward model or running a PPO reinforcement loop.
- PPO expands to **Proximal Policy Optimization**, the RL algorithm used in classic RLHF pipelines; it is a different object from DPO.
- Provenance of this learning event: the user initially expanded DPO as "Deep Policy Optimization" and self-corrected on 2026-08-18.

## Boundaries

- This page establishes terminology and the high-level mechanism only; it does not verify DPO's performance claims, derivations, or its comparison against PPO-based RLHF in any specific setting.
- It does not establish that this project has any model-training scope.

## Links

- [Hung-yi Lee lecture source](2026-08-17-harness-engineering-lecture.md)
- [Harness Engineering fact](../concepts/harness-engineering.md)
