# TypeScript Native Product

Status: #35 is accepted and landed at `97fb7db1574a240b1a689733bc1b56791879c6d6`; #41 Module relocation is a Builder candidate pending independent review. This package remains **Product**, with explicit Native selection and no Pi dependency. `references/pi/` remains **Frozen Reference**; its only #41 changes retarget Product imports and source locators.

One `GeneralAgentSession` owns admission and durable memory and delegates the same iterative semantics through AgentKernel to NativeKernel, using accepted Pan ModelAdapter, DeepSeek transport and trusted-local Tools. An explicitly supplied AgentKernel may enter this seam without exposing internal loop steps. #29 alone decides a future omitted-selector default.

## Install

From the repository root, install the exact dependency graph in `package-lock.json` without package lifecycle scripts:

```bash
npm --prefix typescript ci --ignore-scripts
```

Only TypeScript and Node type development dependencies are installed. Runtime uses Node built-ins. The lockfile pins package versions and registry integrity values; the package file inventory excludes reference code and dependencies.

## Installed JavaScript package

From this package directory, `npm run build` removes its own generated `dist/` and invokes pinned TypeScript `5.9.3` with `tsconfig.build.json`. `npm pack --pack-destination /absolute/path/to/artifacts` runs the same build in `prepack`; it includes `dist/`, `bin/`, this guide and `RUNBOOK.md`. The package remains `private: true`; this procedure does not publish it. `dist/` and generated tarballs are ignored build output.

Install the resulting `pan-agent-0.1.0.tgz` into a fresh consumer with ordinary Node `22.19.0` or newer:

```bash
npm install /absolute/path/to/artifacts/pan-agent-0.1.0.tgz \
  --omit=dev --offline --ignore-scripts --no-audit --no-fund
./node_modules/.bin/pan-agent --help
./node_modules/.bin/pan-agent --kernel native \
  --workspace /absolute/path/to/workspace \
  --memory-root /absolute/path/to/memory
```

The installed executable delegates to the compiled `runCli`. It has the same confirmation and Provider-use boundary described below. Decline confirmation to check startup without a model call. Accepted task submission requires an intentionally configured Provider credential; the #35 offline verifier instead injects the shipped Pan Faux at the existing API seam. No compiler, TS loader, Python, Pi, checkout link or install-time build is needed by the consumer.

The ESM exports are:

| Import | Shipped interface |
|---|---|
| `pan-agent` | `runCli`, `runTui`, Pan `FauxModelAdapter`, `GeneralAgentSession`, archive inspection, Runbook helpers and public declarations |
| `pan-agent/cli` | Existing CLI functions and types, including the `createNativeAdapter` and `startTui` option seams |
| `pan-agent/faux` | Pan Faux Adapter and its existing script helpers |

An external plain JavaScript verifier imports these exports, supplies a four-response Faux script to `createNativeAdapter`, and passes streams into the real `runTui` via `startTui`. It retains real ToolResults, Contexts and sealed archives; it does not supply another agent loop. The installed package README intentionally contains no repository-relative Markdown links, so it remains readable after packing.

#51 adds the newcomer-facing offline first task: in a repository checkout, `scripts/try_preview.sh` builds this exact artifact, installs it into a fresh consumer and starts the installed TUI with the scripted `preview-first-task/v1` round trip — offline/simulated, no Provider, credential or network. Repository checkouts carry the design and verification under `docs/design/preview-first-task.md`.

## Run the TUI

Choose an existing directory deliberately. It may be an actual project checkout or a disposable test workspace.

```bash
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
npm --prefix typescript run agent -- \
  --workspace /absolute/path/to/workspace \
  --memory-root /absolute/path/to/memory \
	--kernel native \
  --model deepseek-v4-flash \
  --thinking high
```

The initial profile is `deepseek-v4-flash` with `high` thinking. Product tasks must explicitly pass `--kernel native`. Omission fails with exit 2 and `kernel_selection_required`; Pi fails with `kernel_not_in_product`; unknown selectors fail validation. These paths and `--help` perform no setup. `deepseek-v4-pro` and the listed thinking levels are explicit alternatives. `--memory-root` is required and must be disjoint from the workspace; it holds the durable three-lane memory (below). Construction, `--help`, confirmation rejection, blank input, `:help`, `:context`, `:runs`, `:replay RUN_ID`, and `:exit` make no Provider call. The first non-empty task submitted after confirmation is the first Provider call.

Each task returns control to `Task>` and the next task continues the selected Kernel's typed transcript. `:context` reports the retained message count and owner. Ctrl-C during a task requests Kernel cancellation; Ctrl-C at the prompt closes the TUI.

## Trust boundary

`bash` is labelled **trusted-local**. It runs directly as the current host user. `--workspace` establishes the default cwd and relative-path base; it is not path containment, an OS sandbox, a Docker boundary, or a network boundary. Both current Tool implementations accept absolute paths. Use this command only against a workspace and task you trust.

The shell child receives a small allowlist of ordinary process variables and does not inherit `DEEPSEEK_API_KEY` or other ambient Provider credentials. This reduces accidental shell leakage; it does not turn trusted-local execution into a security boundary. OS isolation and enforced path/network policy are not claimed.

## Observable contract

The TUI renders normalized events for each Run:

- Provider/model/response identity, stop reason, and Provider-reported Token usage;
- typed ToolCall name, correlation ID, arguments, ToolResult text, and error status;
- one attributable terminal: `completed`, `cancelled`, `model_error`, or `incomplete`.

