# WO89 protocol and verifier preparation — Criteria1.0

Base `6317f1b8ec6823431cfb7a7c2ae017a379e0d23b`; [contract](https://github.com/pym96/Pan-agent/issues/89#issuecomment-5807836748). This candidate adds observation, not a newly permissive K3 protocol.

## Sources and applicability

- [Kimi Code error reference](https://www.kimi.com/code/docs/en/kimi-code/error-reference.html): documents thinking/tool-history request rejection as HTTP400. It is not evidence for the content of #88 HTTP200 responses.
- [Kimi Code model configuration](https://www.kimi.com/code/docs/en/kimi-code/models.html): applies to K3-256k and low/high/max effort. Current documentation names api.kimi.ai; frozen Pan endpoint remains api.kimi.com/coding/v1. No endpoint migration or equivalence claim is introduced.
- [Official Kosong Kimi provider at revision 9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82](https://github.com/MoonshotAI/kimi-cli/blob/9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82/packages/kosong/src/kosong/chat_provider/kimi.py): preserves empty strings as thinking parts, omits None from thinking parts, and reconstructs thinking history. This generic Kimi SDK behavior supports distinguishing empty/present from absent/null; it is not a K3-256k guarantee that a missing reasoning tool response can be safely continued. We do not adopt fabricated placeholders or relax validation from this alone.

Full retrieved documents/source and content hashes are in the evidence sources index. HTML is a dated content snapshot, not a claimed release version; SDK source has an immutable commit. Other model families and user forum claims are not protocol oracles.

## Decision matrix (existing semantics retained)

| Observed reasoning | Final text without tools | Complete tool response | Continuation |
|---|---|---|---|
| absent throughout | Can pass existing final-text checks | Reject `kimi_reasoning_missing` | No failed message admitted |
| null only | Same as absent for assembly, distinct diagnostic count | Reject `kimi_reasoning_missing` | No fabricated string |
| empty string | Observed, length0 | Accept if all other protocol checks pass | Preserve exact empty string |
| nonempty string, one/many deltas | Assemble in order | Accept if other checks pass | Preserve exact private concatenation |
| invalid type | Reject `kimi_reasoning_invalid` | Reject | No admission |

Null/absent chunks preceding later string chunks do not invalidate a later observed string. Network byte boundaries do not change these semantics, including split UTF-8. Complete terminal and exactly one DONE remain required; partial arguments, incomplete tool identities, wrong finish reason and malformed envelopes fail. Successful tool responses alone execute tools. No thinking text becomes visible assistant content. Existing exact-message/session lineage rejects copied or altered continuation histories.

The new observer records fixed numeric counts/booleans and enumerated parser stage: delta reasoning types, observed assembly flag/character count, SSE event/DONE counts, finish kind, tool fragments/assembled/complete counts and usage presence/parsed flag. A missing/null-only stream is distinguishable from an observed string that fails later; partial observation stops at the actual failure stage. This is what the client decoded, not proof of server internals or network contents that never arrived. The observer receives a frozen detached snapshot; exceptions cannot affect admission or result. No body, arguments, IDs, unknown finish strings, credentials or reasoning text are included.

The evaluation Session attaches `structure` to existing exchange completion/failure rows. Accounting remains unchanged: valid outcomes retain Provider input/output; rejected/truncated responses keep unavailable canonical usage under existing policy. `usageParsed:true` on a later protocol rejection records that a usage object parsed, **not** that its values were retained or independently established as billable consumption. We do not reinterpret historical unknowns as zero or invent totals. This limitation is explicit; future changes to failure-usage retention would need their own tested semantics.

## Verifier preparation boundary

The frozen script prepares apt/curl, installs uv0.9.5 and asks uvx for Python3.13 plus pytest8.4.1/pytest-json-ctrf0.3.5 before invoking official tests. #88 ended while its log last reported CPython download, with no reward. Last log position cannot prove a network root cause.

One new cold-cache dependency-only control uses the original cached image, default bridge network, 2CPU/4GiB, no bind mounts or model credentials, and a single360-second window after container startup. It executes package preparation followed by `uvx --from pytest==8.4.1 -p3.13 -w pytest-json-ctrf==0.3.5 python -c` to print/import package versions. This deliberately changes the final entrypoint to avoid tests; it is not an official verifier run or exact replay. stdout/stderr and each stage duration/exit are retained.

No prewarm, cache mount, derived image or official environment modification is implemented. A future pre-download/cache proposal would change initial cache/environment state and must be versioned by Master before live comparison. A download success now neither repairs nor rescored #88, and does not guarantee the next network path. The precise next recommendation is to use these protocol observations in a fresh authorized live run and keep dependency preparation separately observable; only propose environmental changes after freezing their source/version/cache identity and comparability policy.
