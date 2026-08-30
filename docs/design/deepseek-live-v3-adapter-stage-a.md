# DeepSeek live Behavioral Eval v3 — zero-call Adapter repair

- Status: independently accepted on 2026-08-29 ([Regulator Verdict](https://github.com/pym96/workspace-agent-harness/issues/19#issuecomment-5462346605)); landing authorized by the [Master route](https://github.com/pym96/workspace-agent-harness/issues/19#issuecomment-5462369180)
- WorkOrder: [Issue #19](https://github.com/pym96/workspace-agent-harness/issues/19)
- Baseline: clean `main @ 92aba6e000d42d5c70fb009d539916cfb3ac1049`
- Session role: Working Agent (Builder)
- Credential reads / balance queries / Provider calls / formal Runs / spend: `0 / 0 / 0 / 0 / CNY 0`

## Bounded semantic change

The v3 Profile retains the accepted DeepSeek stable Chat Completions endpoint, `deepseek-v4-flash`, Thinking enabled, high reasoning effort, non-streaming mode, `384000` maximum output Tokens, Provider strict mode off, all native domain and terminal tools, and the v2 system prompt. It changes one request contract: canonical tool choice is `provider-controlled-default-omitted`, so the encoder does not create a request-level `tool_choice` key. It never serializes `null`, `auto`, `required`, or a named function for v3.

The response Adapter now discriminates exactly two Provider-controlled outcomes:

1. `finish_reason="tool_calls"` with exactly one native function call, empty/absent assistant content, valid restricted `reasoning_content`, a fresh call ID, and valid closed-schema arguments becomes the existing `CandidateToolCall` or typed `complete`/`abstain` terminal result.
2. `finish_reason="stop"` with non-empty assistant `content`, no tool call, and valid restricted `reasoning_content` becomes a completed `CandidateFinal`.

Every settled branch retains request/response identities, usage, duration, requested/returned model, fingerprint, finish reason, response ID, and restricted reasoning. Runtime event views and protected evaluators do not receive the reasoning value. Empty or malformed content, missing/malformed reasoning, content/tool conflicts, zero/multiple/malformed/unknown/reused calls, invalid arguments, `length`, other finish reasons, HTTP failures, identity drift, and history mismatch fail closed before any tool effect.

## Historical reasoning replay

When tools are present, v3 replays every retained assistant `reasoning_content` value exactly. Native assistant tool calls remain paired with their canonical `tool` results. A non-tool assistant turn followed by a structurally valid user turn is serialized as assistant `content + reasoning_content`, without fabricating an observation-shaped user message. Missing reasoning in either assistant-history form is rejected before dispatch.

## Versioned identity chain

| Material | Identity |
|---|---|
| accepted terminal v2 lock | `sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25` |
| accepted v2 runner | `sha256:b11e6ef4861ffbd5b2d804895bc3d6c78c62b0951f319b1a72e5cb93dd4db7bc` |
| accepted v2 live entry | `sha256:a37752b350f784c8c8b4f2bca370e508acee989276e5639eb0988287a7034efb` |
| v3 lock | `sha256:cbc23aaf211a02a492c147f40dcad7b017888ba96d68b030cadbcf87d337a5f4` |
| v3 ModelProfile | `sha256:6400c7459d000d14b46e9852e9cf2f07b9a01b55bb031ed4ba5c96b5420dd625` |
| v3 120-slot schedule | `sha256:a6117889500855b608337bd6e6b401c294e2c4808bd554bb021dc5a6a9dc05c6` |
| v3 runner | `sha256:3878dbcadd0a909e23091477cb2c178d8f7957b1f9530f4e878f615d3f68d1b6` |
| v3 live entry | `sha256:bd7680a0cdb6496ee058cabfce223199038bcceea51a3c2dd90ef007dac16c74` |

The lock binds the accepted [v2 terminal Evidence](../evidence/deepseek-live-stage-b-terminal-2026-08-29.md) and [Issue #11 independent Verdict](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5461826495), plus the source-located Provider learning artifact and [Issue #18 English Learning Handoff](https://github.com/pym96/workspace-agent-harness/issues/18#issuecomment-5461903273). The v2 lock, entry script, lock/schedule/profile identities, and terminal Evidence remain historical and byte-stable.

The case order, arm pairing, five repetitions, Context policy, Loop Policies, evaluator, limits, maximum `120` Runs / `600` paid exchanges / `CNY 15`, stop taxonomy, and zero-repair policy are unchanged. Slot and schedule identities change because the Translation identity is deliberately part of every slot.

## One latent paid path, zero-call Stage A

`scripts/run_deepseek_live_behavioral_eval_v3.py` defaults to a deterministic preview. Its `--live` branch is the existing single `BudgetedSerialCampaignRunner` path and cannot cross the credential boundary without the exact v3 lock + runner + entry acknowledgement. A v2 acknowledgement is rejected first. This candidate and its printed acknowledgement are not Human budget authorization; no live branch was entered in WorkOrder #19.

```bash
PYTHONPATH=. python3 scripts/run_deepseek_live_behavioral_eval_v3.py \
  --output .runs/workorder-19-v3-stage-a/zero-call-preview.json
```

The retained ignored preview enumerates all `120` slots and reports `formal_runs_started=0`, `live_model_calls=0`, `balance_queries=0`, `cost=CNY 0`, and `causal_result=null`.

## Claim boundary

Passing this Stage A proves deterministic request/response mapping, fail-closed offline admission, identity composition, and zero-call preview construction only. It does not prove that DeepSeek accepts omitted/default tool choice, emits a tool call, preserves live multi-turn reasoning, produces a task outcome, or changes either Behavioral Eval arm. Those are separately authorized live questions after independent acceptance and landing.
