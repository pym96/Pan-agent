# ReAct MVP 30-slot candidate result | 2026-08-23

Status: Working Agent candidate Evidence pending independent Regulator review. This is a five-case development smoke, not a SWE-bench Lite score, leaderboard result, Verified Project Fact, factual-ledger entry, or resume fact.

## Frozen boundary

- Suite: `react-mvp-5`.
- Config hash: `sha256:1803342999f4eb934aea5b1943e1def6797a649c72eef45b869c6f89f4250c29`.
- Source artifact: official Lite development parquet at revision `b0dde1093fe417d83b7184254edf8199c1f0dff5`, SHA-256 `b90bcbfaca1b5f65155500124a977876c264a4003ab384aca4dfc39a54bef89f`.
- Treatments: Act-only versus visible bounded ReAct, three repetitions for each of five preselected cases.
- Provider: `deepseek-v4-flash`, provider thinking disabled, temperature zero, JSON-object response; every retained valid response record reports fingerprint `a26a7955944dc5c60445bff77fac9c8e`.
- Action/evaluation: one no-network Docker bash interface and the pinned official SWE-bench runner; all five cases passed their official gold gates before Agent execution.
- Execution window: 2026-08-21 through 2026-08-23, sequential single-case waves.

The exact selected IDs, image tags/digests, run limits, action contract, and observation policy remain in the content-hashed executable lock. No task, model, treatment, repetition, limit, or outcome rule was substituted after calls began.

## Artifact identity and completion

- Raw root: `.runs/react-mvp-5/` (ignored local Evidence retained in place).
- Deterministic complete-file manifest hash: `sha256:7a3a153f888f602187e500ac2a693f786d0a5852391f736920354b41d998596a`.
- Planned slots: 30.
- Complete `attempt.json` artifacts: 29.
- Task outcomes available: 29.
- Infrastructure/artifact failures: 1.
- Official runner exit code for every complete attempt: 0.

The manifest hash is computed over sorted run-root-relative file names plus each file's SHA-256. `python3 scripts/summarize_react_mvp.py` enumerates expected slots from the frozen config rather than discovering only completed attempts.

## Primary outcome

| Variant | Planned slots | Task outcomes | Resolved | Not resolved | Infra/artifact failure |
|---|---:|---:|---:|---:|---:|
| Act-only | 15 | 14 | 1 | 13 | 1 |
| Visible ReAct | 15 | 15 | 1 | 14 | 0 |

Both treatments produced one resolved patch among their 15 planned slots. Because one Act-only slot lacks a task outcome, the evaluator-available denominators are 1/14 and 1/15 respectively; the infrastructure failure is not relabelled as an unresolved Agent patch. These five cases do not support a general performance conclusion or a claim that the treatments are equivalent.

## Paired case view

| Instance | Act-only | Visible ReAct |
|---|---|---|
| `sqlfluff__sqlfluff-2419` | 0/3 resolved | 1/3 resolved |
| `marshmallow-code__marshmallow-1343` | 0/3 resolved | 0/3 resolved |
| `pydicom__pydicom-1694` | 1/2 resolved task outcomes; 1 infra failure | 0/3 resolved |
| `pylint-dev__astroid-1196` | 0/3 resolved | 0/3 resolved |
| `pydicom__pydicom-901` | 0/3 resolved | 0/3 resolved |

The case-level pattern is one ReAct-only win, one Act-only win with an incomplete third repetition, and three all-zero ties. It is dominated by response-contract and termination failures rather than cleanly completed final actions.

## Failure and trajectory facts

| Variant | Model-error terminals | Step-limit terminals | Empty patches | Non-empty patches | Officially completed patches |
|---|---:|---:|---:|---:|---:|
| Act-only | 11 | 4 | 13 | 1 | 1 |
| Visible ReAct | 15 | 0 | 13 | 2 | 2 |

Across all 30 slots:

- 26 terminal results were `model_error`; 16 reported provider content that was not valid JSON and 10 reported a missing non-empty ReAct `thought`.
- Four terminal results were `step_limit`, including the incomplete infrastructure slot.
- 26 complete attempts produced an empty patch; three produced a non-empty patch.
- Two non-empty patches resolved: `sqlfluff` ReAct repetition 2 and `pydicom-1694` Act-only repetition 2.
- `sqlfluff` ReAct repetition 3 produced a non-empty but unresolved patch.
- A terminal model/protocol error does not imply an unresolved patch: both resolved patches existed before a later response-contract failure. Runtime termination and Domain Evaluator outcome must therefore remain separate fields.

## Provider-usage coverage

- Recorded provider call records: 196.
- Model calls reported by terminal results: 252.
- Usage coverage: 196/252 calls.
- Sum of recorded Token values: 1,264,814.
- Act-only recorded 1,039,346 Tokens across 135/176 calls.
- ReAct recorded 225,468 Tokens across 61/76 calls.

The v1 Adapter appended provider usage only after response-contract validation, and the incomplete attempt never wrote its in-memory call records. The 56 uncovered calls therefore have unknown usage, not zero usage. No fair total-Token or cost comparison can be made from this run. Attempt duration was also not persisted, so latency is unavailable rather than retrospectively estimated.

## Infrastructure incident

`pydicom__pydicom-1694` Act-only repetition 1 reached its 120-second bash-command limit at command 22. The v1 `DockerExecRunner` killed the whole container on command timeout. The loop then continued through step 30 against the stopped container and recorded `step_limit`, after which patch extraction failed because the container was no longer running. The directory retains 30 lossless command artifacts and a 62-line Trace but no v1 `attempt.json` or official evaluation.

This slot is classified as an infrastructure/artifact failure. It was not rerun, because replacing a formal repetition after observing its trajectory would weaken the frozen matrix.

## Post-experiment candidate fixes

The Working Agent applied three changes only after all 30 frozen slots had executed:

1. run commands through an in-container process-group timeout so an ordinary command timeout retains the container; a host-side guard still kills the container if Docker itself does not return;
2. retain provider identity/usage before action-document validation, including malformed action responses;
3. persist timing and a structured `patch_extraction` artifact failure when patch extraction cannot complete.

These changes have regression tests and are prospective harness fixes. They did not alter, repair, or rerun any Phase 0 outcome and require independent review before becoming a Verified Project Fact.

## Learning result and next experiment boundary

This smoke reproduces an inspectable Thought/Action/Observation loop and shows that strict response grammar, termination semantics, usage capture, and command-timeout recovery can dominate a coding-Agent comparison. It does not establish that visible reasoning is useless: the selected provider failed the required visible-thought contract in 10/15 ReAct slots, while the tiny case set split its two successes across treatments.

Before measuring a SWE-agent-style ACI treatment, freeze a new experiment version that first makes the action protocol reliably consumable without changing task-solving content. Candidate controls include constrained/native structured output if the provider supports it, a bounded protocol-repair turn, or a model whose raw API reliably follows the same schema. ACI changes should then be selected from clean bash-interface Bad Cases rather than from protocol-invalid trajectories.

## Reproduction

```bash
python3 scripts/summarize_react_mvp.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The summary command verifies every complete attempt against the frozen slot identity and emits per-attempt and Trace hashes. A separate Regulator must inspect the ignored raw Evidence, recompute the manifest/summary, add negative probes, and decide acceptance. The Working Agent has not changed `docs/evidence/verified-project-facts.md`.
