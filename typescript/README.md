# Pan Agent — terminal runtime

Requires Node.js >=22.19.0. Runtime dependencies: Node built-ins only. The supported validation environment is macOS arm64 with an interactive terminal; other platforms remain unverified.

## Build a package (developers)

```sh
npm ci --ignore-scripts
npm run build
npm pack --pack-destination /path/to/artifacts
```

The compiler is a pinned development dependency. A consumer does not need it. The archive contains compiled JavaScript, declarations, launchers and operating instructions; `private: true` prevents accidental npm publication.

## Install a prebuilt archive

```sh
mkdir pan-consumer
cd pan-consumer
npm install /path/to/pan-agent-0.1.6.tgz --omit=dev --ignore-scripts --no-audit --no-fund
./node_modules/.bin/pan-agent --help
./node_modules/.bin/pan-agent demo
```

`demo` is an offline **scripted model**, not a live model result. It uses the real TUI, NativeKernel and local tools in a newly created temporary directory. Submit `Create hello.js, run it, and read it back.` Approve the displayed shell command if intended. Expected source: `console.log("PAN_DEMO_OK");` plus a newline. Optional `demo --directory NEW_DIRECTORY` selects a new directory; existing directories are refused. Retained `demo-report.json` records scripted exchanges and tool executions.

## Real use

Run `./node_modules/.bin/pan-agent configure`. Select DeepSeek or Kimi Code, and environment or macOS Keychain credentials. Environment mode reads `DEEPSEEK_API_KEY` or `KIMI_API_KEY` at task time; settings never save the secret. Kimi models are selected in configure, not through `--model` overrides.

```sh
mkdir workspace archives
./node_modules/.bin/pan-agent --kernel native --workspace "$PWD/workspace" --memory-root "$PWD/archives"
```

Workspace and archive root must be disjoint. Startup, configuration and local commands require no model call. Submitted real tasks use the selected provider and can incur charges.

Tools run with host-user authority. Workspace is a default cwd, not OS containment. Shell and protected/outside/uncertain file operations require approval. Ordinary existing workspace files can be edited automatically. Shell may be trusted for the current session; `:trust off` revokes it. Do not use untrusted tasks or sensitive workspaces.

## Inspect and replay

- `:context`: inspect retained context summary.
- `:details`: inspect detailed execution output.
- `:runs`: list sealed run archives.
- `:replay RUN_ID`: render the saved run with zero provider/tool execution.
- `:exit`: close. Ctrl-C cancels an active task or closes an idle TUI.

Archives verify their stored hash chain and preserve run identity. They are not a checkpoint that resumes model execution. Context compaction and cross-process conversation continuation are not claimed. See RUNBOOK.md for operating guidance.

## License and distribution status

Pan-authored code is licensed under the MIT License included as `LICENSE` in this package, copyright 2026 Pan Agent contributors. Third-party licenses are not replaced by Pan's license. Install the v0.1.6 tarball from GitHub Releases; this package is not published on npm.

Runtime code has no third-party npm runtime dependencies. Build-time dependencies: TypeScript (Apache-2.0), @types/node (MIT), undici-types (MIT). These dependencies are not bundled. The repository's license inventory documents separate recording tools and retained references.

## Assistant Markdown display

Interactive TUI assistant responses and the final response in `:replay` support ATX headings (`#` through `######`), unordered and numbered lists, `**bold**` / `__bold__`, single-backtick inline code and backtick/tilde fenced code with a language label. Code contents remain literal. Incomplete delimiters stay readable while streaming. `NO_COLOR` (including an empty value) or `TERM=dumb` disables Markdown color/emphasis styles; structural markers and text remain. The existing TUI still uses terminal cursor controls.

This is a small display subset, not full CommonMark: nested inline formatting, escapes, tables, HTML, links, block quotes and setext headings fall back to readable literal text. Tool results, permission prompts, user input and non-TTY transcripts remain literal. Markdown is never written back to run archives. Wide text wraps by terminal cells; PageUp/PageDown and resize retain scroll content.

## Missing credential

If an environment credential is missing when you submit a task, the TUI keeps the failed status and shows the expected variable (`KIMI_API_KEY` or `DEEPSEEK_API_KEY`). Exit with `:exit`, set the key in your terminal using your secret manager, then restart Pan. To change the credential source, run `pan-agent configure`. Never paste an API key into a task. Keychain configuration uses its own entry; environment keys do not override a selected Keychain source. Unknown provider errors remain generic rather than exposing raw responses.

## Opt-in document and history retrieval

