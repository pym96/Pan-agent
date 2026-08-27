# Provider Context overflow recovery | Working Agent candidate Evidence

- WorkOrder: GitHub #8
- Candidate date: 2026-08-27 (Asia/Shanghai)
- Baseline: `ec68c81f0a36d854dbac505510a728321ac4248b`
- State: accepted at the deterministic offline boundary by the 2026-08-27 Regulator Verdict ([issue #8 comment 5434767046](https://github.com/pym96/workspace-agent-harness/issues/8#issuecomment-5434767046)); not a Verified Project Fact
- Provider calls: zero

## Candidate Claim

The accepted #7 semantic Context projector is wired into one bounded Provider
Context-overflow recovery in the evented Python AgentLoop/TUI path. A typed local
Provider failure is retained before semantic compaction; one new projection and
one retry are allowed; a settled retry proceeds through ordinary candidate
admission and tool execution; and a second classified overflow settles once as
`context_overflow`. Original and retry exchange accounting remain separate.

This is a Working Agent Claim. The source, ignored local traces, tests, and this
index are Evidence inputs; none substitutes for an independent Verdict.

## Primary retained artifacts

The raw paths are ignored local state and are not committed:

| Artifact | Locator | SHA-256 | Bytes | Events |
|---|---|---:|---:|---:|
| retry succeeds, tool runs, Run completes | `.runs/workorder-8/provider-overflow-recovery-v1.jsonl` | `69e1e84f967409885a5714213059594907cca58c0c2dba84abb84341e8c13ea6` | 24,562 | 24 |
| retry receives a second overflow | `.runs/workorder-8/provider-overflow-exhausted-v1.jsonl` | `d4abcc1036b0559118b696c7d9f37bb077a5c7bc638750d6c9d8d9f7514c3a6f` | 14,470 | 13 |

Run IDs and monotonic offsets intentionally make a fresh log byte-distinct. The
hashes above identify these exact candidate traces.

## Reproduced observations

The successful trace records:

- one attempt-1 `model.exchange_failed(kind=context_overflow)` with response
  `overflow-demo-response-1`, input usage `375`, duration `3 ms`, and cost
  `5 micro-USD`;
- one `context.compaction_completed(attempt=overflow-recovery)` whose trigger
  retains a 4,096-Token `fallback` window, deterministic Provider-catalog source,
  `low` confidence, and no verified-fit claim;
- one attempt-2 `model.exchange_settled` with response
  `overflow-demo-response-2`, input usage `350`, duration `6 ms`, and cost
  `10 micro-USD`;
- one `context.overflow_retry_succeeded`, one admitted echo tool execution, a
  later ordinary final exchange, and one `run.terminal(status=completed)`.

The exhaustion trace has exactly two model exchanges. Both settle as separately
identified Context overflows; the second is followed by one
`context.overflow_retry_exhausted(reason=retry_context_overflow)` and one
`run.terminal(status=context_overflow)`. It has no candidate admission or tool
execution.

Both traces were produced through the documented TUI commands. Expanded live
render and read-only replay label `overflow-recovery`, retry success, and retry
exhaustion from retained events. Replay does not construct a gateway or tool.

## Tests and checks

[`../../tests/test_context_overflow_recovery.py`](../../tests/test_context_overflow_recovery.py)
uses the public `AgentLoop.run(...)` seam with deterministic local gateways. It
covers fallback and unknown window provenance, original failure preservation,
source-History and semantic-fact preservation, one successful recovery, second
overflow exhaustion, unrelated rate-limit isolation, rejection of a malformed
post-retry candidate before tool effects, and refusal by the exact-history
projector to fake semantic recovery.

[`../../tests/test_evented_tui.py`](../../tests/test_evented_tui.py) drives both
overflow demos through a real pseudo-terminal and verifies compact/expanded
rendering, tool continuation, explicit terminal status, and read-only replay.

Builder checks at this candidate point:

- focused #8 tests: passed;
- full repository suite: 131/131 passed, with the pre-existing
  `ResourceWarning` in the Regulator process-group timeout test;
- changed Python compilation and `git diff --check`: passed;
- MyPy was not available in the existing environment and was not installed;
- all newly referenced local paths resolved, and the outer
  `bash 80-监管与验收/自动检查/run_acceptance.sh` Gate passed, including its
  nested 77-test root suite and 131-test project suite.

## Limits and non-claims

- Exchange usage, timing, response IDs, and costs come from deterministic local
  Adapter fixtures; they are not Provider measurements.
- The 4,096-Token fallback is explicitly low-confidence demo metadata. It does
  not gate the initial exchange and is never relabelled as verified.
- The semantic projection proof uses the #7 deterministic preservation contract;
  it does not prove lossless summarization of arbitrary model prose.
- No network, credential, paid request, task benchmark, production reliability,
  #9–#16 feature, Wiki/VPF/resume/PDF update, or fact promotion is included.
