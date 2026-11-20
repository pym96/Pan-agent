# Pan Agent — terminal runtime

Requires Node.js >=22.19.0, npm and an interactive terminal for the TUI. Pan has no third-party npm runtime dependencies. The default native sandbox uses macOS Seatbelt or, on supported x86-64 Linux, Bubblewrap, FUSE, system Python 3 and the [Linux prerequisites](https://github.com/pym96/Pan-agent/blob/main/docs/design/native-linux-sandbox.md#system-requirements). Windows remains unverified.

## Install

```sh
npm install -g pan-agent
```

This installs the prebuilt [npm package](https://www.npmjs.com/package/pan-agent). The current public release is 0.1.10. To pin it, use `npm install -g pan-agent@0.1.10`. Open a terminal in a project directory and run `pan-agent configure` to select a provider and credential source. Run `pan-agent demo` for the offline example.

The 0.1.11 source candidate can be installed from a [locally built tarball](#build-a-package-developers). The startup changes below apply to that candidate.

## Version and command navigation

Installed commands: `pan-agent loop --help`, `pan-agent goal --help`, `pan-agent execution --help`; root `pan-agent --help` describes Sandbox. `sandbox --help` is not a supported subcommand. The complete user guide and offline installed walkthrough are at https://github.com/pym96/Pan-agent/tree/main/docs/demo/consumer-readiness . They use the existing explicit Faux fixture seam; no provider key is needed. RUNBOOK.md describes the execution/verification boundary.

## Settings in 0.1.10

Pan 0.1.10 includes `pan-agent settings path`, `pan-agent settings show` and `pan-agent settings validate`, optional `permissions.deny`, and saved `maxAttachmentBytes`. The public v0.1.9 asset does not include these additions. The [settings guide](https://github.com/pym96/Pan-agent/blob/main/docs/design/user-settings.md) gives source commands, JSON examples, precedence and policy limits. `configure` in this revision preserves valid optional preferences and rejects malformed existing settings before credential mutation.

## Interactive startup

The installed launcher selects the Native kernel and native workspace sandbox. In the 0.1.11 candidate, running `pan-agent` from home opens `~/pan-workspace`, creating it on first use. Run the same command in a project to work in that directory. The archive for both lives at `~/.pan-agent/archives`. With npm release 0.1.10, start in a project directory. Use `--workspace` and `--memory-root` to override them and keep their directories disjoint. First launch in a terminal offers configuration and reuses saved settings on later runs. No API request is made before a task is submitted.

## Publish checklist (maintainer)

For a future release, an authorized maintainer verifies registry ownership and reviews the exact archive before publishing.

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

The compiler is a pinned development dependency. A consumer does not need it. The archive contains compiled JavaScript, declarations, launchers and operating instructions.

## Install a prebuilt archive

```sh
mkdir pan-consumer
cd pan-consumer
npm install /path/to/pan-agent-0.1.11.tgz --omit=dev --ignore-scripts --no-audit --no-fund
./node_modules/.bin/pan-agent --help
./node_modules/.bin/pan-agent demo
```

`demo` is an offline **scripted model**, not a live model result. It uses the real TUI, NativeKernel and local tools in a newly created temporary directory. Submit `Create hello.js, run it, and read it back.` Approve the displayed shell command if intended. Expected source: `console.log("PAN_DEMO_OK");` plus a newline. Optional `demo --directory NEW_DIRECTORY` selects a new directory; existing directories are refused. Retained `demo-report.json` records scripted exchanges and tool executions.

## Configure your API and start a task

After the global installation above, use `pan-agent` in your terminal. For a local archive install, replace it with the absolute path to that installation's `node_modules/.bin/pan-agent`. Configuration is a terminal wizard, separate from the task input in the TUI.

### DeepSeek

**On macOS**, run `pan-agent configure`: press Enter at Provider, Model and Thinking for the defaults, choose `k` at Credential source (the 0.1.11 macOS default when its provider key is absent), paste the key into the hidden prompt, then confirm `y` to save it to Keychain. No shell key export is needed. See [Credential options](#credential-options) for decline/failure behavior.

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

- **Environment (`e`):** Pan reads `DEEPSEEK_API_KEY` for DeepSeek or `KIMI_API_KEY` for either Kimi model at task time. Enter the key in your shell using the blocks above or your secret manager; the wizard only saves the source choice. The export lasts in that shell and programs launched from it. It does not configure new terminals or update an already-running Pan process. Repeat the input step when opening a new terminal.
- **macOS Keychain (`k`, candidate default when the selected provider environment key is absent):** You can skip the shell key-input block. Run `pan-agent configure`, choose your provider/model, then `k`. Paste the key at the wizard's hidden API-key prompt and confirm `y` at the save prompt. Pan remembers it in macOS Keychain and saves only the source choice in settings. A declined or failed save returns you to the credential-source choice; there is no plaintext fallback. Environment variables do not override a selected Keychain source.

Pan saves ordinary preferences in `~/.pan-agent/settings.json`; no API key belongs in that file. Run `pan-agent configure` again to replace provider/model/thinking/source preferences. First bare startup without saved settings offers the same wizard; later launches reuse them across projects. On a bare interactive launch, the candidate offers to repair a saved environment choice when the selected key is missing. On macOS, press Enter to save it once in Keychain, then confirm with `y`. Choose `e` to continue without a key or `q` to quit. On Linux, supply the named variable from your shell or secret manager before starting a model task. Configuration, startup, idle and local TUI commands make no provider request and do not validate your provider account.

### Submit your first task

In the same terminal that holds your environment key (or after Keychain configuration), create a new practice directory:

```sh
mkdir pan-first-task
cd pan-first-task
pan-agent
```

At **Write a task.** in the TUI, type `Create hello.txt containing Hello from Pan.` and press Enter. This submits a real task to the configured provider and may incur charges. Review tool approvals and inspect the file afterward; configuring a key alone does not establish a successful provider call. `pan-agent demo` runs the offline example described above without a key.

In a project, workspace defaults to the current directory, and archives to `~/.pan-agent/archives`. Override them with `--workspace DIR` and `--memory-root DIR`; the directories must be disjoint. The interactive 0.1.10 release uses the native workspace sandbox by default and checks its enforcement before the model runs. Review the approval for a new file. Trusted-local mode grants host-user tool authority and enables configured retrieval when explicitly selected with `--trusted-local`. Use a practice directory for your first task.

## Inspect and replay

- `:context`: inspect retained context summary.
- `:details`: inspect detailed execution output.
- `:runs`: list sealed run archives.
- `:replay RUN_ID`: render the saved run with zero provider/tool execution.
- `:exit`: close. Ctrl-C cancels an active task or closes an idle TUI.

Archives verify their stored hash chain and preserve run identity. They are not a checkpoint that resumes model execution. Context compaction and cross-process conversation continuation are not claimed. See RUNBOOK.md for operating guidance.

## License and distribution status

Pan-authored code is licensed under the MIT License included as `LICENSE` in this package, copyright 2026 Pan Agent contributors. Third-party licenses are not replaced by Pan's license. The public [0.1.10 registry metadata](https://registry.npmjs.org/pan-agent/0.1.10) records archive integrity `sha512-wsvhkETjEmsFl1+FJor8EyS/ynL7as4t3zpGJqycr6QbDgxhFw93PfA8G6RlS1V+dv7eed9f7XBMiNf/cb6BFQ==`.

To reproduce the historical [GitHub v0.1.9 release](https://github.com/pym96/Pan-agent/releases/tag/v0.1.9), install its original archive (SHA256 `3f6783bd6674e9e57e49dac7d67a183313a6c61d3a9f1117b476019ab5c3aeab`). This version runs interactive tools with host-user authority.

```sh
npm install -g --ignore-scripts https://github.com/pym96/Pan-agent/releases/download/v0.1.9/pan-agent-0.1.9.tgz
```

Runtime code has no third-party npm runtime dependencies. Build-time dependencies: TypeScript (Apache-2.0), @types/node (MIT), undici-types (MIT). These dependencies are not bundled. The repository's license inventory documents separate recording tools and retained references.

## Assistant Markdown display

Interactive TUI assistant responses and the final response in `:replay` support ATX headings (`#` through `######`), unordered and numbered lists, `**bold**` / `__bold__`, single-backtick inline code and backtick/tilde fenced code with a language label. Code contents remain literal. Incomplete delimiters stay readable while streaming. `NO_COLOR` (including an empty value) or `TERM=dumb` disables Markdown color/emphasis styles; structural markers and text remain. The existing TUI still uses terminal cursor controls.

This is a small display subset, not full CommonMark: nested inline formatting, escapes, tables, HTML, links, block quotes and setext headings fall back to readable literal text. Tool results, permission prompts, user input and non-TTY transcripts remain literal. Markdown is never written back to run archives. Wide text wraps by terminal cells; PageUp/PageDown and resize retain scroll content.

## Missing credential

If an environment credential is missing when you submit a task, the TUI keeps the failed status and shows the expected variable (`KIMI_API_KEY` or `DEEPSEEK_API_KEY`). Exit with `:exit`, repeat the matching [DeepSeek](#deepseek) or [Kimi Code](#kimi-code) hidden-input block in your terminal (or use your secret manager), then restart Pan. To change the credential source, run `pan-agent configure`. Never paste an API key into a task. If the selected Keychain credential is unavailable, exit and run `pan-agent configure` to update that entry or choose environment credentials. Environment keys do not override a selected Keychain source. Unknown provider errors remain generic rather than exposing raw responses.

## Opt-in document and history retrieval

Pan 0.1.10 supports configured retrieval in an explicitly trusted-local session. No embedding service or extra runtime dependency is needed.

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
pan-agent retrieval configure --workspace "$PWD/workspace" --from selection.json
pan-agent retrieval show --workspace "$PWD/workspace"
pan-agent --trusted-local --workspace "$PWD/workspace" --memory-root "$PWD/archives"
# In the TUI: “Use retrieve to find recoveryBudget and our earlier recovery decision.”
```

The model can call `retrieve`; review the source selection in its normal **Allow once / Deny** prompt. Results contain verbatim snippets, source hashes/locations, and current/history/superseded labels. They are reference data, not instructions. A real task still calls your configured model and can disclose selected snippets to that provider. Do not select private material you do not want sent.

Each call refreshes from source; there is no persistent search cache. Reconfigure with a smaller selection to remove sources, or disable all retrieval:

```sh
pan-agent retrieval disable --workspace "$PWD/workspace"
```

Settings persist in `workspace/.pan-agent/retrieval.json` across restarts. Replacement of a selected root or directly selected memory file requires reconfiguration. Ordinary source content updates/deletes appear on the next call. Originals are never edited by retrieval. Protected files and unsupported links are skipped with diagnostics; corrupt/unsealed history is not trusted. Large corpora return explicit partial/truncated results. Default matching is lexical: all query terms must occur in one800-character chunk; it does not promise paraphrase or semantic recall. Limits:8 sources,1024 entries,128 attempted files,4MiB aggregate,256KiB ordinary file/ledger/Runbook,1MiB sealed events,16KiB manifest/config,12 directory levels,4096 chunks,8 results and64KiB response. Oversized long-run archives are skipped; inspect them with replay, never truncate the original seal. [WorkOrder and source/evidence links](https://github.com/pym96/Pan-agent/issues/144).

## Optional Docker sandbox

After preparing the Docker prerequisites below, start the ordinary TUI with:

```sh
pan-agent --kernel native --sandbox-root "$PWD/sandbox-state" \
  --sandbox-input "$PWD/input.txt" --memory-root "$PWD/archives"
```

Each task gets a separate non-root container and workspace volume. `read`, `write`, `edit` and `bash` run there; selected files appear read-only under `/inputs`, outputs go under `/workspace/task`. Retrieval is disabled in this mode. Tool approval cannot add host mounts or network access. API credentials and the agent loop remain on the host. Without `--sandbox-root`, the interactive launcher selects the native workspace sandbox. Use `--trusted-local` for the previous host-user tools.

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

## Native workspace sandbox

Pan 0.1.10 selects the native workspace sandbox when you run `pan-agent`. The public v0.1.9 release predates this default. The banner identifies the selected backend. Each submitted task must pass its native enforcement probe before the model or a task tool runs. For a scripted demonstration without a provider, use `pan-agent demo` in its disposable workspace. Select Docker with `--sandbox-root DIR`, or select the previous host-user backend and configured retrieval explicitly with `--trusted-local`.

Use `pan-agent --session-auto` to create a new plain document such as `notes.txt` without approving that individual write. The typed writer only admits a new root-level ASCII filename with a letter or digit first, up to 80 letters, digits, underscores or hyphens before a lowercase `.txt` or `.md` extension. The existing no-follow and exclusive-create checks still apply. Configured protected paths retain the normal approval check. Network and credential grants cannot be combined with session automation. The TUI displays SESSION AUTO and the archive records the boundary and each admitted write. Restart normally to leave automation.

If the native backend reports an unavailable prerequisite in an interactive terminal, the failed task ends before model work. Setup artifacts and its failed archive can remain. Use `:fallback cancel`, `:fallback once` or `:fallback task`, close the message and explicitly submit a fresh task. An operation is one typed tool invocation. The one-operation choice expires on its first dispatched invocation and the task choice ends at settlement or cancellation. Each host operation, including an ordinary edit, requires its own exact approval. Fallback supports ordinary project files and the exact command `pwd`, which runs the fixed host executable. Hidden paths, sensitive or outside files, arbitrary Shell and retrieval are unavailable. A workspace enrolled for credential sharing, a selected private grant or automation disables manual fallback. A new launch starts at the native boundary.

Run `pan-agent --native-sandbox --workspace /absolute/project --memory-root /absolute/disjoint/archives` in an interactive terminal. Host file tools and the OS-isolated Shell share the live project. Shell can read public HTTP(S) resources with `pan-fetch URL`. Add `--native-offline` for the previous offline profile. A Shell command can create an output, atomically replace a regular file and read back the result through Pan. The native mode has fixed file and network restrictions and provides no CPU, memory or disk quotas. A failed startup reports the missing boundary before the model runs.

- On macOS, the backend uses the system Seatbelt tools. [macOS requirements and policy](https://github.com/pym96/Pan-agent/blob/main/docs/design/native-macos-sandbox.md)
- On supported x86-64 Linux, the backend uses Bubblewrap, working unprivileged namespaces, `/dev/fuse`, fusermount, libfuse2, libseccomp2, system Python 3 and glibc tools. The package includes its Python binding. Saved protected paths must be literal descendants of the selected project on case-sensitive ext4. An external configured path prevents Linux native startup. Shell sees the filtered live project at `/work` and a private writable `/tmp`. [Linux setup, supported operations and limitations](https://github.com/pym96/Pan-agent/blob/main/docs/design/native-linux-sandbox.md)

### Network commands inside the native Shell

Fetch a file into the live project. The task sees ordinary response bytes and a nonzero exit code on denial or failure.

```sh
url='https://pym96.github.io/Pan-agent/LICENSE'
pan-fetch "$url" > upstream-license
```

Stock curl can use the same Unix socket. The gateway checks the destination and reads the resource. Direct curl HTTPS, npm network installs and generic proxy clients are outside this interface.

```sh
curl -q --fail --silent --show-error --noproxy '*' \
  --unix-socket "$PAN_NETWORK_SOCKET" --get --data-urlencode "url=$url" \
  http://localhost/fetch > upstream-license
```

A test server and its child client can communicate over a Unix socket in `$PAN_LOCAL_SOCKETS`. Programs that require a TCP loopback port need a Unix-listener option. To read a specific private HTTP service, supply its exact numeric origin when launching Pan, for example `--native-sandbox --native-grant http://127.0.0.1:8123`. Within the first task, `pan-fetch http://127.0.0.1:8123/health` can reach that service. A different port is denied. The next task in the same CLI process has no grant. Use only a service you intend to expose to that task. The gateway does not send cookies or authorization headers.

[Protocol coverage, local server example, platform requirements and evidence](https://github.com/pym96/Pan-agent/blob/main/docs/design/native-network.md)

The option is available in 0.1.10. Scheduled commands keep their existing interfaces.

## Supervised local delivery

Pan 0.1.10 includes this command. A consumer needs Node 22.19+ and local Git with SHA-1 or SHA-256 object format support on macOS or Linux. With the npm package installed, run:

```sh
trial=$(mktemp -d)
pan-agent delivery demo --directory "$trial/example"
pan-agent delivery inspect --state "$trial/example/delivery"
```

The offline example updates office hours in a new disposable project. Look for two `delivery.handoff` events with different commit SHAs. The first `goal.verdict` records the failed weekday and time checks. The builder receives that feedback, writes the repair and hands off a new commit. A fresh reviewer receives it in a separate clean checkout. The final record includes the winning SHA, shared model/tool counts and stop confirmation.

### Run an operator task

Choose an owned local Git project, commit the input files you want to use, and save your criteria **outside** the project. This example changes existing `inventory.json` and `notes.md`:

```json
{
  "version": "inventory-v2",
  "files": ["inventory.json", "notes.md"],
  "checks": [
    {"id": "stock", "file": "inventory.json", "kind": "json-equals", "value": "{\"pens\":3,\"pads\":2}"},
    {"id": "dated", "file": "notes.md", "kind": "includes", "value": "Friday"},
    {"id": "final", "file": "notes.md", "kind": "excludes", "value": "TODO"}
  ]
}
```

Configure DeepSeek or Kimi with `pan-agent configure`. From outside the project:

```sh
pan-agent delivery run --workspace /path/to/project --state /path/to/new-state \
  --criteria /path/to/criteria.json --attempts 3 --for 60s \
  --task 'Record three pens and two pads. Mark the Friday count complete in the notes.'
pan-agent delivery inspect --state /path/to/new-state
git -C /path/to/new-state/builder show HEAD
```

The owner supplies the task, file scope and all required predicates. Use `equals` for exact UTF-8 text (including trailing line breaks), `includes` or `excludes` for literal text, or `json-equals` for structural JSON equality. JSON numbers compare at exact decimal precision, including fractions and exponents; equivalent spellings such as `1.2300` and `123e-2` match. Duplicate object member names are refused. A missing file fails its check. Each check has a unique ID and selects a declared path. The builder sees the criteria and has typed read/write access to the exact listed files. Shell, retrieval and candidate-supplied check commands have no entry in this flow. Protected, uncertain or approval-requiring files are declined. Pick existing unprotected files; initialize and commit an empty input when creating a new document.

The source is the Git **HEAD commit**. Uncommitted, ignored and untracked files in the operator's directory are excluded. Pan imports a self-contained shallow copy under the new state directory. Each repair becomes a new private commit on top of that base. The original repository and its current branch stay under operator control. To keep the result, inspect the candidate's diff and apply it yourself. Pan does not publish or merge it.

Limits per delivery are 1–8 attempts (default 3), up to five minutes of controller time including checkout, six model turns and five tool steps per attempt with enclosing caps. Each reviewer gets at most 25 seconds within the shared deadline. The source tree allows up to 512 regular files, 8 MiB total and 1 MiB per file. Symlinks and submodules are refused. Up to 16 named `.txt`, `.md`, `.rst`, `.json`, `.csv`, `.tsv`, `.yaml` or `.yml` files and 32 required checks are supported. Selected data is limited to 128 KiB per file. Use a new private state directory disjoint from the input. The state can contain project files, criteria, tool transcripts and model output.

### Evidence and interruption

The foreground controller owns retries and acceptance. It binds the private commit SHA, worktree byte manifest, frozen criteria bytes, checker implementation digest and reviewer dispatch. The reviewer is a deterministic package executable in a separate process with its own checkout. Its registered process channel supplies PID, required check results, stdout/stderr and exit code. Worker claims and reviewer-shaped text have no authority. The reviewer uses no model or provider credential. All roles share the host and OS account. This separation supplies independently attributable check execution, without providing hostile same-user isolation, a second model-family judgment or a correctness guarantee beyond the chosen checks.

Ctrl-C or SIGTERM cancels work. The controller reports `stop_unconfirmed` if process settlement cannot be established. Owner interruption, reviewer failure and bad or incomplete evidence cannot produce success. The read-only inspect command reports an unfinished run as `interrupted_or_active`, rechecks sealed successful evidence and both candidate and reviewer checkouts, and reports later changes. `archive/runs/<id>/events.jsonl` contains the ordered controller records; the matching manifest seals completed runs. A missing terminal file leaves the result uncertain. Inspect the remaining files and process records before starting a new, explicitly authorized run. Reusing a state directory is refused. There is no background scheduler, automatic replay or automatic resume.

For the executable regression and its raw logs, see the [installed runtime checks](../scripts/runtime-ci/README.md).

### Workspace trust and one-use credentials

In 0.1.10, an operator can share one UTF-8 credential with a native sandbox command. The project declares candidate names in `.pan-agent/workspace.json`. A new project has no eligible resources. For example, this declaration requests one process environment variable and one protected project file.

```json
{"version":1,"resources":["env:PAN_TEST_TOKEN","file:.env.fixture"]}
```

Review the canonical project and names, then pass the review hash printed for that exact workspace and list.

```sh
pan-agent trust --workspace "$PWD"
pan-agent trust --workspace "$PWD" --approve REVIEW_HASH
pan-agent --native-sandbox --native-offline --workspace "$PWD" \
  --native-resource env:PAN_TEST_TOKEN --grant-command 'node check-fixture.cjs'
```

Set the variable through the operator environment or place a disposable fixture in the declared file. Keep secret values out of prompts and CLI flags. Use `file:.env.fixture` to select the file instead. One exact shell command in the first task receives the selected value in **PAN_GRANTED_VALUE**. Its children inherit that variable. An exact command matches literal shell text; it can execute scripts and read other ordinary project inputs, so review their contents. A second invocation gets the ordinary environment. To share the same resource with every shell call in the first task, replace `--grant-command '…'` with `--grant-task`. The terminal reports expiry on consumption or task end. A fresh task needs a fresh operator selection. Shell approvals and configured deny rules still apply. Built-in shell variables such as LANG are constructed by the sandbox. Arbitrary host variables are excluded.

File tools and Shell continue to deny the original sensitive path, including during a grant. A file value must come from an existing, singly linked regular file within the selected workspace. Use a native protected basename (for example, `.env.fixture`) or add an exact or enclosing path to the operator's `protectedPaths`. Direct edits stay blocked. Links, stale identities, changed values and invalid text fail closed. A resource name is limited to 256 characters, a list to 32 names and a value to 16 KiB of nonempty UTF-8 text without NUL. An operator can protect custom test files; recognition covers documented names and configured paths.

Pan stores approvals separately in `~/.pan-agent/workspace-trust/` as private receipts containing a workspace identity and resource names. Operators can inspect them. Permissions bind to the canonical workspace directory and its filesystem identity. On review, startup and granted use, a removed resource loses eligibility. A later observed expansion requires another review. Workspace declarations cannot change global deny rules, provider settings, shell backend or ordinary preferences. Participating projects require the native sandbox for interactive tasks, including after an observed removal of the declaration. Unusable or ambiguous policy stops admission. A stale `.lock` directory blocks review until the owner verifies that no review is running and removes the stale lock. Ordinary projects without enrollment retain the existing launch behavior.

Granted calls suppress direct stdout and stderr capture. The value travels to the native child on a pipe. Receipts, command arguments and Pan's generated launch policy contain only nonsecret metadata. Authorized code can deliberately copy or transmit the value using any channel the approved sandbox permits, including ordinary project output that a later call can read and archive. Expiry ends subsequent delivery; existing disclosures and copies persist. Use disposable test credentials, review code before granting, and use offline mode when network access is unnecessary.

## Local MCP reports

Pan 0.1.10 includes the local stdio client and an offline sample server. The global npm installation above provides both.

Run the following commands from your project workspace. The temporary home keeps the demo's operator declaration separate from your regular settings. The client prints JSON, including the synthetic run ID `sample-001`, three completed jobs and zero failures.

```sh
demo_home="$(mktemp -d)"
mkdir -m 700 "$demo_home/.pan-agent"
(umask 077 && pan-agent mcp example-config > "$demo_home/.pan-agent/mcp-reports.json")
HOME="$demo_home" pan-agent mcp list example
HOME="$demo_home" pan-agent mcp call example run_summary
```

To ask the installed TUI about the sample, start it from a workspace outside the temporary home. With a configured model, submit **Why does sample-001 have no score? Use the local report.** When Pan shows the `example/run_summary` selection for `mcp_report`, choose **Allow once**. The sample reports that its scoring rubric was missing. Choosing **Deny** leaves the request unexecuted. The report peer works offline. Interactive answers use your normal configured model. A first launch with this temporary home opens the usual model setup.

```sh
HOME="$demo_home" pan-agent --mcp-report example run_summary
```

The default launch starts zero peers, even with an operator declaration. The TUI flag starts one short-lived discovery process. If the selected report accepts an empty object and has a supported declaration, Pan adds a single fixed `mcp_report({})` tool alongside the session's existing tools. Each approved call opens a fresh process and rediscovers the report. Whole-tool `permissions.deny` accepts `mcp_report`. Unsupported schemas, duplicate declarations, collisions with builtins and contradictory read-only hints disable the selection with a diagnostic. Pan binds the selected command and arguments for the session and checks the current policy again before dispatch. The Docker profile excludes host reporting. Report calls are also disabled during a manual host-fallback task. The native workspace sandbox and trusted-local sessions both support this explicit host process.

An external error, a failure before dispatch and an uncertain outcome after dispatch appear separately in Trace. The approval request ID also appears in the peer's `tools/call` metadata as `io.github.pym96/pan-call`; the settled tool record contains the server, remote name and wire request ID for dispatched calls. Use `:details` or inspect the sealed run under the printed archive directory. After a failed report, submit another task in the same TUI to use the ordinary tools.

For your own server, put the declaration in `~/.pan-agent/mcp-reports.json` under the home selected by your trusted launcher. An entry names an exact absolute executable, literal arguments and report tools you authorize. Review the executable, scripts, dependencies and their replacement permissions first. The example config command prints the installed Node and sample script paths. An ordinary launch, root help and printing an example start zero peers.

```json
{"servers":[{"name":"reports","command":"/opt/reports/bin/server","args":[],"tools":["run_summary"]}]}
```

The CLI starts a peer only for an explicit list, call, or TUI report selection. The policy and its directory must be outside the current workspace. The canonical home, policy directory and policy file must be owned by the current OS user and deny group/other writes. Use a regular, single-link file and a real policy directory. Tool names are case-sensitive. An unapproved tool fails before launch. The server's annotations and reported identity grant no permissions.

**Host authority.** The selected local program runs with the current user's filesystem, network and process privileges, outside Pan's task sandbox. The operator vouches for its read-only behavior. It runs from the policy directory through POSIX `/usr/bin/env -i` with literal arguments and piped stdin/stdout. The launcher clears its environment, including model keys, PATH and HOME. The OS or runtime may supply bookkeeping variables (macOS text encoding, for example). Stderr goes to the null device. Use trusted programs that stay in the foreground and exit on stdin EOF. Shutdown supervises the one directly launched server PID. A daemonized process, separately spawned helpers and loss of the client to SIGKILL lie outside this ownership contract. Supported hosts are macOS and Linux.

**Wire subset.** Every request uses revision `2026-07-28` and supplies protocol version, client identity and empty client capabilities in `params._meta`. The sample server marks every discovery and list page immediately stale and public (`ttlMs: 0`, `cacheScope: "public"`). Each operation fetches fresh metadata, checks `server/discover` for that version and the tools capability, then pages through `tools/list`. An approved tool must accept an empty argument object. Supported input schema keys are `type: "object"`, `properties`, an empty `required`, boolean `additionalProperties`, title, description and the 2020-12 dialect URI. The client omits tools with other input constraints or a declared output schema. This avoids promising validation of arbitrary JSON Schema. It accepts complete responses with a content array of text blocks (possibly empty) and optional `structuredContent` including arrays, scalars and null. Tool failures, RPC errors, unsupported result types and blocks all fail the command. Output uses JavaScript JSON values. No credential exchange, remote transport, legacy handshake, notifications from peers, input rounds, resource or model calls are implemented.

The policy file is limited to 32 KiB, each UTF-8 response including LF to 256 KiB and each request to three seconds. At most eight tools pages are read, so a call makes at most ten requests. Only one request is in flight. On timeout or cancellation the client attempts the stdio cancellation notification, closes stdin, waits 150 ms, sends TERM, waits 200 ms and then sends KILL and waits up to one second for exit. An uncertain call is never retried. CLI failures return status 2 with a diagnostic.
