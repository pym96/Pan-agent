# DeepSeek Live Behavioral Eval v0 — Stage A

- Status: Working Agent candidate; pending independent WorkOrder #11 Regulator review
- Date: 2026-08-28
- Authorized baseline: clean `main @ a4495ba1d2b906b480628a6dda42d8d278850cfb`
- Scope: Translation/Gateway, budget control, frozen 120-slot lock, and zero-call dry-run only
- Live model calls, balance queries, and paid cost during Stage A: `0 / 0 / CNY 0`

## Boundary

Stage A makes the future DeepSeek experiment executable only after a separate Stage B authorization. It does not run the experiment and cannot produce a causal result:

```text
frozen 12-case Behavioral Eval v0
        × 5 repetitions
        × 2 Loop Policies
        |
        v
120-slot content-hashed schedule
        |
        +--> zero-call dry-run inventory
        |
        +--> Stage B only: budget preflight -> AgentLoop -> DeepSeek Gateway
                                          |          |
                                          |          +--> exact secret-free exchange store
                                          +--> Run Event Log -> protected oracle
```

The implementation does not add a second loop. `BehavioralEvalCampaign` still enters the public evented `AgentLoop`; the only live-specific seams are a DeepSeek Translation Adapter, injected HTTP transports, a campaign budget meter, and append-only campaign inventory.

## DeepSeek Translation and Gateway

[`deepseek_live.py`](../../workspace_agent_harness/deepseek_live.py) freezes the following profile from the official [model/pricing page](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/), [thinking-mode guide](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/), and [tool-call guide](https://api-docs.deepseek.com/zh-cn/guides/tool_calls/), observed on 2026-08-28:

- stable Chat Completions endpoint and requested model `deepseek-v4-flash`;
- non-streaming requests with thinking enabled and `reasoning_effort=high`;
- sampling parameters omitted because DeepSeek documents them as ineffective in thinking mode;
- maximum output request `384,000` tokens inside the documented `1,000,000`-token Context window;
- native function schemas with `tool_choice=required` and no beta-only `strict` flag.

The Adapter maps the existing Runtime's canonical `input` string envelope to each #9 case's original closed object schema on the wire. It adds two typed terminal functions, `complete` and `abstain`; the latter accepts only `insufficient_evidence` or `authority_denied`. Exactly one function call is accepted per response.

For a feedback turn, canonical assistant call and paired tool-result messages become native Provider history. Restricted working material is carried only as `reasoning_content`, replayed only to the same compatible Provider, and never copied into executable arguments, Canonical History display payloads, Event Log payloads, or TUI views.

The decoder fails closed on non-JSON responses, incomplete/length termination, missing `reasoning_content`, unknown or multiple calls, malformed schemas, missing/reused correlation IDs, and invalid terminal arguments. A rejected candidate never crosses `candidate.accepted`, so it cannot execute a tool. HTTP failures remain typed by authentication, authorization, balance, rate limit, Context overflow, transport, or protocol category.

`DeepSeekModelGateway.exchange(...)` owns Translation, one injected transport call, optional raw retention, and decode. Constructing `DeepSeekHttpTransport` performs no I/O. Tests inject an in-memory opener; no Stage A test can reach the network unless a caller explicitly invokes the Adapter with a real opener and credential.

## Frozen campaign lock

[`deepseek-live-behavioral-eval-v0.json`](../../workspace_agent_harness/benchmark_configs/deepseek-live-behavioral-eval-v0.json) has content identity:

```text
sha256:ea23dceaa9b8131a54399e7eda5f8cdd8bf968816e0d4efd2668884753dd52fa
```

The loader also binds the accepted #9 manifest identity, the manifest file SHA-256, the historical #4 Translation fixture manifest SHA-256, model and Translation settings, Context policy, pricing observation, limits, stop rules, and every generated slot. A lock whose internal hash is recomputed after any edit is still rejected against the compiled expected identity.

The denominator is exactly `12 cases × 5 repetitions × 2 arms = 120 slots`. Each adjacent pair holds case and repetition fixed while changing only `loop_policy_id` between:

- `observation-feedback-v0`: tool observations may enter the next model exchange;
- `act-once-v0`: the first admitted tool call executes and its result is retained, then the Run settles as `loop_policy_stop` without a feedback exchange.

Pair order is deterministic from the low bit of `SHA-256(suite_id + NUL + case_id + NUL + repetition)`. The frozen schedule identity is:

```text
sha256:ba5c11e1ca3a968970d4a04df0b228115d4daac952a6511f133229dee79d2284
```

The #9 task fixtures, protected oracles, tool definitions, and accepted historical Translation fixtures are not modified.

## Budget and stop control

[`deepseek_live_campaign.py`](../../workspace_agent_harness/deepseek_live_campaign.py) owns one fail-closed `CampaignBudgetMeter`. Stage B cannot authorize a first model call until the official [balance endpoint](https://api-docs.deepseek.com/zh-cn/api/get-user-balance) returns one available CNY balance that is positive and no greater than `CNY 15.00`.

The meter enforces:

- deterministic slot order;
- at most five model exchanges per slot and 600 across the campaign;
- formal per-call and campaign input/output/combined token ceilings;
- a balance query after every authorized model exchange;
- no unavailable, exhausted, increased, or topped-up balance, and a stop when observed decrease exceeds the locked worst-case peak usage cost by more than the one-cent balance-granularity allowance;
- complete and arithmetically consistent usage;
- stable returned model and `system_fingerprint` once observed;
- explicit terminal stop codes rather than silently dropping planned slots.

`DeepSeekHttpBalanceClient` is also constructor-time zero-I/O and uses an injected opener in tests. It parses exactly one official CNY entry and reduces the exact response body to a SHA-256-bound `BalanceReceipt`; the optional append-only store retains that exact body and a secret-free receipt before parsing. Credentials never enter either artifact. Stage B must still reserve the balance/account for this campaign: a small concurrent debit within the one-cent allowance cannot be distinguished from Provider rounding by the balance endpoint alone.

The append-only campaign store reconstructs all 120 locked slots as exactly one of `completed`, `failed`, `skipped-by-stop-rule`, or `missing`, without a Provider or tool call. Missing slots remain in the denominator.

## Zero-call dry-run

Run from the repository root with a new output path:

```bash
PYTHONPATH=. python3 scripts/dry_run_deepseek_live_behavioral_eval.py \
  --output .runs/workorder-11-stage-a-manual/zero-call-dry-run.json
```

The command accepts no credential or transport option, opens its output exclusively, and emits all 120 slot identities, the complete token/call/cost envelope, and `live_model_calls=0`, `balance_queries=0`, `causal_result=null`. It is a plan reconstruction, not a benchmark or model result.

## Explicit non-goals

Stage A performs no live balance query, authentication probe, model call, paid call, task execution against DeepSeek, pricing revalidation, or causal comparison. It does not authorize Stage B, #12–#16, LangGraph, checkpoint/resume, generalized retry middleware, SWE-bench, Wiki/VPF/resume/PDF edits, fact promotion, or public claims.
