# Visible ReAct versus Act-only in the frozen five-case development smoke

- Type: verified-learning-fact
- Verification: experiment-reproduced
- Source: `.runs/react-mvp-5/` manifest `sha256:7a3a153f888f602187e500ac2a693f786d0a5852391f736920354b41d998596a`; [candidate Evidence record](../../docs/evidence/react-mvp-30-slot-candidate-2026-08-23.md); executable config `sha256:1803342999f4eb934aea5b1943e1def6797a649c72eef45b869c6f89f4250c29`
- Updated: 2026-08-23

## Verified facts

- The frozen matrix executed all 30 planned slots: five SWE-bench Lite development cases, Act-only and visible ReAct, and three repetitions. Twenty-nine slots retained a task outcome; one Act-only slot retained an infrastructure/artifact failure after a command timeout stopped its container.
- Act-only produced one resolved patch from 14 available task outcomes and one infrastructure failure. Visible ReAct produced one resolved patch from 15 task outcomes. Counting planned slots, each treatment produced one resolution in 15 slots.
- The two resolutions occurred on different tasks: visible ReAct resolved one `sqlfluff` repetition, while Act-only resolved one `pydicom-1694` repetition. The other three cases were all-zero ties.
- Response/termination failures dominated the smoke. Twenty-six slots ended in `model_error`: 16 invalid-JSON errors and 10 missing-ReAct-thought errors. Four ended at the step limit. No slot reached a successful final AgentLoop terminal result.
- Terminal status and task outcome are distinct. Both resolved patches existed before a later provider-protocol error, so a `model_error` terminal did not prevent the official evaluator from resolving the extracted patch.
- Twenty-six complete attempts produced empty patches and three produced non-empty patches. Two of those three resolved.
- Provider usage is incomplete: 196 of 252 reported model calls retained usage, summing to 1,264,814 recorded Tokens. The uncovered calls have unknown usage rather than zero usage. The v1 attempt format retained no duration records.

## Boundaries

- This is a five-case development smoke, not a SWE-bench Lite score, leaderboard result, stable model-quality estimate, or proof that visible reasoning is equivalent, better, or worse in general.
- One Act-only slot lacks a task outcome, so 1/14 versus 1/15 evaluator-available denominators are not a balanced performance comparison.
- DeepSeek V4 Flash failed the required visible-thought contract in 10 of 15 ReAct slots. The run therefore measures the combined prompt/protocol treatment under this provider, not clean ReAct reasoning quality in isolation.
- Missing provider usage prevents a fair Token/cost comparison. Missing duration prevents a latency comparison.
- The post-run timeout, usage-capture, timing, and artifact-failure fixes were not applied to or rerun against this matrix.
- The result does not yet identify a SWE-agent-style ACI improvement. Protocol reliability must be isolated in a newly frozen experiment before attributing bash-interface Bad Cases to navigation, viewing, editing, or search feedback.
- This Learning Wiki verification level does not promote a project implementation fact or resume fact; those require their separate independent Gates.

## Links

- [ReAct-to-SWE MVP design](../../docs/design/react-to-swe-mvp.md)
- [ADR-0011](../../docs/adr/0011-react-mvp-before-swe-aci.md)
- [Candidate 30-slot Evidence](../../docs/evidence/react-mvp-30-slot-candidate-2026-08-23.md)
- [DeepSeek provider preflight Evidence](../../docs/evidence/react-mvp-deepseek-smoke-2026-08-20.md)
- [SWE-bench environment fact](../sources/2026-08-20-swe-bench-harness.md)
- [`react-mvp-5` executable lock](../../workspace_agent_harness/benchmark_configs/react-mvp-5-v1.json)
