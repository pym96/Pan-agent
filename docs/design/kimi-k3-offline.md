# Kimi K3 offline compatibility — WorkOrder #68

Builder candidate for [Criteria 1.0](https://github.com/pym96/Pan-agent/issues/68#issuecomment-5749462322), based on `05a4a8530f01d28aa38f8975f011d70a9ef096de`. Product lane; independent Verdict and H-K3-STATE/H-K3-LEAK Human reviews remain required. No live provider/account/quota/credential-source access or fees.

## Selection and composition

`pan-agent configure` offers `kimi-code:k3-256k` alongside the existing `deepseek` and `kimi-code` choices. This explicitly persists provider `kimi-code`, model `k3-256k`, low/high/max thinking (default high), and the existing credential-source reference. The old `kimi-code` choice and saved `kimi-for-coding` settings retain their previous identity and input sequence. No default migration occurs. Kimi `--model`/`--thinking` overrides remain unsupported: use configure. Explicit `--kernel native` remains required.

The actual CLI composes the selected profile. K3 sends `reasoning_effort` to the fixed `https://api.kimi.com/coding/v1/chat/completions` URL, without thinking-off, alternate endpoint, fallback, retry or client impersonation. Profile validation rejects unsupported models/efforts and extra endpoint fields before transport or credential access.

## Private continuation

[The adapter](../../typescript/src/providers/kimi/pan-kimi-model-adapter.ts) assembles private reasoning fragments separately from public text and ToolCalls. Only a complete protocol-valid response can register continuation. K3 admits an optional post-finish empty-choices usage frame; legacy admission is unchanged. Absent usage/model/response ID stays unavailable; reported model identity is preserved independently of requested selection.

[Continuation storage](../../typescript/src/providers/kimi/kimi-continuation.ts) is an adapter-local private WeakMap keyed by the exact admitted assistant object. Each entry binds the session ID, a canonical message digest, the exact preceding message objects via WeakRefs plus their digests, and the exchange cancellation signal. Identical text is insufficient. Copies, changed messages/ancestors, sliced history, foreign session IDs, new adapter/profile instances and cancelled entries refuse before transport. Canonical ToolResult correlation is validated before encoding. Missing tool-call reasoning is rejected, never synthesized; an explicitly returned empty reasoning string is preserved as observed.

No private field is added to canonical messages, events or archives. Disposal clears the map and aborts an active exchange. CLI binds disposal through the existing Session `cleanup` callback. Programmatic owners of a K3 adapter must likewise supply `cleanup: () => adapter.dispose()` when constructing their GeneralAgentSession, and use a new adapter for a new provider/profile. Without that explicit ownership callback the existing generic Session interface does not dispose injected resources automatically. Weak references avoid retaining message objects after their owner is released; they do not assert deterministic garbage collection or memory erasure.

Transport wait and byte-stream reads settle on cancellation without waiting for another chunk. A late response cannot register continuation or execute tools. The existing Kernel, authorization, TUI and sealed replay implementations are unchanged. Finite provenance checks are not a general hostile-JavaScript security boundary.

## Source provenance

Official HTML fetched 2026-09-20; exact UTC retrieval times, URLs, response URLs and hashes are in the external evidence `official-sources/manifest.json`:

| Source | SHA-256 |
| --- | --- |
| [Model configuration](https://www.kimi.com/code/docs/en/kimi-code/models.html) | `ba3456c3c9078d9f16fa4fddeeb5554aec734cca92edafd6743861d7e0e8b437` |
| [Error reference](https://www.kimi.com/code/docs/en/kimi-code/error-reference.html) | `c11e9339eeb52f6336fc3fc021c834c1bfe47597348386f969d759b44b4b0603` |
| [Overview](https://www.kimi.com/code/docs/en/) | `ab22aa042748cf36ddd7fe3dac8b036148e7b257b4e8c3a0bf30823434ab31af` |

These sources support the frozen K3 interpretation. The overview distinguishes China `.com` and overseas `.ai`; this contract retains `.com` only. Current documentation describes changes to the server alias `kimi-for-coding`; #53's old fixtures/source hashes are retained as a legacy deterministic compatibility path, not a claim about current live behavior. No account acceptance, entitlement, remaining quota or persistent model identity is established.

## Reproduction and evidence

- [Frozen synthetic wire](../../scripts/fixtures/kimi/kimi-k3-wire-v1.json): interleaved private/public UTF-8, final, single/multiple calls and trailing usage.
- [Focused tests](../../typescript/test/kimi-k3.test.ts): every single byte split, exact association, identical-text/foreign/tampered histories, missing/malformed/truncated material, canaries/status matrix, blocked cancellation and disposal.
- [Installed verifier](../../scripts/verify_kimi_k3_consumer.py): Node 22.19.0, committed clean candidate, two offline builds with equal normalized files, fresh offline production install, guarded real configure/restart/task/replay in separate processes for each effort, installed rerun of the focused matrix and a network guard negative control. Synthetic request captures explicitly contain synthetic private reasoning; Authorization is checked in memory and redacted from evidence.
- [Scope checker](../../scripts/check_workorder_68_scope.py): allowlist plus byte equality of all other base files. The single prospective #53 test migration changes only the diagnostic for rejecting an unsupported Kimi model; all historical assertions and fixtures remain.

Run `python3 scripts/verify_kimi_k3_consumer.py --node /path/to/node-v22.19.0/bin/node --output /fresh/evidence/path`. The required Product, conformance, Reference, Python, unchanged #49/#60/#61/#62 installed regressions and host checks are separately recorded in the SHA-bound Handoff. Source and installed matrices share assertions and are Builder evidence, not independent review.

Primary evidence destination: `/Volumes/WD_BLACK/pan-agent/wo68-kimi-k3-offline-20260920/`. No project fact, benchmark result, resume claim or live authorization follows from these offline checks.
