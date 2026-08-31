# DeepSeek Live TUI smoke candidate Evidence — 2026-08-31

- Status: historical Working Agent observation; Regulator rejected its authorization qualification, so it is not accepted Evidence
- Session role: Working Agent (Builder)
- Base commit: `f3e1e0d34937034c69b1f7dcdac7075da4aa262f`
- WorkOrder: [Issue #21](https://github.com/pym96/workspace-agent-harness/issues/21)
- Authorization qualification: chat-level approval existed, but the Regulator found no contemporaneous durable issue-level pre-call authorization; the observation is retained without retroactively treating the Run as authorized
- Observed external use: `2` official balance queries / `1` Provider-model exchange / `1` formal Run

## Frozen task and workspace

The only formal Run used this prompt verbatim:

```text
Read notes/a.txt and notes/b.txt, then write result.txt containing exactly total=5.
```

The disposable workspace retained these inputs before execution:

| Path | Exact content | SHA-256 |
|---|---|---|
| `notes/a.txt` | `alpha=2\n` | `07082d58c9b44101867a7ce55c9cbd4d1498ebd7505418ccc0ff21de8cfffac5` |
| `notes/b.txt` | `beta=3\n` | `413397001a80a627364dda7f289e65eb4e2a909e16c0242769bc71e1e4339989` |

The interactive entry displayed `DeepSeek`, `deepseek-v4-flash`, the resolved workspace, the separate session-artifact root, and the no-shell tool boundary before confirmation. The session then created exactly one fresh Run and closed after its terminal result.

An earlier local TUI process reached task admission with an empty exported credential and was rejected before constructing a Run root, Gateway, or Provider request. Its empty session root is retained separately. Counts immediately after that rejection were `0` Run directories, `0` Provider-exchange files, and `0` `result.txt` files. Correcting the local environment did not replace or retry a Run because no Run or external model call had existed.

## Terminal result and oracle

| Field | Observation |
|---|---|
| Run ID | `3ad9b69ba3134e25ad9e7af20e5be5bf` |
| terminal classification | `model_error` |
| typed failure | `protocol: action_count_invalid` |
| Provider finish reason | `tool_calls` |
| returned ToolCalls | `3` in one response |
| admitted ToolCalls / workspace writes | `0 / 0` |
| requested / returned model | `deepseek-v4-flash` / `deepseek-v4-flash` |
| `system_fingerprint` | `a26a7955944dc5c60445bff77fac9c8e` |
| Provider duration | `1541 ms` |
| input / output / total Tokens | `927 / 147 / 1074` |
| reported reasoning Tokens | `37`; reasoning content remains restricted and is not reproduced |
| oracle | failed: `result.txt` is absent, so normalized complete content is not `total=5` |

The Provider response contained three parallel ToolCalls. The accepted Translation/Gateway contract admits exactly one action per turn, so it rejected the whole response before tool execution. The Runtime retained the original response and usage, emitted one terminal `model_error`, and performed no read, write, verification, semantic overflow retry, protocol repair, task replacement, or later Run.

This is a time/configuration-bound observation, not evidence that DeepSeek always emits parallel calls. It does show that the reusable entry reaches the live Provider seam and that the current single-action admission fails closed without workspace effects for this observed response.

## Balance and authority qualification

The official CNY balance response identity was unchanged before and after the Run: `sha256:02429d0bbad687306db881e6a47a55f343860d53e090889ebd75ac34f4261fff`. The observed balance delta was `CNY 0.00`. This is the balance endpoint's observable precision; it is not a claim that the unrounded economic cost was exactly zero or that the call satisfied the repository's durable authorization protocol.

The private account balance and chat-level ceiling are not reproduced in this public candidate. Raw balance responses remain only in the ignored local Evidence root. The latest [Human/Master override](https://github.com/pym96/workspace-agent-harness/issues/21#issuecomment-5474512300) forbids the Builder from making another Provider call or smoke Run. It separately permits Human-operated use of the repaired candidate; each task the Human submits is that Human's execution decision, not authorization for a Builder-run experiment.

## Retained artifacts

Secret-free locator:

```text
.runs/workorder-21-live-smoke-2026-08-31/
```

| Material | SHA-256 |
|---|---|
| Run Event Log | `05f0a90afc6a459ac3aa54cae7e27e874399d487a827e44ae7b6950c32697c87` |
| Run summary | `06512ea386b39287a07ca281bdef6538c873a279832f42ba0c5f028de6c42ce8` |
| Provider request body | `1ab56405d309ad6c3a14e8f22e5ee7692f521183ee6828213893acbae0ba2ed5` |
| Provider request metadata | `eae0305e8d7bca92039e3ef4b0397e1331b46732d8e1e2055d253d5212537fb3` |
| Provider response body | `0f2de26da38abd701eaa7d5c9248305e5957fb412b4b97c17ab36692a1dd53ba` |
| Provider exchange receipt | `24e7d6270e98bc9bf8eb3f99e9752605d6ecbf334b82c74aadfea92688bc2dcc` |
| pre- / post-balance response bodies | `02429d0bbad687306db881e6a47a55f343860d53e090889ebd75ac34f4261fff` / same |
| pre- / post-balance receipt metadata | `6818aa2994ed4c07d5df9cf294f9945c44f65e01bdfb95716bf3877bc1e55a14` / `b481c80b21a40b48c5f26e8dc9adc06e4605b26fc35c3aca212ff208dfd41da4` |

Raw Provider reasoning is retained in the ignored response artifact but is not rendered by the TUI, copied into this Evidence, or exposed in the Handoff. No credential bytes are stored in request or response artifacts.

## Verification receipt

Before the live Run:

```text
focused Live TUI/Evented TUI/views: PASS — 26 tests
full project suite: PASS — 202 tests
compileall: PASS
git diff --check: PASS
formal live Runs / Provider-model calls: 0 / 0
```

The full suite emitted the existing evaluator process-group negative-probe `ResourceWarning` while all 202 tests passed. Final candidate tests and the outer candidate acceptance gate are reported in the Builder Handoff after the candidate commit is pushed.

## Claim boundary

This document records one historical terminal observation from the rejected candidate. The smoke did not satisfy its task oracle and is not accepted Evidence, a benchmark, a persistent Provider property, a model-quality conclusion, a Verified Project Fact, a Learning Wiki fact, a resume fact, or a public product claim. It authorizes no Builder Run, retry, prompt repair, task replacement, Provider matrix, or fact promotion. Independent review may still govern landing or later claims, but the latest Human/Master override does not make it a prerequisite for direct Human-operated use of the repaired candidate.