Provider-private reasoning continuation stays inside the Pan DeepSeek Adapter and never enters this projection. No credential is copied into source, CLI arguments, shell child environment, or Run Archive bytes. The stack does not yet implement checkpoint/resume across processes, enforce a paid-call budget, compact Context, or recover from Context overflow. It performs no application-level history truncation.

## Three-lane memory (WorkOrder #25 accepted implementation)

Every admitted run is archived before any Provider exchange or tool effect: one append-only hash-chained `events.jsonl` per run under `<memory-root>/runs/<run-id>/`, sealed at settlement (`terminal | cancelled | failed`), or settled as `interrupted` by recovery after a process crash, with disclosed torn-tail byte counts and no identity reuse. Sealed archives refuse every application-owned write interface and verify integrity byte-exactly; there is no overwrite or delete interface. A present-but-corrupted manifest (invalid JSON or wrong shape) never blocks startup: `open()` leaves it byte-untouched while `readManifest`/`readArchive`/`listRuns` fail typed with `ArchiveIntegrityError`, and `:runs`/`:replay` render that as `ARCHIVE_ERROR`. `:runs` lists sealed archives and `:replay RUN_ID` renders one with zero Provider calls and zero tool effects.

The Retrospective Ledger (`<memory-root>/retrospective-ledger.jsonl`) holds append-only post-run conclusions and corrections; every entry references a sealed archive identity plus its sealed head hash, and a correction is a new entry with an explicit `supersedes` reference. Entries are not raw trajectory and never auto-promote to project facts.

The Runbook ([`RUNBOOK.md`](RUNBOOK.md)) is the current operating guidance, edited and reverted through ordinary version control. Each run resolves the Runbook snapshot at its creation and binds the content-hash revision into its archive and the model-visible prompt, so later edits never rewrite an old run's meaning. This is an application-level memory contract, not filesystem immutability or OS isolation.

## Deterministic checks

```bash
npm --prefix typescript run check
npm --prefix typescript run pan-contracts
npm --prefix typescript run pan-faux-tools
```

Product checks use Pan Faux and canonical fixtures plus the content-hashed offline DeepSeek fixtures. Native and memory regression cases have been migrated to Pan inputs. Shared manifests remain byte-identical and run on Native here and on Pi in the independently installed reference. Full source isolation, coverage and relocation evidence is documented in `docs/design/product-isolation.md` from the repository root; the #35 compiled consumer procedure is documented in `docs/design/packed-product-consumer.md`.

## File navigation

Source Modules are indexed by `src/README.md` in the checkout:

| Location | Responsibility |
|---|---|
| `src/protocol/` | Canonical protocol, AgentTool and ModelAdapter contracts |
| `src/runtime/` | GeneralAgentSession, AgentKernel contract and NativeKernel |
| `src/providers/deepseek/` | Existing DeepSeek profile, transport and Adapter |
| `src/providers/faux/` | Existing Pan Faux Adapter |
| `src/tools/` | Trusted-local read/write/edit/bash implementation |
| `src/memory/` | Archive, retrospective ledger and Runbook implementation |
| `src/tui/` | Existing TUI and observation/replay rendering |
| `src/cli.ts`, `src/index.ts` | Concrete composition/CLI entry and public export facade |

The source command remains `npm run agent -- --kernel native ...`. Installed import names and bin behavior remain unchanged; only the internal `pan-agent/faux` target moves to `dist/providers/faux/faux-model-adapter.js`. `tsconfig.build.json` and `scripts/build.mjs` already compile nested source directories; no build algorithm or Runbook asset locator change is required. `dist/` and generated tarballs remain ignored output.

Repository `scripts/check_module_layout.mjs` reconstructs exact source/import correspondence and checks dependency direction, scope and baseline test obligations. `scripts/check_public_package.mjs` compiles the same typed client against old/new installed tarballs and compares public named exports. The unchanged `scripts/verify_packed_consumer.py` and #35 driver/guards verify the real installed task. Historical `check_workorder_34_scope.py` / `check_workorder_35_scope.py` remain unchanged proofs runnable at their respective accepted SHAs; the #41 checker is the current scope gate. See `docs/design/native-module-layout.md` from the repository root for the complete relocation map and reproduction.

## Compact Native presentation

Native CLI explicitly selects the compact TUI: `你 › `, honest tool-result counts, full final answer and local `:details` / `:runs` / `:replay RUN_ID`. [The guide](../docs/design/native-compact-tui.md) documents the offline demo and precise missing-counter behavior. Public legacy renderers and `runTui` without presentation retain their prior output.

#44 candidate adds optional ephemeral public text streaming and English compact labels. See [design and installed demo](../docs/design/native-streaming-tui.md). Existing exchange callers may omit progress; settled records and explicit Native selection are unchanged.

[Explicit file input](../docs/design/native-file-input.md): idle `@` picker, Ctrl-P preview, Ctrl-R removal; Enter selects, a separate Enter submits. `--max-attachment-bytes INTEGER` sets the inclusive aggregate byte policy (default 1048576). Use Escape for literal standalone `@` text.

[TUI A daily workspace](../docs/design/native-daily-workspace.md): fixed TTY regions, inline attachments and editable next draft; non-TTY retains explicit line submission.

#47 Criteria-Version 1.2 adds timer-free compatibility framing (Ctrl-G Back, ESC prefix only) and immutable raw-prefix screen evidence. Old 1.1 grids remain historical failed evidence.