Retrieval is included in the **0.1.7 source/candidate package**; the published v0.1.6 release download does not contain it. Build and install the current checkout with the source instructions. No embedding service or extra runtime dependency is needed.

Create `selection.json` outside your selected source directories, for example:

```json
{
  "documents": ["docs", "src"],
  "history": "/absolute/path/to/your/pan-archives",
  "ledger": true,
  "runbook": "RUNBOOK.md"
}
```

Only `documents` is required (an empty array is allowed with a history or Runbook selection). Directories/files must already exist. Omit `ledger` unless that archive root has a retrospective ledger; omit `runbook` unless you have that named file. History means **your explicitly selected Pan archives**, not browser, Codex or Claude account conversations.

```sh
./node_modules/.bin/pan-agent retrieval configure --workspace "$PWD/workspace" --from selection.json
./node_modules/.bin/pan-agent retrieval show --workspace "$PWD/workspace"
./node_modules/.bin/pan-agent --kernel native --workspace "$PWD/workspace" --memory-root "$PWD/archives"
# In the TUI: “Use retrieve to find recoveryBudget and our earlier recovery decision.”
```

The model can call `retrieve`; review the source selection in its normal **Allow once / Deny** prompt. Results contain verbatim snippets, source hashes/locations, and current/history/superseded labels. They are reference data, not instructions. A real task still calls your configured model and can disclose selected snippets to that provider. Do not select private material you do not want sent.

Each call refreshes from source; there is no persistent search cache. Reconfigure with a smaller selection to remove sources, or disable all retrieval:

```sh
./node_modules/.bin/pan-agent retrieval disable --workspace "$PWD/workspace"
```

Settings persist in `workspace/.pan-agent/retrieval.json` across restarts. Replacement of a selected root or directly selected memory file requires reconfiguration. Ordinary source content updates/deletes appear on the next call. Originals are never edited by retrieval. Protected files and unsupported links are skipped with diagnostics; corrupt/unsealed history is not trusted. Large corpora return explicit partial/truncated results. Default matching is lexical: all query terms must occur in one800-character chunk; it does not promise paraphrase or semantic recall. Limits:8 sources,1024 entries,128 attempted files,4MiB aggregate,256KiB ordinary file/ledger/Runbook,1MiB sealed events,16KiB manifest/config,12 directory levels,4096 chunks,8 results and64KiB response. Oversized long-run archives are skipped; inspect them with replay, never truncate the original seal. [WorkOrder and source/evidence links](https://github.com/pym96/Pan-agent/issues/144).

## Optional Docker sandbox (source candidate)

Build/install the source package above, then start the ordinary TUI with:

```sh
./node_modules/.bin/pan-agent --kernel native --sandbox-root "$PWD/sandbox-state" \
  --sandbox-input "$PWD/input.txt" --memory-root "$PWD/archives"
```

Each task gets a separate non-root container and workspace volume. `read`, `write`, `edit` and `bash` run there; selected files appear read-only under `/inputs`, outputs go under `/workspace/task`. Retrieval is disabled in this mode. Tool approval cannot add host mounts or network access. API credentials and the agent loop remain on the host. Omitting `--sandbox-root` preserves trusted-local execution.

This profile uses a pinned Python image, no network, a read-only root filesystem, 1 CPU, 512 MiB RAM and 64 PIDs. It requires Linux Docker with cgroup v2 and working resource controllers; unsupported/rootless configurations fail closed. The volume has **no filesystem quota**: memory/PID bounds are enforced, while disk protection is a preflight threshold and bounded export. Docker access itself is a trusted host privilege.

After a task (or controller interruption), use explicit lifecycle commands:

```sh
pan-agent sandbox list --root "$PWD/sandbox-state"
pan-agent sandbox recover --run /absolute/path/to/sandbox-state/RUN_ID
pan-agent sandbox verify --run /absolute/path/to/sandbox-state/RUN_ID --command 'test -f result.txt' --seconds 10
pan-agent sandbox export --run /absolute/path/to/sandbox-state/RUN_ID --out "$PWD/task-export"
pan-agent sandbox cleanup --run /absolute/path/to/sandbox-state/RUN_ID
```

Recovery stops uncertain execution; it never replays task commands. Verification is explicit and runs separately against a read-only workspace after the agent container stops. Cleanup requires a rechecked export manifest, receipt and file hashes. Keep the state directory until cleanup completes; deleting it loses the recovery record. Exports accept regular files only (at most 1,000 files / 64 MiB); links, special files and unsupported tar extensions fail with the volume retained.
