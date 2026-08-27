# Agent Loop Behavioral Eval v0 candidate Evidence — 2026-08-27

- Status: Working Agent candidate; pending independent WorkOrder #9 Regulator review
- Session role: Working Agent (Builder)
- Authorized baseline: clean `main @ 6512ef715185d63b61216b716d964bd16dc72cbd`
- Current repository anchor: `main @ d45cb75282144b16273f37eb08024826e6082aa2`; the intervening human-authorized Wiki-only commit does not overlap the #9 candidate files
- WorkOrder: [GitHub Issue #9](https://github.com/pym96/workspace-agent-harness/issues/9), latest Agent Brief comment `5435388924`
- Paid/real Provider calls: `0`
- Network or external benchmark calls made by the campaign: `0`
- Fact, Wiki, resume, or public-result promotion: none

## Candidate identities

- Suite: `agent-loop-behavioral-eval-v0`
- Manifest: [`agent-loop-behavioral-eval-v0.json`](../../workspace_agent_harness/benchmark_configs/agent-loop-behavioral-eval-v0.json)
- Manifest identity: `sha256:026543baf0a1d48d640b695ee21c7aaab5713e75cef437024a48fb0e66f180f8`
- Runtime implementation: [`behavioral_eval.py`](../../workspace_agent_harness/behavioral_eval.py)
- Contract tests: [`test_agent_loop_behavioral_eval.py`](../../tests/test_agent_loop_behavioral_eval.py)
- Reproduction entry: [`run_agent_loop_behavioral_eval.py`](../../scripts/run_agent_loop_behavioral_eval.py)

The manifest contains exactly 12 ordered cases: three information-acquisition, three dependency-ordering, three observation/tool-failure recovery, and three stop-or-abstain cases. The campaign rejects a manifest or in-memory case bundle that differs from the lock before constructing a Gateway.

## Retained local artifacts

Ignored artifact root:

```text
.runs/agent-loop-behavioral-eval-v0-candidate-20260827-semantic-final/
```

Retained contents:

- `report.json`: SHA-256 `c008e419e984f752f0ee3c6c5a06d374347e8edee597b67b3291adb95921997d`;
- `stable-summary.json`: SHA-256 `b9af9e6a6da51126d36c8623fd693d59e0b5ac81ac462c0bfaa1f01b93c1168b`;
- `runs/*.jsonl`: 12 per-case append-only `run-event/v1` logs;
- retained Event count: 303;
- deterministic model exchanges: 35;
- deterministic tool steps: 23.

Reproduction command:

```bash
PYTHONPATH=. python3 scripts/run_agent_loop_behavioral_eval.py \
  --output .runs/agent-loop-behavioral-eval-v0-candidate-20260827-semantic-final
```

The output directory is exclusive: repeat the command with a new directory rather than overwriting retained Evidence.

## Candidate outcome

| Denominator/result | Count |
|---|---:|
| planned | 12 |
| eligible | 12 |
| started | 12 |
| evaluable | 12 |
| exact-oracle passed | 12 |
| exact-oracle failed | 0 |
| Runtime `completed` | 10 |
| Runtime `abstained` | 2 |

Each of the four families retained `3 planned / 3 passed / 0 failed`. The three recovery cases retained the expected model-visible failure observations before success:

- `RC-01`: `read_resource:not_found`;
- `RC-02`: `update_value:conflict`;
- `RC-03`: `publish:busy`.

This 12/12 result is a deterministic implementation consistency check: the frozen reference Gateway, local transitions, Event Log, and exact oracles agree. It is not a model evaluation, causal Loop Policy result, external benchmark result, or project fact.

## Negative and separation checks

The focused contract suite proves:

- case count/order, family distribution, manifest/content hash, oracle, limit, environment, local-tool, and prose-scoring drift fail before execution;
- protected fixture/oracle material does not enter the Model Context;
- Runtime terminal status and exact-oracle verdict remain separate;
- `provider.failure`, `protocol.failure`, `context.failure`, `tool.failure`, `policy.failure`, and `task.failure` remain separately attributable in one retained denominator;
- the three expected recovery observations remain ordinary model-visible tool results rather than Runtime Tool Adapter errors;
- full report and documented stable summary material are byte-stable for repeated deterministic Runs;
- report reconstruction from retained Event Logs reproduces the original report while patched Gateway/tool boundaries would fail if called, demonstrating zero Provider and tool calls during replay.

## Verification receipt

```text
python3 -m unittest tests.test_agent_loop_behavioral_eval -v
5 tests: PASS

python3 -m unittest discover -s tests -p 'test_*.py' -v
136 tests: PASS

python3 -m unittest tests.test_package_identity -v
1 test: PASS

mypy --follow-imports=skip \
  workspace_agent_harness/behavioral_eval.py \
  scripts/run_agent_loop_behavioral_eval.py
Success

python3 -m compileall -q workspace_agent_harness scripts tests
PASS

local Markdown link/path check
PASS

git diff --check
PASS

bash 80-监管与验收/自动检查/run_acceptance.sh
PASS (host 77/77; project 136/136)
```

The package-data/import check also confirms that `importlib.resources` can load the frozen manifest and reproduce its locked identity. The outer knowledge-base anchor was synchronized to the authorized Wiki-only commit `d45cb75282144b16273f37eb08024826e6082aa2` before that acceptance run. Passing Builder checks does not grant independent acceptance.

## Boundaries for review

- The existing one-string `ActionTool` carrier is unchanged. The Behavioral Domain Adapter bridges it with canonical JSON and validates a closed frozen object schema before transition.
- Every case uses the landed Semantic Context projector with a verified 32,768-Token local lock and a frozen per-tool-set policy identity. The intentionally small reference cases do not trigger proactive compaction; classified overflow negatives exercise #8's one semantic compact-and-retry path and retain its events.
- The deterministic campaign does not compare `observation-feedback-v0` against `act-once-v0`. Real-Provider repetitions and causal comparison remain #11.
- No #10 or #12–#16 implementation, live Provider call, SWE-bench/PinchBench run, Wiki/VPF/fact/resume/PDF modification, or disclosure is included.
