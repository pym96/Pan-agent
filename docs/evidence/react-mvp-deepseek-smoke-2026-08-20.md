# ReAct MVP DeepSeek provider smoke | 2026-08-20

Status: candidate provider-path Evidence; not a successful model run, Verified Project Fact, benchmark result, or resume fact.

## Criterion

Before launching the frozen 30-attempt matrix, the authorized credential must reach the exact provider endpoint and model configuration and return one usable JSON completion. Authentication, balance, model, protocol, and transport failures remain provider setup failures rather than Agent task outcomes.

## Request boundary

- Endpoint: `https://api.deepseek.com/chat/completions`.
- Model: `deepseek-v4-flash`.
- Provider thinking: disabled.
- Response format: JSON object.
- Temperature: zero.
- Credential source: private `60-项目/api.txt`, read locally and never copied into source, Trace, Evidence, configuration, shell output, or identity material.

The key file permission was tightened locally from mode `0644` to `0600` before use.

## Result

The model-list request authenticated and returned the available model IDs `deepseek-v4-flash` and `deepseek-v4-pro`. The first chat-completion request reached the provider but returned HTTP 402 with provider error type `unknown_error`, code `invalid_request_error`, and message `Insufficient Balance`.

No usable completion, thought, action, Token usage, Agent trajectory, patch, or billable experiment outcome was produced. The 30-attempt matrix was therefore not started.

The implementation Adapter exposes only the HTTP status and provider error type in raised errors; it deliberately omits credential-bearing headers and provider message bodies. This Evidence record preserves the manually inspected balance diagnosis without storing the private response or credential.

## Next gate

Confirm sufficient balance with one non-experiment completion using the same locked model/settings. Then run only cases whose official gold gate has passed, without changing tasks, variants, repetitions, or model after observing outcomes.

## Follow-up | 2026-08-21 through 2026-08-23

After the credential was funded, the same locked endpoint/model/settings returned the canonical non-experiment completion `{"output":"preflight-ok","type":"final"}` with model `deepseek-v4-flash`, fingerprint `a26a7955944dc5c60445bff77fac9c8e`, and 122 total Tokens. This closed the provider preflight and authorized the already-frozen matrix; it was not counted as an experiment attempt.

All 30 planned slots were subsequently executed without changing the frozen treatment. Their candidate result and limitations are recorded in [`react-mvp-30-slot-candidate-2026-08-23.md`](react-mvp-30-slot-candidate-2026-08-23.md). The original insufficient-balance result above remains part of the historical setup record rather than being rewritten away.
