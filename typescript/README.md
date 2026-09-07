# TypeScript Native Product

Status: #33 is accepted at `55afc93deff70035810666f0efbf583357ad12fc`; #34 is a Builder candidate pending independent review. This package is **Product**. It requires explicit Native selection and has no Pi dependency. The separate `references/pi/` package is **Frozen Reference** and is never installed or loaded by Product.

One `GeneralAgentSession` owns admission and durable memory and delegates the same iterative semantics through AgentKernel to NativeKernel, using accepted Pan ModelAdapter, DeepSeek transport and trusted-local Tools. An explicitly supplied AgentKernel may enter this seam without exposing internal loop steps. #29 alone decides a future omitted-selector default.

## Install

From the repository root, install the exact dependency graph in `package-lock.json` without package lifecycle scripts:

```bash
npm --prefix typescript ci --ignore-scripts
```

Only TypeScript and Node type development dependencies are installed. Runtime uses Node built-ins. The lockfile pins package versions and registry integrity values; the package file inventory excludes reference code and dependencies.

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

Product checks use Pan Faux and canonical fixtures plus the content-hashed offline DeepSeek fixtures. Native and memory regression cases have been migrated to Pan inputs. Shared manifests remain byte-identical and run on Native here and on Pi in the independently installed reference. Full source isolation, coverage and relocation evidence is documented in `docs/design/product-isolation.md` from the repository root; packed-consumer verification belongs to #35.

## File navigation

`src/session.ts` and `src/cli.ts` own Product selection/composition. `src/kernels/agent-kernel.ts` is the common injection seam; `src/kernels/native-kernel.ts` retains accepted semantics. `test/pan-fixture.ts` supplies canonical test scripts through the accepted Faux Adapter; `test/general-agent.test.ts` covers selection, CLI/TUI and P-D6. `scripts/check_workorder_34_scope.py` and `scripts/check_product_isolation.py` (from repository root) audit preservation and absence.
