# TypeScript/Pi General Agent Working Stack

Status: WorkOrders #23–#25, #28, #31, and #32 are independently accepted and landed. WorkOrder #33's direct Pan-owned DeepSeek Adapter is a Builder candidate pending independent review; Pi remains installed and default.

This is the authoritative TypeScript working stack for a Human-operated general coding agent. One `GeneralAgentSession` owns admission and durable memory, then delegates Context and iterative semantics through `AgentKernel`. `PiKernel` remains the default and wraps Pi's stateful `Agent`; explicit `NativeKernel` is a repository-owned second loop using Pan-owned semantic contracts and accepted direct Pan-owned read/write/edit/bash implementations. On the #33 candidate, Native also receives the direct Pan-owned DeepSeek `ModelAdapter`, transport, and SSE assembler; it no longer crosses the Pi Provider bridge. The existing Python implementation remains available as reference-only; this package neither imports nor ports its AgentLoop.

## Install

From the repository root, install the exact dependency graph in `package-lock.json` without package lifecycle scripts:

```bash
npm --prefix typescript ci --ignore-scripts
```

The direct Pi dependencies are pinned to `@earendil-works/pi-agent-core@0.84.4` and `@earendil-works/pi-ai@0.84.4`. The lockfile pins every transitive package and registry integrity value.

## Run the TUI

Choose an existing directory deliberately. It may be an actual project checkout or a disposable test workspace.

```bash
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
npm --prefix typescript run agent -- \
  --workspace /absolute/path/to/workspace \
  --memory-root /absolute/path/to/memory \
	--kernel pi \
  --model deepseek-v4-flash \
  --thinking high
```

The initial profile is `deepseek-v4-flash` with `high` thinking. Omitting `--kernel` is identical to explicit `--kernel pi`; `--kernel native` selects the second implementation without changing TUI or archive interfaces. The Native path receives canonical Context and assembled outcomes through Pan contracts, receives the Pan trusted-local Tools directly, and on the #33 candidate selects the direct Pan DeepSeek Adapter. `deepseek-v4-pro` and the listed thinking levels are explicit alternatives. `--memory-root` is required and must be disjoint from the workspace; it holds the durable three-lane memory (below). Construction, `--help`, confirmation rejection, blank input, `:help`, `:context`, `:runs`, `:replay RUN_ID`, and `:exit` make no Provider call. The first non-empty task submitted after confirmation is the first Provider call.

Each task returns control to `Task>` and the next task continues the selected Kernel's typed transcript. `:context` reports the retained message count and owner. Ctrl-C during a task requests Kernel cancellation; Ctrl-C at the prompt closes the TUI.

## Trust boundary

`bash` is labelled **trusted-local**. It runs directly as the current host user. `--workspace` establishes the default cwd and relative-path base; it is not path containment, an OS sandbox, a Docker boundary, or a network boundary. Both current Tool implementations accept absolute paths. Use this command only against a workspace and task you trust.

The shell child receives a small allowlist of ordinary process variables and does not inherit `DEEPSEEK_API_KEY` or other ambient Provider credentials. This reduces accidental shell leakage; it does not turn trusted-local execution into a security boundary. OS isolation and enforced path/network policy are not claimed.

## Observable contract

The TUI renders normalized events for each Run:

- Provider/model/response identity, stop reason, and Provider-reported Token usage;
- typed ToolCall name, correlation ID, arguments, ToolResult text, and error status;
- one attributable terminal: `completed`, `cancelled`, `model_error`, or `incomplete`.

Thinking blocks are retained inside Pi's model transcript but never rendered by this projection. No credential is copied into source, CLI arguments, shell child environment, or Run Archive bytes. The stack does not yet implement checkpoint/resume across processes, enforce a paid-call budget, compact Context, or recover from Context overflow. It performs no application-level history truncation.

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

The retained Pi regression Adapter uses Pi's Faux Provider. The accepted #31 seam checks use test-local Pan doubles, #32 adds a reusable Pan `FauxModelAdapter` plus product Tool tests, and #33 adds content-hashed request/SSE/failure fixtures for the direct Pan DeepSeek boundary. None of these checks makes a network, Provider-credential, balance, or paid-model call. The Kernel conformance suite consumes one versioned implementation-neutral manifest against both implementations and does not require the reference Python package.
