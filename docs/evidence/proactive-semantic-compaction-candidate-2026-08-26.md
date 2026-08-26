# Proactive semantic compaction | Working Agent candidate Evidence

- WorkOrder: GitHub #7
- Candidate date: 2026-08-26 (Asia/Shanghai)
- Baseline: `c2c9e33aad20d1994b7cd7ea4fb8425d6ef92b7a`
- State: accepted at the deterministic offline boundary by the 2026-08-26 Regulator Verdict ([issue #7 comment 5424205548](https://github.com/pym96/workspace-agent-harness/issues/7#issuecomment-5424205548)); not a Verified Project Fact
- Provider calls: zero

## Candidate Claim

The WorkOrder #6 evented Python TUI/AgentLoop path has one candidate proactive
semantic-compaction slice for a known Context window. In the retained local demo,
the next-call fit formula triggers before exchange, an exact 33,017-byte tool body
is externalized, older complete causal groups are represented by a sourced typed
summary, the newest complete call/result pair remains in bounded Model Context,
and the same deterministic gateway reaches `completed` after four exchanges.

This is a Working Agent Claim. The source, retained artifacts, tests, and this
index are Evidence inputs; none may substitute for an independent Verdict.

## Primary retained artifacts

The raw path is ignored local state, deliberately not committed:

| Artifact | Locator | SHA-256 | Bytes |
|---|---|---:|---:|
| complete `run-event/v1` chronology | `.runs/workorder-7/proactive-semantic-compaction-v1.jsonl` | `70f4e731bb0868eb171c1849ceb39d3b9429bad5d071ddca752120212a62d019` | 129,439 |
| exact externalized tool result | `.runs/workorder-7/proactive-semantic-compaction-v1.jsonl.artifacts/1713632029f7a85a72ada8a4051cef0748a87fb9ab063455bebc55c3e46988bc.txt` | `1713632029f7a85a72ada8a4051cef0748a87fb9ab063455bebc55c3e46988bc` | 33,017 |

The retained run ID is `36354f105f2c44998fff78eee98bbf4a`. Run IDs and
monotonic offsets intentionally make a fresh log byte-distinct; the frozen local
files above, their hashes, and deterministic semantic assertions are the Evidence
for this candidate run.

## Reproduced observations

The log has 42 events, three tool completions, four
`model.exchange_started` events, three proactive compaction completions, one
artifact externalization, and one final `run.terminal(status=completed)`. The
terminal output is:

```text
Completed 3 journal stages with preserved semantic context.
```

The known-window lock is 10,000 Tokens with 6,900 requested output room, 256
estimated protocol/tool overhead, and the v0 1,024 safety margin. The retained
input estimates are:

| Projection | Estimated input before | Estimated input after | Preserved event IDs | Summarized event IDs | Preserved atomic pairs |
|---:|---:|---:|---:|---:|---:|
| 1 | 8,353 | 1,432 | 3 | 0 | 1 |
| 2 | 8,553 | 1,650 | 5 | 0 | 2 |
| 3 | 8,753 | 1,814 | 3 | 4 | 1 |

Thus the last prepared exchange records both behaviors needed by #7: two older
call/result groups are summarized as four source event IDs, while the active
request plus the newest whole call/result pair remain exact. Its post-compaction
fit is `1,814 + 6,900 + 256 + 1,024 = 9,994 <= 10,000`.

`artifact.externalized` precedes its matching
`context.compaction_started`; recovery through the file ArtifactStore reproduces
the exact hash and byte count above. The Event Log separately retains the exact
observation in the execution/history chronology. Model-visible preview and
terminal rendering are bounded projections, not replacements for either truth.

## Commands and checks

The retained run was produced through the same public TUI entry:

```bash
python3 -m workspace_agent_harness.tui \
  --log .runs/workorder-7/proactive-semantic-compaction-v1.jsonl \
  --semantic-compaction-demo \
  --explain-compaction
```

Read-only replay:

```bash
python3 -m workspace_agent_harness.tui \
  --replay .runs/workorder-7/proactive-semantic-compaction-v1.jsonl \
  --explain-compaction
```

Builder checks after the final source change:

- focused semantic/TUI tests: 11/11 passed;
- full repository suite: 124/124 passed, with the pre-existing `ResourceWarning`
  in the Regulator process-group timeout test;
- changed Python compile, new-link/path probes, `git diff --check`, retained-log
  load/replay, terminal assertion, and artifact hashes: passed;
- outer `bash 80-监管与验收/自动检查/run_acceptance.sh`: reached the
  independently accepted project HEAD check and then stopped on
  `FAIL reality resume has no fact references` after the out-of-scope
  `50-简历/现实版.md` was modified during this Builder run. #7 has no authority
  to edit or revert the reality resume, so this external Gate remains an
  attributable handoff limitation rather than a bundled resume change.

## Test boundary

[`../../tests/test_semantic_context.py`](../../tests/test_semantic_context.py)
covers known-window fit/no-fit decisions, exact-versus-semantic short-context
identity, active request and unresolved commitment preservation, atomic pairs,
source-attributed summary decisions, two ArtifactStore Adapters and exact
recovery, replay equality, `context_compaction_error`, and refusal to truncate an
oversized active request. [`../../tests/test_evented_tui.py`](../../tests/test_evented_tui.py)
drives the long demo and its explanation through a real pseudo-terminal.

## Limits and non-claims

- The JSON-byte/4 input estimate is an explicit low-confidence offline heuristic,
  not a Provider tokenizer or Context-window measurement.
- Typed semantic facts come from the deterministic local tool Adapter. This does
  not prove that arbitrary free text can always be summarized without loss; a
  non-fitting valid projection fails closed.
- No Provider response, overflow, retry, Token usage, cost, task benchmark,
  behavioral-evaluation result, or production reliability was measured.
- #8–#11, live calls, Wiki/fact/resume promotion, and external disclosure remain
  outside this candidate.
