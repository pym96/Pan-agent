# Criteria1.11 — missing-credential feedback

Builder evidence for independent review. [Contract](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6211767310), base `8d592dfa3c086e368239f6b60f4eebcaa2811f85`. Earlier independent [Criteria1.10 failure](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6211864280) remains recorded: install and configure passed, missing-key usability failed. Previous live recordings copied ordinary settings and did not prove the first-use missing-key case.

## Cause and narrow fix

Kimi transport raises stable `kimi_credential_unavailable` before fetch; the adapter returns an authentication failure, and NativeKernel preserves it in `model.turn_settled.failure`. DailyWorkspace discarded this detail and displayed only `Partial response · model_error`. The CLI knew the credential source but did not pass it to the TUI.

The CLI now passes a nonsecret optional credential-source field to presentation. A small whitelist maps exact provider/category/missing-credential codes to fixed guidance. DailyWorkspace adds a separate literal `Notice · Configuration required`; it remains visible after task settlement/redraw. Environment guidance names the correct Kimi/DeepSeek variable, explains exit/set/restart and configure, and warns not to paste keys into a task. Keychain/unknown-source guidance does not name an environment variable. Unknown or mismatched errors produce no new detail and retain the generic failed status. Arbitrary provider error text is never interpolated.

No provider transport/protocol, runtime, authorization, tool execution, retry or archive implementation changed. Notice is only a display entry and is not added to conversation messages or stored model text. The shared scroll tests now derive their fixture Entry type from DailyWorkspace to include the literal Notice role.

## Red/green and package checks

- Deterministic red test used actual default Kimi adapter/transport with environment key removed and fetch guarded. Before the fix, final TUI frame lacked KIMI_API_KEY/configure and showed only model_error. Original red log retained.
- After fix, same path passes: visible variable/configure guidance after redraw, noncompleted archived outcome, zero fetch and no tool events. Exact-code/provider/category/source checks cover DeepSeek, Keychain, unknown source and arbitrary secret-looking error details; actual workspace negative confirms raw details never appear.
- Full typecheck and **217 tests passed**. No paid Builder model call was used.
- Prebuilt v0.1.6 package installed offline into a fresh consumer/empty npm cache. Actual installed `configure` PTY selected Kimi K3/high/environment without copying settings; restart retained preferences. Blank submission created no run; missing-key submission displayed the new notice and remained model_error with zero tool events. Regulator owns the separate authorized real-key end-to-end check.
- The new installed package replayed prior real Harbor archive `14386b01-4934-4e58-b981-615bc60d341c` through the zero-effect guard: provider/tool/fetch 0/0/0, archive unchanged.

Package SHA256 `0f7360271e22c5477bf6842816e56abaf31cc9d8da4c97677311d6bb72c7b0ea`. [Artifact manifest](credential-manifest.json) binds package, red/green logs, actual configure/missing-key PTY, replay guard and helper. Private durable root supplied in Handoff. Release assets: package + SHA256SUMS. Old release identities remain unchanged. Tested macOS arm64/Node v26.7.0; exact minimum Node and other platforms not newly certified by Builder.

## Learning note (§17–18)

Human asked whether installation/configuration was actually usable. Independent Regulator exposed a negative path that successful API demonstrations had missed. Evidence showed authentication detection was already correct; the defect was presentation losing a safe error code. Builder kept the failure semantics and added a whitelist with configuration-source context instead of dumping errors or changing credentials/retries. The first reused PTY helper again hit post-exit EIO after the wizard saved settings; raw diagnostic evidence remains. The helper was hardened. A later assertion missed a wrapped word, and one invocation used Python without the optional pyte capture dependency; these diagnostic captures remain. The successful `pty-final3` probe used a fresh isolated HOME and the existing capture environment. No secret or normal user settings were changed. Human requested usability, Regulator found the gap, Builder implemented the correction; acceptance and publication remain separate.
