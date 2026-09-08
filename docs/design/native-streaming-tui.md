# Native public text streaming — WorkOrder #44 candidate

Contract: [Issue #44](https://github.com/pym96/Pan-agent/issues/44), [activation](https://github.com/pym96/Pan-agent/issues/44#issuecomment-5579434691), Criteria-Version **1.0**, C-STR-01…07. Base `fd408c4ecd236cf97d509436085e4df461829e9e`. Implementation lane: Product. This document records the Builder candidate; it is not an independent Verdict or a claim about a live Provider.

## Interface and authority

The former completed-only `exchange(request): Promise<ModelOutcome>` could not expose text until the SSE source ended. The same operation remains authoritative. Its optional `onProgress(ModelTextDelta)` carries exactly `{type: "text_delta", text: string}`. Direct DeepSeek uses one incremental UTF-8/SSE decoder and the existing complete assembler for both observing and omitted callers. Faux optionally schedules an async fragment source before its original script entry settles. There is no second request, typing animation of a completed outcome, generic event bus or new loop.

Native adds `runId` and `turn`, filters the narrow payload and closes the route on abort, resolution or rejection. Session catches a synchronous progress exception separately from archive observation errors. `onProgressError()` receives no exception object or Provider data; CLI emits a fixed safe display diagnostic. Asynchronous or indefinitely blocking user callbacks are outside this synchronous sink contract. Canonical messages, usage, identity, ToolCalls and batch admission still come only from validated complete outcomes. Provider reasoning/unknown/auth fields never enter progress. Adapter-private reasoning continuation still supplies the next valid request.

The exact base distinction is retained: canonical protocol validation and step-budget admission are whole-response checks; concrete tool lookup/schema validation remains per call. An invalid canonical response starts no tool. A schema-invalid or unknown tool yields the existing error result; an earlier valid call in the same canonically valid batch keeps its original effect. The comparison includes both single invalid calls and valid-then-invalid batches. #44 does not silently change that baseline policy into a new all-tools schema preflight.

## Display, input and memory

`Responding… (provisional)` frames incremental public text. LF appears only inside data lines; controls, bidi controls, backslashes and unpaired surrogates have reversible display encoding. A split surrogate pair is buffered until resolvable. TTY rendering retains the editable draft/cursor and commits complete visual data rows so a long preview does not require moving above the viewport. Non-TTY output has no renderer CSI and frames any interleaved local diagnostic separately. Data language is unchanged; the [label/obligation map](workorder-44-obligations.json) distinguishes English UI substitutions from Chinese/Unicode payloads.

A normal streamed final body is retained in place and not printed again at settlement. An omitted-progress Adapter gets the full completed body once. Text preceding tools is provisional too. Failed/cancelled/length output retains an explicit unfinished label and the attributable terminal reason; a later failed preview is separate from an earlier accepted turn. Explicit details/replay may repeat data. Tool results count `tool.settled`, including errors; admissions, starts and model calls retain #42 v1.1 provenance. Missing archived admissions/model calls remain unavailable.

Progress never enters SessionObservation, Context, archive append, schema, hashes, seals or sidecars. Interrupted/unvalidated live preview is **not recoverable from this unchanged archive**. Archived views state that transient previews are not recorded without asserting one existed. Retained accepted partial/final data remains inspectable. Replay uses sealed records only, not task files, current process cache, model requests or tools.

## Reproduce the candidate

Use the full candidate SHA from the Handoff, a clean checkout and the retained official Node 22.19.0 Darwin arm64 toolchain. `NODE` below means its absolute `bin/node` path. Build dependencies must already be installed; there are no dependency or version changes.

```sh
npm --prefix typescript run check
npm --prefix typescript run conformance
npm --prefix references/pi run check
npm --prefix references/pi run conformance
bash scripts/check_typescript_without_python.sh
node scripts/check_streaming_scope.mjs
node --experimental-strip-types scripts/verify_streaming_execution.mjs /private/tmp/wo44-execution-NEW
python3 scripts/verify_streaming_consumer.py --node "$NODE" --output /private/tmp/wo44-consumer-NEW
python3 scripts/verify_streaming_pty.py --node "$NODE" --package /private/tmp/wo44-consumer-NEW/consumer/node_modules/pan-agent --guard /private/tmp/wo44-consumer-NEW/consumer/verification/guard.mjs --output /private/tmp/wo44-pty-NEW
python3 scripts/verify_streaming_baseline_pty.py --node "$NODE" --output /private/tmp/wo44-baseline-pty-NEW
python3 scripts/verify_streaming_demo.py --node "$NODE" --package /private/tmp/wo44-consumer-NEW/consumer/node_modules/pan-agent --output /private/tmp/wo44-demo-NEW
```

The consumer verifier retains two build inventories/tarballs, physical production package inventory, installed bin/client transcripts, real frozen `write/bash/read`, unchanged seals, fresh-process replay read traps, network/credential/module guards and negative controls. The streaming verifier copies only verification fixtures into that consumer, then runs actual installed CLI/TUI with synthetic DeepSeek Fetch or Faux. Pipe barriers prove prefix visibility while the exchange and source remain pending. A 15-second timeout is a deadlock guard, not a latency target. Byte/UTF-8/grouped partitions, 80×24/40×12 and non-TTY, cancellation before source EOF, late input, broken/malformed/identity/length outcomes, observer fault/control, busy Enter, actual blocking bash cancellation and subsequent explicit task are retained as raw reports, ordering markers and terminal bytes. Unit tests exhaust finite byte and logical delta splits, including JSON surrogate halves.

The semantic comparator uses 22 schedules × base/candidate × progress/omitted. It compares complete requests, outcome/usage/identity, Context, observations, tool arguments/results/effect order and decoded durable records. Only generated Run/Session IDs, known workspace prefixes and generated wall-clock timestamps above 1e12 are normalized with explicit correspondence. Status/payload/order/usage are never normalized. A changed status is detected as a negative control. The [map](workorder-44-obligations.json) retains all 83 prior test titles, copied-driver assertions and exact core wiring diffs. Historical #41 tests and #42 scope/probes execute at their accepted snapshots; the new checker protects the current graph and approved scope, with outside-scope and Runtime-default negative mutations.

## Human offline entry

The Handoff supplies a single identity-checking command bound to the full candidate SHA, retained tarball hash and installed runtime file inventory. It launches the following actual installed Product composition with a clean environment; no install or network occurs during launch:

```sh
"$NODE" scripts/demo_streaming.mjs --package /private/tmp/wo44-consumer-formal/consumer/node_modules/pan-agent
```

Confirm `y`; enter `frozen` to watch text before real fixed write/run/read effects. Enter `cancel`, wait for preview, then Ctrl-C; enter `broken` for a scripted source failure, then `frozen` again. `long`, `error`, `:details`, `:runs`, `:replay RUN_ID` and `:exit` are available. Disposable workspace and records are printed and retained. Replies are explicitly Faux/scripted; 80 ms fragment delays aid viewing only and are not the machine incrementality proof.

All real Provider/model calls, real credential reads, balance queries and paid/formal Runs are **0/0/0/0; CNY 0**. Injected Fetch requests and synthetic credential callbacks are counted separately. No live compatibility, default Kernel switch, npm publish, #43 work or independent acceptance is claimed. C-STR-03/05 require an independent Regulator plus different-model-family or explicit Human review of the named actual cancellation/effect and visibility/control outputs. A generic demo approval does not supply those safety reviews.

## Host and retained evidence

The original host's extra root resume PDF still causes its disclosed whitelist failure. The authorized outer gate uses a **new #44** disposable host copy, excludes only that copied PDF and project `.agents/`, `.claude/`, `skills-lock.json`, and preserves original files plus validator/config/required-file/reference identities. Candidate mode uses the full #44 SHA and accepted main anchor above. No #42 retained directory is changed. Handoff reports original-host failure separately from isolated-host checks; facts/Wiki/resume/old evidence remain untouched.
