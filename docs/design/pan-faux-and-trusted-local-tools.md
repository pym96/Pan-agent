# Pan deterministic Faux Adapter and trusted-local Tools

Current #34 transition: `typescript/` is Product with required explicit `--kernel native`; omission fails before setup. Pi integration is independently installed Frozen Reference under `references/pi/`. Prior default-Pi descriptions below record the accepted #28–#33 baseline, prospectively superseded for selection/package placement by [ADR-0017](../adr/0017-product-isolation-and-frozen-pi.md). Core behavior and historical Evidence are unchanged. #29/#35/#36 remain separate.


Status: WorkOrder #32 accepted after independent Verdict and explicit Human C-PFREE-B104 review; landed unchanged at `2ed4cee780e36f1e33845d66b9065381f775d6d2` on 2026-09-07.

Criteria-Version: `1.0` (`C-PFREE-B101`…`C-PFREE-B107`).

## Outcome and boundaries

This tracer bullet supplies concrete Pan-owned implementations behind WorkOrder #31's accepted semantic contracts:

- [`faux-model-adapter.ts`](../../typescript/src/providers/faux/faux-model-adapter.ts) implements `ModelAdapter` from canonical scripted outcomes;
- [`pan-trusted-local-tools.ts`](../../typescript/src/tools/pan-trusted-local-tools.ts) implements `AgentTool` for `read`, `write`, `edit`, and `bash` using Node platform APIs;
- explicit `native` composition receives those Pan Tools directly, without the Pi Tool adapter;
- `PiKernel` remains the default; WorkOrder #33 separately replaces explicit Native's Provider bridge without changing these accepted Tool/Faux semantics.

Neither Pan module imports, aliases, dynamically loads, copies, or delegates Pi code. This slice does not remove or change the pinned Pi dependencies and does not claim a Pi-free installed package.

## Deterministic Faux semantics

Each admitted `exchange` validates canonical Context and Tool definitions, records a semantic request snapshot, increments the exchange count once, and consumes at most one immutable script entry. Entries are canonical responses, typed failures, or an explicit pending exchange. A pending entry settles as typed cancellation when its `AbortSignal` fires; a signal already aborted consumes and records nothing. Exhaustion returns the same typed `faux_script_exhausted` failure without moving the cursor.

The Adapter owns no Provider envelope, HTTP/SSE path, credential lookup, clock, or random source. Two fresh instances given the same script and semantic requests therefore return the same outcomes, counts, cursors, and recorded Context.

## Product Tool semantics

All four Tools expose a non-empty identity and description, an object schema, pure Pan validation, cancellation-aware execution, and a canonical typed result. NativeKernel resolves Tool identity, validates arguments, preflights correlation and the whole batch budget, and checks effective cancellation before calling an implementation.

- `read` returns exact UTF-8 text, optionally selected by one-indexed line offset and positive line limit;
- `write` creates parent directories when needed and writes the requested UTF-8 content;
- `edit` first resolves every non-empty target against the original bytes, requires each target to be unique and non-overlapping, and writes only after the entire edit plan is valid;
- `bash` invokes `/bin/bash -c` with the selected workspace as cwd and retains stdout, stderr, exit code, signal, status, and command in the canonical result details. A nonzero exit is an error ToolResult rather than a Harness exception.

Relative paths resolve from the selected workspace. Absolute paths remain valid. This is deliberately labelled **trusted-local**: effects have the current host user's authority, and the workspace is a cwd/relative-path base, not filesystem containment, network isolation, Docker, or an OS sandbox.

## Environment and cancellation

The shell receives only the documented ordinary allowlist: `HOME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, `TMPDIR`, and `USER` when present. Ambient Provider credential variables are not inherited. This lowers accidental secret exposure but is not an adversarial security boundary.

On POSIX, each shell starts as a detached process group. Active cancellation sends `SIGTERM` to the group and then escalates to `SIGKILL`; settlement remains attributable as cancelled/error. The focused high-risk probe starts a descendant that would write a delayed marker, cancels the active Tool, and requires that marker to remain absent immediately and throughout the full post-settlement `1000 ms` window. Final release of C-PFREE-B104 still requires the WorkOrder's independent different-model-family Regulator or explicit Human review.

## End-to-end tracer and limits

[`pan-faux-tools.test.ts`](../../typescript/test/pan-faux-tools.test.ts) drives `GeneralAgentSession → NativeKernel → Faux/Tools → canonical Events → sealed Run Archive`. It covers immediate final, read→write→edit→bash→final, multiple ToolCalls in declared order, typed model failure, pending cancellation, exact model-turn exhaustion, atomic Tool-step exhaustion, invalid admission with zero implementation effects, environment filtering, nonzero shell exit, and descendant cancellation.

These deterministic checks use temporary workspaces only. Provider calls, credential reads, balance queries, paid/formal Runs, and cost are `0 / 0 / 0 / 0 / CNY 0`. This accepted slice created no Provider result, benchmark claim, Verified Project Fact, Wiki fact, resume fact, live readiness claim, dependency-removal claim, or default-cutover decision.
