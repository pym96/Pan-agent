# Kimi reasoning admission and continuation — WO94 Criteria1.0

[Contract](https://github.com/pym96/Pan-agent/issues/94#issuecomment-5810518912), [activation](https://github.com/pym96/Pan-agent/issues/94#issuecomment-5810591384). Accepted repair base `cfa6f41d14bbda0837fea796d60f9d3d4f639ac9`. Target remains Kimi Code `k3-256k/high`, frozen `https://api.kimi.com/coding/v1/chat/completions`. No Responses/Anthropic migration, new retry, parameter or permission change.

## Evidence and policy basis

Public sources retrieved 2026-09-24; exact downloaded files and hashes are in the Evidence archive's `sources/index.json`. Official repository revision **9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82** (archived kimi-cli, not assumed to be the latest K3-specific implementation):

- [CLI Kimi provider construction, llm.py L349–360](https://github.com/MoonshotAI/kimi-cli/blob/9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82/src/kimi_cli/llm.py#L349) connects provider configuration to the Kimi adapter.
- [Kimi Chat Completions transport L174–184](https://github.com/MoonshotAI/kimi-cli/blob/9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82/packages/kosong/src/kosong/chat_provider/kimi.py#L174), [stream conversion L485–518](https://github.com/MoonshotAI/kimi-cli/blob/9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82/packages/kosong/src/kosong/chat_provider/kimi.py#L485), [request conversion L326–353](https://github.com/MoonshotAI/kimi-cli/blob/9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82/packages/kosong/src/kosong/chat_provider/kimi.py#L326): missing/null produces no ThinkPart; any present string, including empty, is retained. Tool processing is independent. Outgoing reasoning is emitted only when a ThinkPart exists, concatenating its strings. Invalid present types assert. This is concrete official client compatibility policy, not proof that every K3 server accepts every synthetic history.
- [Official Kimi Code Hermes configuration](https://www.kimi.com/code/docs/en/third-party-tools/hermes.html), configuration block and explanations: documents k3-256k/high with Chat Completions. Its current example uses an api.kimi.ai alias; it does not authorize changing this contract's frozen api.kimi.com endpoint or establish response-field mandatory presence.

`openai_legacy.py` was also inspected and archived. Its truthiness-based handling differs on empty strings; it is not the selected policy oracle. Pan follows the Kimi-specific converter's explicit empty-string preservation. Neither always-thinking model branding nor the source comment about some preserved-thinking backends proves every response must contain the field. We adopt the above observed client policy, with actual server acceptance left to the separately authorized future run. Historical reasons for omission remain unknown.

## Decision matrix

Inputs below mean an otherwise valid complete tool response and the aggregate across its deltas; null/missing mixed with strings never erase earlier strings.

| Observed field class | Tool admission | Private continuation | Next assistant history field |
|---|---|---|---|
| Missing throughout | Allow | Admitted provenance, no reasoning value | Omitted |
| Null only (plus missing) | Allow | Admitted provenance, no reasoning value | Omitted |
| Empty string observed, no nonempty string | Allow | Present exact empty string | Present empty string |
| Nonempty string fragments | Allow | Exact ordered concatenation, including empty fragments | Present exact concatenation |
| Any non-null non-string | Reject exchange | No admitted assistant | No next tool effect/request from rejected response |

Missing/null normalization follows absence of a client ThinkPart, not invented thinking. Empty stays present rather than being manufactured for missing/null. Original categories remain distinguishable in structure snapshots. Counts/characters are not tokens; unavailable usage remains unavailable. Legacy kimi-for-coding behavior is unchanged.

## Narrow implementation and invariants

Remove the extra K3 tool-admission requirement that reasoning had been observed. Existing optional-string assembly already implements the selected matrix, and existing outgoing encoding includes reasoning only when defined. `KimiContinuation` stores every admitted assistant with exact message identity, content digest, request-prefix identities/digests, session ID and cancellation lineage, even if reasoning is absent. A comment now distinguishes admitted absence from missing provenance. No public canonical protocol changes and no alternate continuation channel.

Tool assembly still requires complete IDs/names/arguments and valid terminal stream framing. Canonical validation still rejects duplicate IDs and bad tool-result correlation. The selected change does not bypass those checks, weaken lineage, allow cloned/foreign histories, fabricate reasoning or introduce protocol retries. Private strings remain only in process-local continuation and outbound transport, never canonical messages, archive, diagnostic output or real Evidence.

## Verification design

One shared source test suite runs a real Adapter/GeneralAgentSession with controlled SSE transport and synthetic tool: missing, null, empty and string each complete two successive tool responses, two actual tool effects and final text. Every later request is checked for reasoning field existence/value, assistant tool ID and paired result content. Input is split into seven-byte transport chunks. Source and packed consumer execute the same suite; the packed entry requires PAN_TEST_ENTRY and cannot silently choose source.

Negative tests cover array/object/number/boolean reasoning, incomplete tool, invalid JSON arguments, duplicate ID, wrong tool-result ID, foreign session and cloned lineage. Existing K3 tests retain cancellation, in-flight mutation, truncation/terminal framing, HTTP behavior and exact private continuation checks. Existing pilot structure tests retain missing/null/empty/string differentiation, multiple fragments and unavailable usage. Only obsolete missing/null rejection expectations change prospectively.

Offline fixtures prove Pan's encoding/execution policy under controlled responses, not Provider-wide conformance or benchmark success. After independent acceptance, Master may bind a fresh full-five run to the new runner/package; prior runs and failed evidence remain immutable. No live work is part of WO94.
