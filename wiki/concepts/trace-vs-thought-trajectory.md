# Trace versus thought trajectory

- Type: verified-learning-fact
- Verification: source-located
- Source: `workspace_agent_harness/__init__.py` `load_trace` (event types and integrity rules), `tests/test_trace.py` (behavioral contracts), and [Anthropic's managed-agents page](../sources/2026-08-23-anthropic-harness-definitions.md); from a session discussion on 2026-08-24
- Updated: 2026-08-24

## Verified facts

- In this repository, a Trace is a JSONL ledger of structured events with exactly five event types: `run_started`, `model_output`, `tool_completed`, `tool_failed`, `run_completed`. Each event carries `schema_version`, `run_id`, `task_id`, `sequence`, and `payload`.
- Enforced integrity rules: sequence numbers must be contiguous from zero; the ledger must start with `run_started` and end with `run_completed`; all events share one `run_id` and one `task_id`; the terminal payload must contain a valid `RunStatus`; an existing trace file is never overwritten (behavioral test).
- The Trace is written by the Runtime, not by the model. A model's reasoning text, when present, is content inside a `model_output` event's payload — the thought trajectory is an object the Trace records, not the Trace itself.
- The two artifacts differ on four axes: author (model vs Runtime), reader (the model's next-turn context vs humans/evaluators/auditors), purpose (computation — materializing parametric knowledge and summarizing history — vs evidence — attribution, replay, evaluation), and form (natural language vs schema-validated events).
- Anthropic's managed-agents "session" ("the append-only log of everything that happened") belongs to the same concept family as this repository's Trace.

## Boundaries

- This page describes this repository's implementation and one vendor's terminology; other harnesses structure their traces differently, and no industry standard is claimed.
- The information-theoretic explanation of why self-generated thoughts help (discussed in the same session) is deliberately excluded: it has no inspected source and is tracked as an open question.

## Links

- [ReAct paper](../sources/2026-08-20-react-paper.md) (thought trajectories)
- [Anthropic: official harness definitions](../sources/2026-08-23-anthropic-harness-definitions.md) (session as append-only log)
- [Harness Engineering fact](harness-engineering.md)
- [Why self-generated thought helps — open question](../questions/why-self-generated-thought-helps.md)
