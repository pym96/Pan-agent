# Criteria1.8 — Markdown presentation only

Builder evidence for independent review. [Contract](https://github.com/pym96/Pan-agent/issues/56#issuecomment-6209671333), base `bc63f708687988533387ec3e0bcc96a17138ed21`. No provider/runtime/tool/archive implementation changed. Candidate version 0.1.4; prior releases remain immutable.

## Implementation and boundaries

`typescript/src/tui/markdown.ts` projects assistant text into sanitized grapheme/cell rows with source offsets and fixed style identifiers. DailyWorkspace retains source-based scroll anchors and applies renderer-owned SGR only at terminal frame emission. Replay's final response uses the same function; its tool activity lines remain literal. No styles or transformed Markdown are stored. Regional-indicator flags and keycaps use two cells alongside existing CJK/pictographic handling. Empty `NO_COLOR` is now respected as present; `TERM=dumb` disables styles. Non-TTY presentation is untouched.

Subset: ATX headings, unordered/ordered lists, paired bold, single-backtick inline code and backtick/tilde fences with language labels. Unsupported syntax is readable fallback, not full CommonMark. Fenced code contents are not parsed as inline Markdown. Partial delimiters do not throw or hide content. No third-party dependency was added.

## Checks and installed evidence

- `npm --prefix typescript run check`: typecheck and all 213 tests passed at the initial implementation checkpoint. After adding the dedicated approval/TERM=dumb negative case, final typecheck and all five Markdown-specific tests passed. Existing daily-workspace/scroll/permission regressions are included in the full check.
- Positive/negative tests cover headings/lists/bold/code, all prefixes of a representative streamed response, open fences, unsupported syntax, CJK/emoji long code at 10/37/77/117 columns, source-anchor ordering, escaped ANSI/OSC/control/bidi text, literal tool/user/approval text, resizing, NO_COLOR/TERM=dumb and replay immutability.
- Built tarball installed with `--offline --omit=dev --ignore-scripts` into a fresh consumer using an empty npm cache. No runtime dependencies or compiler required for consumer.
- Actual PTY fixture run `9049c163-5458-40ed-a8bd-73681d21695a`: one **local scripted Faux exchange**, zero real provider/tool/network calls. Raw archive keeps original Markdown. Partial and settled screenshots are recorded.
- Actual old v0.1.0 and new v0.1.4 TUI replay captures use that exact same archive. All replay reports show zero scripted exchanges, provider calls, tool calls and network calls; archive hashes unchanged. Color and NO_COLOR captures retained.
- New installed package also replayed prior real Harbor run `14386b01-4934-4e58-b981-615bc60d341c` through the existing non-TTY guard: provider/tool/fetch 0/0/0, original archive unchanged. No new paid model call, Harbor evaluation or server operation.

Package SHA256: `f18787dbe39c9fb37aae0f305cb24a2056f948c9959c68182a6a657fcc465eff`. Source fixture, real PTY raw/cast, screenshots, guards, logs and package are bound by [manifest](markdown-manifest.json). Private durable artifact directory supplied in Handoff; public release assets are the package, two before/after images and SHA256SUMS. [User documentation](../../demo/tui-release56/MARKDOWN.md).

## Presentation and learning notes (§17–18)

Human asked to improve assistant readability while closing the TUI project. Builder chose a small presentation-only subset to keep the install free of runtime dependencies and avoid touching execution records. Separating sanitized cells from emitted ANSI prevents model strings from becoming terminal commands; applying styling only to assistant projections avoids changing how permission details look.

The first PTY recorder hit EIO while trying to send an exit key after the application had already exited with code 0. Its original capture/report remain retained; recorder handling was corrected without changing product behavior or generating another live fixture task. The first screenshot inherited NO_COLOR and used a font without some symbols. Those captures remain diagnostics; subsequent replay-only captures explicitly request color and use local font fallback. The pyte screenshot emulator can show a base emoji glyph rather than the full joined glyph; raw terminal output and cell-width tests retain the full sequence. No fake screen or live model result was introduced.

Human supplied direction; Builder implemented rendering/tests/capture; Regulator independently assesses the candidate. This change makes no benchmark-performance or resume-fact claim. macOS arm64/Node v26.7.0 was exercised; other platforms and exact minimum Node version remain unverified.
