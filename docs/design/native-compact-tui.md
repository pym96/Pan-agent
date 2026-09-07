# Native compact TUI — WorkOrder #42 candidate

Contract: [v1.0 activation](https://github.com/pym96/Pan-agent/issues/42#issuecomment-5569544327) plus [Criteria-Version 1.1 amendment](https://github.com/pym96/Pan-agent/issues/42#issuecomment-5569953515). Base: `75de6de21c4f0c5e0a93c7a4143c5ecf94d92358`. This document describes a Builder candidate, not accepted project facts. C-TUI-05 independent/high-risk review and C-TUI-07 Human trial remain outstanding.

## Use the actual offline demo

From an exact candidate checkout, build once using the unchanged pinned development dependencies:

```sh
npm --prefix typescript ci --ignore-scripts
npm --prefix typescript run build
node scripts/demo_tui.mjs
```

For an already installed retained artifact, no build or installation is needed:

```sh
node scripts/demo_tui.mjs --package /absolute/path/to/consumer/node_modules/pan-agent
```

Handoff provides one fully resolved command binding the candidate script and retained installed package. The demo composes actual Product `runCli`/`runTui`, Native Session and real Pan write/bash/read Tools with `FauxModelAdapter`. It cannot fall back to DeepSeek. It creates disposable workspace/memory under the temporary directory and prints their retained location. It does not remove records on exit. `--package` chooses local compiled Product bytes, never a network package name. Use Node 22.19.0 or later; the tested floor/platform is Node 22.19.0 / Darwin arm64.

Confirm `y`, then enter any ordinary task (or `frozen`) for the fixed hello.js → node hello.js → read hello.js sequence. The expected source is `console.log("PAN_PACK_OK");` plus LF, stdout includes `PAN_PACK_OK`, and final answer is `verified PAN_PACK_OK`. All responses are scripted, regardless of how the task is worded. The selected Faux model and host-user shell authority warning remain visible. Existing real DeepSeek CLI options/defaults stay unchanged and are not invoked by Builder checks.

Other demo tasks:

| Input | Actual path |
|---|---|
| `long` | Real bash emits line-001 through line-200; inspect all lines with `:details` |
| `error` | Real read fails on a missing file; the next Faux exchange returns an explicit model_error |
| `cancel` | Faux waits on the existing cancellation signal; press Ctrl-C, then submit another task |
| `:details` | Full permitted selected-run fields in terminal scrollback |
| `:runs` | List healthy archived runs; corrupt manifests receive individual local diagnostics |
| `:replay RUN_ID` | Verified retained records only; selects the replay for subsequent details |
| `:context`, `:help`, `:exit` | Inspect Context size, show commands, or exit |

## Display and input semantics

Native CLI explicitly opts into compact presentation; existing exported renderers and omitted `runTui.presentation` retain legacy/Reference behavior. The [TUI source map](../../typescript/src/tui/README.md) separates projection, input editing and Session lifecycle wiring. Runtime, tool implementations and persistence are unchanged.

Progress names an admitted tool and an encoded path/command preview. Success/error appears only after the actual ToolResult; compact tool-body preview is zero lines. Intermediate public model text belongs in details. The full final public answer is framed once at live settlement; a non-completed retained answer is labelled partial. Each framed data line starts with `│ `, so an embedded LF cannot create an unframed status/prompt line.

Controls are visibly and reversibly escaped as `\uNNNN`, including C0/C1/DEL, ESC/CSI/OSC, CR/backspace, bidi controls and Unicode line separators; literal backslashes are doubled. Ordinary Unicode remains readable. Identifier preview encodes first, retains at most 80 Unicode code points, never splits an escape token and appends `…` when shortened. This is a code-point policy, not a cell/grapheme/token budget. Details retains the complete permitted identifier. Canonical outer fields are explicitly selected; hidden envelope fields are never dumped. Public argument JSON excludes restricted envelope-key names recursively. Tool metadata uses a fixed whitelist of the existing Pan fields. This is not a universal scanner for secrets copied into public text.

At idle, Enter submits one nonblank task or local command. While running, text remains a draft; Enter displays a busy message and retains it, including its cursor. A new Enter after idle is required. Ctrl-C while running requests existing Session cancellation; at idle or confirmation it exits. Progress clears and redraws the draft using renderer-owned terminal controls only for TTY streams. Non-TTY output has no ANSI styling. Scrollback operation is tested at 80×24 and 40×12; other terminal widths, emoji clusters and terminal-specific cell-width conventions are not universally certified.

## Counts and archive provenance — v1.1

| Label | Source |
|---|---|
| `工具已返回 N 次` | Count tool.settled records in this Run, including returned errors |
| Details `工具接纳数` | Exact live TaskRunResult.toolCalls; replay: unavailable (not recorded) |
| Details `工具启动事件数` | Count tool.started; does not prove implementation execution |
| Details `工具返回数` | Same tool.settled count as compact |
| `模型调用` | Exact live TaskRunResult.modelCalls; replay: unavailable (not recorded) |
| Details model start/return event counts | Count explicitly labelled source events, never substituted for modelCalls |

No count accumulates across runs or repeated views. Incomplete sequences show unavailable rather than a complete zero. Replay discards cached live result counters even in the same process. There is no durable UI sidecar. A 2-call or 3-call batch cancelled at its first tool.started has live admissions 2 or 3, one start event, zero tool results and zero tool implementations; both archives have unavailable admissions/modelCalls. Only this explicitly missing-result-counter difference is authorized between live and replay. All other C-TUI-01/04 predicates remain. C-TUI-02/03/05/06/07 are unchanged from v1.0 and bind v1.1.

## Verification and prior obligations

The [machine-readable map](workorder-42-obligations.json) preserves every prior Product test title and logical obligation. Only the real Native TUI input prompt and current-assignment heading change in prior presentation tests. The four #41 migration tests execute unchanged fidelity/graph predicates and negative controls against a disposable exact #41 source snapshot. Original #34/#35/#41 scripts and the relocation map remain byte-identical. The new current-slice checker protects all other baseline bytes and reuses the unchanged graph checker on current source.

```sh
npm --prefix typescript run check
npm --prefix typescript run conformance
npm --prefix references/pi run check
npm --prefix references/pi run conformance
node scripts/check_tui_scope.mjs
node --experimental-strip-types scripts/verify_tui_execution.mjs /absolute/new/execution-evidence
python3 scripts/verify_tui_pty.py --node /absolute/node22/bin/node --output /absolute/new/pty-evidence
python3 scripts/verify_tui_consumer.py --node /absolute/node22/bin/node --output /absolute/new/consumer-evidence
python3 scripts/verify_tui_demo.py --node /absolute/node22/bin/node --package /absolute/consumer/node_modules/pan-agent --output /absolute/new/demo-evidence
```

The consumer verifier retains two builds, normalized exact file bytes/modes, tarball hashes, offline production install, installed bin cases, original tracer execution/Context/file/archive assertions, module/filesystem/network/credential guards and their negative controls. Its added fresh process uses installed CLI/TUI against success and cancelled archives, blocks task-file reads, checks unknown/corrupt diagnostics and preserves sealed bytes. Package API compatibility is checked by `scripts/check_tui_public_package.mjs` with the unchanged typed client against both tarballs. Without-Python, Python 259 and authorized outer-host gates remain required; the original-host PDF whitelist failure is reported separately. No validator/pin edits or original-file exclusions are authorized.

## Independent and Human gates

Builder logs/demo observations do not satisfy C-TUI-07. The project Human must personally run the immutable candidate and record all five yes/no answers: active/finished tools and final answer identifiable; full details accessible; error/cancellation recognizable with usable input; history/replay accessible without execution; default structure concise without raw debug output. Retain candidate SHA, command and transcript/screenshots. The separate C-TUI-05 high-risk gate needs a different-family review or explicit Human review of the named actual control/marker outputs; ordinary demo approval does not implicitly satisfy it. Independent Regulator adds probes and verifies the exact remote SHA/artifact. Builder stops after Handoff; Master alone can land accepted bytes.
