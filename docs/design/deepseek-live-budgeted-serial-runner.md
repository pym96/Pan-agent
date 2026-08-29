# DeepSeek Live Behavioral Eval v0 — Stage A-R budgeted serial runner

- Status: independently accepted WorkOrder #11 Stage A-R boundary on 2026-08-29; landing authorized
- WorkOrder: [Issue #11 Stage A-R](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5451406371)
- Regulator Verdict: [accepted](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5460686250)
- Session role: Working Agent (Builder)
- Live model calls / real balance queries / paid cost: `0 / 0 / CNY 0`
- Stage B: suspended; the accepted offline boundary is not paid execution authority

## One production execution Interface

`BudgetedSerialCampaignRunner.run(acknowledgement=...)` is the only production campaign execution Interface. It consumes the repaired lock and injected Provider, balance, and append-only persistence Adapters. The default entry point is a zero-call preview; live execution cannot reach credential access until the caller supplies the exact lock + runner + entry acknowledgement.

```text
repaired content-hashed lock
          |
          v
BudgetedSerialCampaignRunner (serial slot owner)
          |
          +-- durable exchange intent
          +-- one CampaignBudgetMeter authorization
          +-- injected ModelGateway
          +-- mandatory balance/usage settlement
          +-- durable exchange settlement
          |
          v
BehavioralEvalCampaign -> AgentLoop -> Semantic Context Projector
                                      -> deterministic local tools
                                      -> protected evaluator + Run Event Log
```

Tests inject deterministic Adapters through the same runner seam. There is no test-only campaign loop and no second code path allowed to authorize Provider exchanges.

## Repaired identity chain

The v2 lock preserves every Stage A experiment choice while binding the missing execution identities:

| Material | Identity |
|---|---|
| parent Stage A lock | `sha256:ea23dceaa9b8131a54399e7eda5f8cdd8bf968816e0d4efd2668884753dd52fa` |
| repaired Stage A-R lock | `sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25` |
| 120-slot schedule | `sha256:ba5c11e1ca3a968970d4a04df0b228115d4daac952a6511f133229dee79d2284` |
| runner | `sha256:b11e6ef4861ffbd5b2d804895bc3d6c78c62b0951f319b1a72e5cb93dd4db7bc` |
| live entry | `sha256:a37752b350f784c8c8b4f2bca370e508acee989276e5639eb0988287a7034efb` |

Provider/model/mode, Translation, system prompt, tools, 12 cases and protected evaluators, paired arm order, five repetitions, 120 planned Runs, five exchanges per Run, 600-call authorization ceiling, CNY 15 ceiling, Context policy, and zero protocol repair remain unchanged. The old Stage A lock is historical lineage, not a live-executable identity after this repair.

## Exchange transaction

Every possible Provider exchange follows one order:

1. retain an immediate intent containing the prepared-turn identity;
2. obtain exactly one authorization from `CampaignBudgetMeter`;
3. retain that authorization before dispatch;
4. invoke the injected `ModelGateway` once;
5. retain response identity, usage, timing, Provider identity, failure attribution, post-attempt balance receipt, and budget decision;
6. only then return the result to `AgentLoop`, so no next model exchange or tool admission can overtake settlement.

The typed dispatch boundary distinguishes:

| Dispatch state | Accounting action | Campaign action |
|---|---|---|
| `not_dispatched` | release the unused authorization; no post-balance query | retain failure and stop |
| `uncertain` | mandatory post-attempt balance query; usage remains unknown | retain uncertainty and stop |
| `response_received` | mandatory usage, identity, and balance settlement | continue only if every Gate passes |

Unclassified Gateway exceptions are conservatively `uncertain`. DeepSeek request-encoding failures are `not_dispatched`; transport failures without a response are `uncertain`; decoded responses are `response_received`. A failure retaining the exact Provider response is still a failed exchange and cannot admit its candidate.

## Stop and denominator behavior

Missing acknowledgement, duplicate campaign identity, cancellation, initial/post balance failure, missing or inconsistent usage, CNY/Token/call exhaustion, returned-model or fingerprint drift, authentication/authorization/balance failure, exchange/slot persistence failure, uncertain dispatch, and three consecutive pre-candidate transport failures prevent every later exchange. A retained `campaign-stop.json` turns later locked slots into `skipped-by-stop-rule`; an attempted slot whose terminal persistence failed remains `missing`, rather than being rewritten as executed.

The report keeps four layers separate:

- task evaluator outcomes;
- Runtime/Provider/protocol failures;
- campaign/budget stop code;
- full denominator state: executed, skipped, or missing.

`reconstruct_live_campaign_report(...)` uses only the repaired anchor, per-slot attempt, exchange transaction, Behavioral report, and stop files. It has no Gateway, balance, credential, or tool dependency.

## Zero-call entry and explicit live boundary

```bash
PYTHONPATH=. python3 scripts/run_deepseek_live_behavioral_eval.py \
  --output .runs/workorder-11-stage-a-r/zero-call-preview.json
```

Default, help, invalid arguments, import, construction, missing acknowledgement, dry-run, and offline reconstruction do not read a credential, query a real balance, invoke a Provider, execute a paid model call, or run a local Behavioral tool. The preview prints the exact acknowledgement required by a separately authorized Stage B. This Stage A-R session did not use it.

## Exclusions

No retry or repair was added. No real Provider or balance endpoint was contacted. Stage B, #12–#17, LangGraph, checkpoint/resume, generalized retry middleware, Wiki, Verified Project Facts, resumes, PDFs, public benchmark results, causal comparison, and fact promotion remain outside this accepted offline boundary.
