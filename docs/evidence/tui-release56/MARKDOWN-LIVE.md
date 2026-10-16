# Criteria1.9 — direct installed CLI, real streamed Markdown

Builder evidence, not independent acceptance. [Contract](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6210468298), base `dbf52c2e16b8dffaa2fde02bb694672ad656ec76`. Product code and v0.1.4 package are unchanged; writes are documentation/capture only.

## Ordinary user path and identity

The published GitHub v0.1.4 tarball was downloaded afresh with its public SHA256SUMS, verified as `f18787dbe39c9fb37aae0f305cb24a2056f948c9959c68182a6a657fcc465eff`, then installed into a fresh consumer with an empty npm cache using `--offline --omit=dev --ignore-scripts`. All 90 package files match the tar contents byte for byte.

Recorder starts `node CONSUMER/node_modules/pan-agent/bin/pan-agent.mjs --kernel native --workspace WORKSPACE --memory-root ARCHIVES` directly under a real 120×38 PTY. No imports of CLI helpers, Faux, provider adapter replacement, startTui injection, hooks or runtime monkeypatches. Ordinary settings JSON selects Kimi Code/k3-256k/high/environment credentials, the same settings supported by configure; credential is inherited only through the existing secure environment. No credential in argv, settings or media. Host is macOS arm64, Node v26.7.0.

Normal package source route: `providers/kimi/pan-kimi-model-adapter` sends `stream:true` and forwards `delta.content` through `onProgress`; presentation forwards that progress to DailyWorkspace; its active assistant text is projected through `markdownRows` at draw time. The released normal path already implements this; no production fix was needed.

## One live outcome

Run `9d9a8c9d-5e57-45f9-9538-2fbe36c697e8`, recording start 2026-10-16T07:38:14.470007Z. One harmless bilingual formatting prompt; one model turn; completed; zero tool records. Usage: input 1,092, output 734, total 1,826; reported usage, none unknown. No task/workspace modifications, server/Docker operation or benchmark run. No retry or second submitted prompt.

Raw PTY reconstruction shows the first formatted heading with `Responding · provisional` at **5.544481s**, still-visible provisional state at **23.445556s**, and first completed frame at **24.462022s**. This is evidence of rendering during actual progress, not a replay or completed-response fixture. `analyze_markdown_live.py` reproduces these observations and package identity from raw capture and nested archive records.

Original recorder checkpoint counters inspected the outer archive envelope instead of its `record` field; consequently its settled/terminal counters are invalid, including after completion. The original report and exact executed recorder are preserved unchanged. They are **not used as proof of streaming or zero tools**. Corrected analysis independently unwraps records and reconstructs displayed PTY states; it establishes one model turn and zero tool records. The checked-in recorder unwraps records correctly for future captures. No new model call was made to replace this evidence.

## Media verification

Video uses the contiguous raw PTY interval **0–28.9s at 1×**, with no gaps, held frames, artificial pacing, replay or synthetic response. Three explanatory subtitle scenes are mapped in [edit map](../../demo/tui-release56/markdown-live-edit-map.json). Last scene begins at24.5s, after the first completed frame. MP4:1920×1080,10fps,28.9s. Chinese captions match the UTF-8 SRT. CJK font fallback and terminal-cell positions preserve readability; raw capture remains available for comparison.

Privacy checks found no credential bytes in raw capture. Public frames show only the harmless prompt/answer and generic disposable workspace paths. No private provider reasoning is printed. The transient partial response and final code block were visually inspected for clear text and captions. Package/runtime files remained unchanged; no new full regression was needed for docs/capture-only work.

[Manifest](markdown-live-manifest.json) binds original installed-package download, raw capture/archives, uncorrected recorder/report, corrected derived verification, preview frames, rendering map/helper and release assets. Private durable root supplied in Handoff. Release v0.1.5 contains video/SRT/SHA256SUMS only; installation continues to use public v0.1.4. Old releases, offline comparison and historical scores are untouched.

## Learning note (§17–18)

Human's clarification exposed a demonstration gap: offline fixture screenshots proved rendering but did not show a normal user receiving real streamed output. Builder verified the released source route before assuming a product defect, then tested the ordinary install/config/start path once. Evidence showed rendering already worked in that path, so the change stayed in recording and documentation. The recorder's envelope mistake reinforces why UI observations and raw archive records need separate checks. Human supplied the requirement, Builder recorded/verified the path, Kimi generated the response, and independent Regulator decides acceptance. No new performance or resume-fact claim.
