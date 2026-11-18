# Pan Agent — terminal runtime

Requires Node.js >=22.19.0. Runtime dependencies: Node built-ins only. Installed regression runs target macOS arm64 and Linux; Windows remains unverified.

## Version and command navigation

This package is **v0.1.9**. Published assets and checksums are listed at https://github.com/pym96/Pan-agent/releases . GitHub asset publication and npm registry publication are separate: use `npm install -g pan-agent` only after the package is published to the registry.

Installed v0.1.9: `pan-agent loop --help`, `pan-agent goal --help`, `pan-agent execution --help`; root `pan-agent --help` describes Sandbox. `sandbox --help` is not a supported subcommand. The complete user guide and offline installed walkthrough are at https://github.com/pym96/Pan-agent/tree/main/docs/demo/consumer-readiness . They use the existing explicit Faux fixture seam; no provider key is needed. RUNBOOK.md describes the execution/verification boundary.

## Settings in current source / next release

This source revision adds `pan-agent settings path`, `pan-agent settings show` and `pan-agent settings validate`, optional `permissions.deny`, and saved `maxAttachmentBytes`. The public v0.1.9 asset does not include these additions. Build and install a tarball from this revision to use them; its unchanged version string is not proof of release identity. The [settings guide](https://github.com/pym96/Pan-agent/blob/main/docs/design/user-settings.md) gives source commands, JSON examples, precedence and policy limits. `configure` in this revision preserves valid optional preferences and rejects malformed existing settings before credential mutation.

## Install the public release

```sh
npm install -g --ignore-scripts https://github.com/pym96/Pan-agent/releases/download/v0.1.9/pan-agent-0.1.9.tgz
```

The installed launcher selects the Native kernel. Workspace defaults to cwd, archives to `~/.pan-agent/archives`; explicit `--workspace` and `--memory-root` win. Keep archives disjoint from the workspace. Library `runCli` and source development entry retain explicit `--kernel native`. First launch in a terminal offers configuration; saved ordinary settings are reused. No API request is made before a task is submitted. For current published downloads see https://github.com/pym96/Pan-agent#install .

## Publish checklist (maintainer)

The npm account/package-name ownership is not established by this checkout. Do not advertise `npm install -g pan-agent` as working before publication. An authorized maintainer must verify registry ownership, review the tarball and its SHA256, then publish that reviewed artifact using npm's authenticated release flow. No credentials belong in source or a test artifact.

1. Run the shared installed regression entry linked below and retain the exact commit, package hash and independent review.
2. Inspect `npm pack --dry-run --json` and the built tarball: compiled runtime/assets only; no source credentials or local configuration.
3. From an authorized account, publish the reviewed `.tgz` (public access). This is a separate release action, not part of the offline build.
4. Install the exact published version in a fresh prefix/home and run help, onboarding and the offline demo. Only then update the root README's default installation command and release availability.

## Build a package (developers)

```sh
npm ci --ignore-scripts
npm run build
npm pack --pack-destination /path/to/artifacts
```

The compiler is a pinned development dependency. A consumer does not need it. The archive contains compiled JavaScript, declarations, launchers and operating instructions. The package is prepared for public npm publication (`private: false`); preparation does not mean it has been published.

## Install a prebuilt archive

```sh
mkdir pan-consumer
cd pan-consumer
npm install /path/to/pan-agent-0.1.9.tgz --omit=dev --ignore-scripts --no-audit --no-fund
./node_modules/.bin/pan-agent --help
./node_modules/.bin/pan-agent demo
```

`demo` is an offline **scripted model**, not a live model result. It uses the real TUI, NativeKernel and local tools in a newly created temporary directory. Submit `Create hello.js, run it, and read it back.` Approve the displayed shell command if intended. Expected source: `console.log("PAN_DEMO_OK");` plus a newline. Optional `demo --directory NEW_DIRECTORY` selects a new directory; existing directories are refused. Retained `demo-report.json` records scripted exchanges and tool executions.

## Configure your API and start a task

After the global installation above, use `pan-agent` in your terminal. For a local archive install, replace it with the absolute path to that installation's `node_modules/.bin/pan-agent`. Configuration is a terminal wizard, separate from the task input in the TUI.

### DeepSeek

**On macOS**, run `pan-agent configure`: press Enter at Provider, Model and Thinking for the defaults, choose `k` at Credential source, paste the key into the hidden prompt, then confirm `y` to save it to Keychain. No shell key export is needed. See [Credential options](#credential-options) for decline/failure behavior.

**On Linux, or when choosing environment credentials**, run the following block in **Bash or zsh**. At the prompt, paste your DeepSeek API key and press Enter; the terminal hides your input.

```sh
{
  printf 'DeepSeek API key: '
  IFS= read -r -s DEEPSEEK_API_KEY
  printf '\n'
  export DEEPSEEK_API_KEY
}
```

Then run `pan-agent configure` in the same terminal. Answer the prompts in order:

| Prompt | Answer |
|---|---|
| Provider | `deepseek` or Enter |
| Model | `deepseek-v4-flash` or Enter; choose `deepseek-v4-pro` to use Pro |
| Thinking | `high` or Enter; `low` and `max` are also available |
| Credential source | `e` or Enter for environment |

### Kimi Code

Use a Kimi Code API key. In **Bash or zsh**, run this block, paste the key at the prompt, and press Enter:

```sh
{
  printf 'Kimi Code API key: '
  IFS= read -r -s KIMI_API_KEY
  printf '\n'
  export KIMI_API_KEY
}
```

Then run `pan-agent configure` in the same terminal:

| Model you want | Provider answer | Remaining prompts |
|---|---|---|
| `kimi-for-coding` | `kimi-code` | No model or thinking question; choose `e` at credential source |
| `k3-256k` | `kimi-code:k3-256k` | Thinking: `high` or Enter (`low`/`max` also available); then `e` at credential source |

Kimi models are selected through these provider answers in `configure`; Kimi `--model` and `--thinking` overrides are unsupported.

### Credential options

- **Environment (`e`, default):** Pan reads `DEEPSEEK_API_KEY` for DeepSeek or `KIMI_API_KEY` for either Kimi model at task time. Enter the key in your shell using the blocks above or your secret manager; the wizard only saves the source choice. The export lasts in that shell and programs launched from it. It does not configure new terminals or update an already-running Pan process. Repeat the input step when opening a new terminal.
- **macOS Keychain (`k`):** You can skip the shell key-input block. Run `pan-agent configure`, choose your provider/model, then `k`. Paste the key at the wizard's hidden API-key prompt and confirm `y` at the save prompt. Pan remembers it in macOS Keychain and saves only the source choice in settings. A declined or failed save returns you to the credential-source choice; there is no plaintext fallback. Environment variables do not override a selected Keychain source.

Pan saves ordinary preferences in `~/.pan-agent/settings.json`; no API key belongs in that file. Run `pan-agent configure` again to replace provider/model/thinking/source preferences. First bare startup without saved settings offers the same wizard; later launches reuse them. Configuration, startup, idle and local TUI commands make no provider request and do not validate your provider account.

### Submit your first task

In the same terminal that holds your environment key (or after Keychain configuration), create a new practice directory:

```sh
mkdir pan-first-task
cd pan-first-task
pan-agent
```

At **Write a task.** in the TUI, type `Create hello.txt containing Hello from Pan.` and press Enter. This submits a real task to the configured provider and may incur charges. Review tool approvals and inspect the file afterward; configuring a key alone does not establish a successful provider call. `pan-agent demo` runs the offline example described above without a key.

Workspace defaults to the current directory, and archives to `~/.pan-agent/archives`. Override them with `--workspace DIR` and `--memory-root DIR`; the directories must be disjoint. Tools run with host-user authority. Workspace is a default cwd, not OS containment. Shell and protected/outside/uncertain file operations require approval. Ordinary existing workspace files can be edited automatically. Shell may be trusted for the current session; `:trust off` revokes it. Use a practice directory for your first task.

## Inspect and replay

- `:context`: inspect retained context summary.
- `:details`: inspect detailed execution output.
- `:runs`: list sealed run archives.
- `:replay RUN_ID`: render the saved run with zero provider/tool execution.
- `:exit`: close. Ctrl-C cancels an active task or closes an idle TUI.

Archives verify their stored hash chain and preserve run identity. They are not a checkpoint that resumes model execution. Context compaction and cross-process conversation continuation are not claimed. See RUNBOOK.md for operating guidance.

## License and distribution status

Pan-authored code is licensed under the MIT License included as `LICENSE` in this package, copyright 2026 Pan Agent contributors. Third-party licenses are not replaced by Pan's license. The prebuilt v0.1.9 tarball is on GitHub Releases. Its SHA256 is `3f6783bd6674e9e57e49dac7d67a183313a6c61d3a9f1117b476019ab5c3aeab`. Installing that URL does not require npm registry publication. A new source build has its own archive identity; do not substitute it for the released bytes.

Runtime code has no third-party npm runtime dependencies. Build-time dependencies: TypeScript (Apache-2.0), @types/node (MIT), undici-types (MIT). These dependencies are not bundled. The repository's license inventory documents separate recording tools and retained references.

## Assistant Markdown display

Interactive TUI assistant responses and the final response in `:replay` support ATX headings (`#` through `######`), unordered and numbered lists, `**bold**` / `__bold__`, single-backtick inline code and backtick/tilde fenced code with a language label. Code contents remain literal. Incomplete delimiters stay readable while streaming. `NO_COLOR` (including an empty value) or `TERM=dumb` disables Markdown color/emphasis styles; structural markers and text remain. The existing TUI still uses terminal cursor controls.

This is a small display subset, not full CommonMark: nested inline formatting, escapes, tables, HTML, links, block quotes and setext headings fall back to readable literal text. Tool results, permission prompts, user input and non-TTY transcripts remain literal. Markdown is never written back to run archives. Wide text wraps by terminal cells; PageUp/PageDown and resize retain scroll content.

## Missing credential

If an environment credential is missing when you submit a task, the TUI keeps the failed status and shows the expected variable (`KIMI_API_KEY` or `DEEPSEEK_API_KEY`). Exit with `:exit`, repeat the matching [DeepSeek](#deepseek) or [Kimi Code](#kimi-code) hidden-input block in your terminal (or use your secret manager), then restart Pan. To change the credential source, run `pan-agent configure`. Never paste an API key into a task. If the selected Keychain credential is unavailable, exit and run `pan-agent configure` to update that entry or choose environment credentials. Environment keys do not override a selected Keychain source. Unknown provider errors remain generic rather than exposing raw responses.

## Opt-in document and history retrieval

Retrieval is included in the **v0.1.9 public release**. Install the release above, or build the current source checkout for development. No embedding service or extra runtime dependency is needed.

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

## Optional Docker sandbox

The v0.1.9 release includes this optional entry. After preparing the Docker prerequisites below, start the ordinary TUI with:

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

### Bounded loop and executable goals

`pan-agent loop --help` and `pan-agent goal --help` describe the noninteractive scheduled entry. Both use the native runtime and existing operation-scoped approvals. Goal completion requires an operator-owned executable verifier, never the model’s completion text. Use a new `--state` directory; `pan-agent execution inspect --state DIR` reads evidence without restarting work. See the [design](https://github.com/pym96/Pan-agent/blob/main/docs/design/execution-controller.md) and [timing/recovery boundaries](https://github.com/pym96/Pan-agent/blob/main/docs/demo/consumer-readiness/system-guarantees.md). The installed CLI has no automatic schedule restart. Checkpoint resume is an opt-in library interface requiring application-supplied storage and a compatible adapter. Python is required only for development tests.

## Installed runtime CI

[The shared CI entry](../scripts/runtime-ci/README.md) works from a shallow current checkout and runs the full TypeScript suite plus byte-verified installed CLI lifecycle tests and the offline walkthrough on Node 22.19.0 and 26.7.0. Docker and live providers are outside this CPU gate.

The complete suite includes seven checkout-path regressions that execute the actual Kimi fixtures under Unicode, spaces, percent/hash characters and literal `%20`; see [the shared entry](../scripts/runtime-ci/README.md). These are fixture-path checks, not a Runtime policy change.

Current development requires only the checked-out tree and locked development tools; no historical Git objects or existing `dist` are needed. `npm --prefix typescript run build` builds from source; the shared entry above performs the complete regression. Optional [fixed-version historical checks](../scripts/history-replay/README.md) retain their own source/checker/criteria pins and setup costs.

## Native macOS sandbox (opt-in)

The current source/next built package supports `pan-agent --native-sandbox --workspace /absolute/project --memory-root /absolute/disjoint/archives` on supported macOS. File tools and OS-isolated Shell share the live project; this initial slice is offline and protects sensitive/configuration paths. It requires system `sandbox-exec` and `otool`, provides no Docker-equivalent resource quotas, and never falls back to host execution. It applies to interactive startup only; existing scheduled commands retain their current interfaces. Public v0.1.9 does not include this option. See [Native macOS sandbox (current source / next package)](../docs/design/native-macos-sandbox.md) for exact read roots, supported tools, limitations and verification.
