# DeepSeek Live Behavioral Eval v0 Stage B terminal Evidence — 2026-08-29

- Status: independently accepted terminal Evidence; WorkOrder #11 frozen v2 campaign is complete and non-resumable
- Executed source: `05fdbc6180182946fb0bf175ad5867a673f01df1`
- Stage B WorkOrder: [issue #11 comment 5460806688](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5460806688)
- Builder Handoff: [issue #11 comment 5460871970](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5460871970)
- Independent Regulator Verdict: [accepted — issue #11 comment 5461826495](https://github.com/pym96/workspace-agent-harness/issues/11#issuecomment-5461826495)
- Execution interval: `2026-08-29T14:36:22+08:00` through `2026-08-29T14:36:23+08:00`
- Additional Provider calls, balance queries, formal Runs, or spend during Evidence landing: `0 / 0 / 0 / CNY 0`

## Accepted terminal observation

The first frozen scheduled exchange, not a smoke or canary, reached `https://api.deepseek.com/chat/completions` once with this exact accepted combination:

- requested model: `deepseek-v4-flash`;
- Thinking: `enabled`;
- reasoning effort: `high`;
- tool choice: `required`;
- frozen tools: `4`;
- maximum output: `384000` Tokens;
- slot: sequence `0`, `dsv0-ia-01-r1-feedback`, case `IA-01`, `observation-feedback-v0`, repetition `1`.

The Provider returned HTTP `400`, `invalid_request_error`, with the retained message `Thinking mode does not support this tool_choice`. The response contained no completion usage, returned model, or `system_fingerprint`. Usage is therefore **unknown**, not zero. The accepted `model_usage_missing` rule stopped the campaign only after the response and mandatory post-exchange balance settlement were durably retained. There was no retry, repair, restart, replacement, later authorization, second Provider exchange, or second campaign.

## Denominator and outcome separation

| Layer | Accepted observation |
|---|---|
| planned Runs | `120` |
| executed Runs | `1` |
| completed Runs | `0` |
| Runtime/Provider failed Runs | `1` |
| skipped by stop rule | `119` |
| missing Runs | `0` |
| task passed / task failed | `0 / 0` |
| observation-feedback arm | `1 failed + 59 skipped = 60` |
| act-once arm | `60 skipped = 60` |
| authorized / Provider exchanges | `1 / 1` |
| usage-known exchanges | `0 / 1` |
| balance receipts | `2` |

The raw causal estimate is `null` / ineligible. Neither arm produced a task outcome, the act-once arm never executed, and the Provider failure is not a task failure or model-quality observation.

## Balance and cost boundary

The retained preflight and post-exchange balance receipts both report an available `CNY 14.12` with secret-free response identity `sha256:58a62b8564af479d8585055807aa6bfbb2d542f23fb49d91549274a8f7c85f9a`. The observed balance delta is `CNY 0.00`.

This is one account observation at this time. It does not prove that rejected requests are generally free, and the missing completion usage prevents an actual Token count from being reported.

## Accepted identities and retained Evidence

| Material | Identity or SHA-256 | Secret-safe locator |
|---|---|---|
| repaired lock | `sha256:731a567feb8589afedd43a83f0a37d1c1080514acd07ca8b8c93843338c62c25` | accepted source at `05fdbc6` |
| runner | `sha256:b11e6ef4861ffbd5b2d804895bc3d6c78c62b0951f319b1a72e5cb93dd4db7bc` | accepted source at `05fdbc6` |
| live entry | `sha256:a37752b350f784c8c8b4f2bca370e508acee989276e5639eb0988287a7034efb` | accepted source at `05fdbc6` |
| schedule | `sha256:ba5c11e1ca3a968970d4a04df0b228115d4daac952a6511f133229dee79d2284` | accepted source at `05fdbc6` |
| ModelProfile | `sha256:9bcb9f358dc6f106f93d455c4961ace1131715bf11ed2410686ab7c11cd015f8` | accepted source at `05fdbc6` |
| accepted raw manifest | `1b86d56f8520e46c91d59a1f91900c4cc5fee6a8d5594f6613a152436fb31bfd` | `.runs/workorder-11-stage-b-2026-08-29.manifest.sha256` |
| live/reconstructed report | `b19bb165f0cf2a6db5a82a57e3c911efa12046ffbb869897b9cec8ee8a717ab1` | `.runs/workorder-11-stage-b-2026-08-29.live-report.json` |
| request body | `5ad6b37ececd8987fce5458e34c31261efd2b72668ced44a9e8fcb3fec89dcc4` | ignored campaign root |
| response body | `1b2578892681254f495b08fd8c19869049ba70c57d498a9f3775d68e695a9f20` | ignored campaign root |
| settlement | `179c6532fa7ca0650bb8d2028bd26a2e11a79f2f34f8ae1fa136cd9a54c8c846` | ignored campaign root |
| campaign stop | `344e24ea32ee46016b6bbb828dee1cd0be0e5de12941b04b89430da9a0358d0e` | ignored campaign root |
| pricing page / headers | `899affbdbc33d0be620d8dea59e86f5036c11b5410b14d060b8d2874c74f38e5` / `2619f6a1665000df7185aa339b2d0764c659804a1affb7c6f26f35c3e19ccbac` | `.runs/workorder-11-stage-b-preflight-2026-08-29/` |

The accepted campaign root contains exactly `18` raw files. Independent review recomputed the hashes, inspected the exact request/response and six-event Run Event Log, verified intent → one authorization → dispatch → response → balance settlement → stop ordering, and found no second exchange or replacement. Repeated offline reconstruction reproduced report hash `b19bb165…` byte-for-byte without credential, network, balance, Provider, model, or tool access.

## Verification and claim boundary

The independent Regulator reran the `175`-test project suite and outer acceptance gate, verified secret hygiene, and accepted the controlled one-exchange terminal Evidence. This verifies the accepted runner's real fail-closed retention, settlement, stop, and denominator behavior plus an incompatibility observation for this exact endpoint/request/profile/time only.

It is not a persistent DeepSeek property, a general statement that Thinking cannot use tools, a task or model-quality result, an arm comparison, a public benchmark or SWE-bench score, a Verified Project Fact, a Learning Wiki fact, or a resume fact. The frozen v2 campaign cannot be resumed or repaired. Any v3 attempt requires a new lock, independent review, and fresh Human budget authorization before another Provider call.
