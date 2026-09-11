# Kimi Code through the installed Native product | WorkOrder #53

Status: Builder candidate, pending independent Regulator review. [Activation](https://github.com/pym96/Pan-agent/issues/53#issuecomment-5634364614) freezes Criteria-Version `1.0`, C-KIMI-01…06, on accepted base `9934dc9740d3a1f4750bf3a933488d30bd08ac02`. Parent: [Preview Spec #50](https://github.com/pym96/Pan-agent/issues/50).

## Frozen protocol choice

Kimi Code's official **OpenAI-compatible** API only: base `https://api.kimi.com/coding/v1`, endpoint `/chat/completions`, fixed model `kimi-for-coding`. The Anthropic-compatible `/messages` endpoint described by the same documentation is deliberately out of scope and rejected before transport construction (`kimi_endpoint_not_supported`). Source snapshots are hash-pinned in [`kimi-profile.ts`](../../typescript/src/providers/kimi/kimi-profile.ts) (`KIMI_OFFICIAL_CONTRACT`) and retained in candidate evidence (`official-sources/` + SHA256SUMS). A documentation retrieval is not a model call; no Kimi inference/account endpoint was contacted.

## Design

- [`kimi-profile.ts`](../../typescript/src/providers/kimi/kimi-profile.ts): fixed model identity + pinned source hashes.
- [`kimi-transport.ts`](../../typescript/src/providers/kimi/kimi-transport.ts): Pan-owned transport; construction inert; credential resolved only in `send()`; default source reads `KIMI_API_KEY`; missing key is the explicit `kimi_credential_unavailable`; the frozen base URL is not an option.
- [`pan-kimi-model-adapter.ts`](../../typescript/src/providers/kimi/pan-kimi-model-adapter.ts): canonical Context → OpenAI-compatible SSE request (system/user/assistant/tool roles, tool definitions, `tool_call_id` correlation); streamed admission with exact tool-call accumulation, ordering and JSON validation; **usage absent stays unavailable** (never fabricated); finish set `stop|length|tool_calls|content_filter`; `reasoning_content` in a response is a protocol rejection, and requests never carry DeepSeek-only fields (`thinking`, `reasoning_effort`, `reasoning_content`). Provider errors classify by status only — the error body is read for containment but never parsed into detail. No continuation state: every exchange is self-contained.
- Settings/wizard/CLI: `kimi-code` is now a selectable provider with the fixed model; thinking stays stored-but-inert for Kimi; `--model/--thinking` flags with a kimi-code selection fail explicitly; credential env is `KIMI_API_KEY`; the Keychain account convention gains `kimi-code-key`. DeepSeek behavior is unchanged.

## Verification assets

- [kimi-wire-v1.json](../../scripts/fixtures/kimi/kimi-wire-v1.json): frozen wire transcripts (four task exchanges with fragmented SSE, missing-usage, malformed, error bodies with canary text).
- Unit matrix [`kimi-adapter.test.ts`](../../typescript/test/kimi-adapter.test.ts): request shape/no-DeepSeek-fields, every-byte-boundary fragmentation, ordered multi-call correlation, missing-usage, malformed/duplicate/orphan rejections, status-only error classification, cancellation before admission (zero tool starts, one cancelled terminal, sealed archive).
- Installed drivers ([fixtures/kimi/](../../scripts/fixtures/kimi/README.md)): task driver through the real adapter over scripted wires; boundary probe (capture-only fetch; canary reaches exactly the authorization header); provider-switch driver (fresh session, no DeepSeek history in the first Kimi request, old run replays with zero exchanges/effects); interactive demo driver.
- [verify_kimi_consumer.py](../../scripts/verify_kimi_consumer.py): clean-consumer orchestration (double build, exact offline install, executable probes, kimi configure/restart/task/replay, boundary, switch, matrix, canary scans, zero meters).
- [demo_kimi.mjs](../../scripts/demo_kimi.mjs): Human two-phase demo — configure kimi-code, restart, wired offline task through the real adapter.
- [check_workorder_53_scope.py](../../scripts/check_workorder_53_scope.py): exact inventory, byte-identical protection, 130 prior obligations + 7 added + 1 authorized retitle (kimi availability supersedes #52's explicit-unavailable), no-DeepSeek-delegation source scan.

## Criterion and evidence map

| Criterion | Evidence and oracle |
|---|---|
| C-KIMI-01 | captured request bodies (model, no DeepSeek fields, canonical roles/tools/correlation); boundary probe URL/authorization; pinned source hashes; endpoint/unknown-model rejections |
| C-KIMI-02 | unit fragmentation matrix (every byte boundary, UTF-8 splits); multi-call ordering/correlation; missing-usage unavailable; malformed fixtures → one attributable failure, zero tool effects |
| C-KIMI-03 | per-run canaries; zero meters; header-only boundary capture; status-only error table; whole-tree canary scan; Human review |
| C-KIMI-04 | unit cancellation: abort before the release latch, zero tool starts, marker absent, exactly one cancelled sealed terminal; Human review of the redacted record |
| C-KIMI-05 | switch driver: two-run archive, first Kimi request has system+task only, old run replays with zero exchanges on either provider |
| C-KIMI-06 | clean-consumer orchestration; Product/Reference/conformance/Python suites; host outer gate; scope audit; `git diff --check` |

## Honest limits

macOS + Node 22.19.0, TTY; the Kimi path is proven offline against frozen wires — no real Kimi account, call, balance or fee was contacted or authorized; Anthropic-compatible endpoint out of scope; thinking levels do not apply to `kimi-for-coding`; trusted-local is not a sandbox; no npm publication.
