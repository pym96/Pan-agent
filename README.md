# Pan Agent

A terminal agent for local files and shell commands, with tool approvals and saved-run replay.

**Requirements:** Node.js **22.19.0+**, npm, and an interactive terminal. The published v0.1.9 local runtime needs no compiler, Python, Docker or database. The native sandbox on Linux has additional system requirements. Windows is not verified.

## Install

Copy only the commands inside each code block into your terminal, not the headings or explanatory text.

```sh
npm install -g --ignore-scripts https://github.com/pym96/Pan-agent/releases/download/v0.1.9/pan-agent-0.1.9.tgz
```

This installs the prebuilt **v0.1.9** release; no Git checkout or build is needed. [Release assets and checksums](https://github.com/pym96/Pan-agent/releases/tag/v0.1.9). Prefer a user-owned Node/npm installation; if npm reports permission denied, fix its prefix rather than running Pan with sudo.

If your terminal reports `pan-agent: command not found`, finish installation first. Check `command -v pan-agent`; npm's global executable directory (`$(npm prefix -g)/bin` on macOS/Linux) must be on your `PATH`. Reopen the terminal after fixing your Node/npm setup. This is an installation/PATH issue, not an API-key error.

## Supervised local delivery in the source build

The current source can deliver a bounded update to selected text or data files in a local Git project. A builder produces a private candidate commit. A separate executable reviewer checks the exact commit against every operator-supplied criterion. The demo records a failed first commit and a fresh review of the repair.

This command ships in packages built from this checkout. For the installed offline demo and configuration for your own task, see the [delivery walkthrough and limits](typescript/README.md#supervised-local-delivery).

## Configure your API

### macOS: use the configuration wizard

Have your **DeepSeek API key** ready, then run:

```sh
pan-agent configure
```

Answer the wizard prompts (these answers are **not shell commands**):

1. **Provider**, **Model**, **Thinking**: press Enter at each prompt for `deepseek`, `deepseek-v4-flash`, and `high`.
2. **Credential source**: type `k` and press Enter.
3. **API key**: paste your key and press Enter. Input stays hidden.
4. **Save this key to macOS Keychain?**: type `y` and press Enter to save it.

You can now open a new terminal and use Pan without exporting a key each time. A declined or failed save returns to the credential-source prompt; there is no plaintext fallback. Pan saves preferences in `~/.pan-agent/settings.json`, without the API key. Rerun `pan-agent configure` to change them.

### Linux or environment credentials: Bash / zsh

For **DeepSeek**, have your DeepSeek API key ready. In a **Bash or zsh terminal**, run this block, paste the key at the prompt, then press Enter. Input stays hidden:

```sh
{
  printf 'DeepSeek API key: '
  IFS= read -r -s DEEPSEEK_API_KEY
  printf '\n'
  export DEEPSEEK_API_KEY
}
```

In the same terminal, run:

```sh
pan-agent configure
```

Press Enter at each of the four prompts to choose `deepseek` → `deepseek-v4-flash` → thinking `high` → credential source `environment`. Environment mode reads the key from your terminal; the wizard does not ask you to paste it again.

| Provider choice in the wizard | Model | Environment variable |
|---|---|---|
| `deepseek` (default) | `deepseek-v4-flash` (default) or `deepseek-v4-pro` | `DEEPSEEK_API_KEY` |
| `kimi-code` | `kimi-for-coding` | `KIMI_API_KEY` |
| `kimi-code:k3-256k` | `k3-256k` | `KIMI_API_KEY` |

For Kimi Code, follow the [Kimi key input and exact wizard choices](typescript/README.md#kimi-code). [Credential options](typescript/README.md#credential-options) explain both paths.

The braces group the input commands in the current shell; copy the whole block. The exported key lasts in this shell and programs launched from it; a new terminal needs the input step again. Environment mode does not save the key to disk.

## Run your first task

After Keychain configuration (or in the **same terminal** as your environment key), create a new practice directory and launch Pan:

```sh
mkdir pan-first-task
cd pan-first-task
pan-agent
```

When the TUI shows **Write a task.**, type `Create hello.txt containing Hello from Pan.` and press Enter. Review any tool approval before allowing it, then inspect the resulting file. **Startup and configuration make no model request; submitting this task uses your provider and may incur charges.** A successful configuration does not check whether your key or provider account works.

Use `:exit` to quit. If environment mode reports a missing `DEEPSEEK_API_KEY` or `KIMI_API_KEY`, exit, repeat the shell key-input step and restart Pan. For a Keychain error, rerun `pan-agent configure` and check the save result. Never enter an API key as task text. To try the interface without an API key, use the offline demo below.

The workspace defaults to your current directory (`--workspace DIR` overrides it); history defaults to `~/.pan-agent/archives` (`--memory-root DIR` overrides it). Keep history outside the workspace. If you launch from your home directory and see an overlap error, enter a project subdirectory first.

**In the v0.1.9 release, tools run with your host-user authority.** The workspace is a working directory, not a sandbox. Ctrl-C requests cancellation during execution and can retain the draft. Bare startup needs a terminal; see the [package guide](typescript/README.md) for command interfaces.

## Try it without a key

```sh
pan-agent demo
```

The demo uses a scripted offline model with the actual TUI and tools. Ask `Create hello.js, run it, and read it back.`, then approve the shell command. Use `:runs` and `:replay RUN_ID` to inspect saved execution without rerunning tools or calling a model; `:exit` quits.

## Watch

[Real-time Markdown](https://github.com/pym96/Pan-agent/releases/download/v0.1.5/pan-agent-markdown-live.mp4) · [Database recovery with Harbor verification](https://github.com/pym96/Pan-agent/releases/download/v0.1.3/pan-agent-harbor-demo.mp4)

These recordings retain their original versions and scopes. [Recording details](docs/demo/tui-release56/README.md).

## User settings in current source

Current source adds settings inspection, saved attachment limits and tool deny rules in `~/.pan-agent/settings.json`. See the [settings guide](docs/design/user-settings.md) for examples and scope. These additions are for the next release; the public v0.1.9 download above does not include them.

## More

[Package, build and publish guide](typescript/README.md) · [Sandbox, Loop and Goal](docs/demo/consumer-readiness/README.md) · [Timing and recovery guarantees](docs/demo/consumer-readiness/system-guarantees.md) · [Architecture](CONTEXT.md) · [Design](docs/design/README.md) · [Evidence](docs/evidence/README.md)

The TypeScript runtime is the product. Historical Python experiments, evaluation infrastructure and Web tooling are not required to use it.

## License

[MIT](LICENSE) — Pan-authored code. [Third-party licensing inventory](docs/demo/tui-release56/LICENSE-INVENTORY.md).

<details>
<summary>Developer source entry and retained implementation catalog</summary>

## Default product path | TypeScript Native

Developers can also start from source after choosing DeepSeek in `configure`. In Bash, use hidden input for the key; replace the two example paths with existing, disjoint directories:

```bash
npm --prefix typescript ci --ignore-scripts
read -s DEEPSEEK_API_KEY
export DEEPSEEK_API_KEY
npm --prefix typescript run agent -- \
  --kernel native \
  --workspace /absolute/path/to/workspace \
  --memory-root /absolute/path/to/memory
```

## Build and verify current source

A shallow checkout is sufficient for current development:

```sh
npm --prefix typescript ci --ignore-scripts
npm --prefix typescript run build
```

Run the [complete current regression](scripts/runtime-ci/README.md) for source, conformance, packed installation, lifecycle, onboarding and walkthrough checks. The same entry runs in CI. [Historical reproduction](scripts/history-replay/README.md) is optional and declares its separate pinned Git inputs.

## Retained implementation catalog

| Area | Classification |
|---|---|
| TypeScript Native working stack | **Product** |
| Python evented TUI/runtime | **reference-only** |
| ReAct mechanism | **experiment/reference** |
| Protocol reliability | **experiment/reference** |
| DeepSeek campaigns | **experiment/reference** |
| Proof packs and evaluators | **experiment/reference** |
| Benchmark machinery | **experiment/reference** |

Reference-only Python TUI: `python3 -m workspace_agent_harness.tui` belongs to the historical implementation, not the installed Pan product or its setup path.

</details>

## Native workspace sandbox in source builds

Packages built from this checkout select the native workspace sandbox when you run `pan-agent`. The public v0.1.9 release predates this default. The banner identifies the selected backend. Each submitted task must pass its native enforcement probe before the model or a task tool runs. For a scripted demonstration without a provider, use `pan-agent demo` in its disposable workspace. Select Docker with `--sandbox-root DIR`, or select the previous host-user backend and configured retrieval explicitly with `--trusted-local`.

Use `pan-agent --session-auto` to create a new plain document such as `notes.txt` without approving that individual write. The typed writer only admits a new root-level ASCII filename with a letter or digit first, up to 80 letters, digits, underscores or hyphens before a lowercase `.txt` or `.md` extension. The existing no-follow and exclusive-create checks still apply. Configured protected paths retain the normal approval check. Network and credential grants cannot be combined with session automation. The TUI displays SESSION AUTO and the archive records the boundary and each admitted write. Restart normally to leave automation.

If the native backend reports an unavailable prerequisite in an interactive terminal, the failed task ends before model work. Setup artifacts and its failed archive can remain. Use `:fallback cancel`, `:fallback once` or `:fallback task`, close the message and explicitly submit a fresh task. An operation is one typed tool invocation. The one-operation choice expires on its first dispatched invocation and the task choice ends at settlement or cancellation. Each host operation, including an ordinary edit, requires its own exact approval. Fallback supports ordinary project files and the exact command `pwd`, which runs the fixed host executable. Hidden paths, sensitive or outside files, arbitrary Shell and retrieval are unavailable. A workspace enrolled for credential sharing, a selected private grant or automation disables manual fallback. A new launch starts at the native boundary.

Run `pan-agent --native-sandbox --workspace /absolute/project --memory-root /absolute/disjoint/archives` in an interactive terminal. Host file tools and the OS-isolated Shell share the live project. Shell can read public HTTP(S) resources with `pan-fetch URL`. Add `--native-offline` for the previous offline profile. A Shell command can create an output, atomically replace a regular file and read back the result through Pan. The native mode has fixed file and network restrictions and provides no CPU, memory or disk quotas. A failed startup reports the missing boundary before the model runs.

- On macOS, the backend uses the system Seatbelt tools. [macOS requirements and policy](docs/design/native-macos-sandbox.md)
- On supported x86-64 Linux, the backend uses Bubblewrap, working unprivileged namespaces, `/dev/fuse`, fusermount, libfuse2, libseccomp2, system Python 3 and glibc tools. The package includes its Python binding. Saved protected paths must be literal descendants of the selected project on case-sensitive ext4. An external configured path prevents Linux native startup. Shell sees the filtered live project at `/work` and a private writable `/tmp`. [Linux setup, supported operations and limitations](docs/design/native-linux-sandbox.md)

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

[Protocol coverage, local server example, platform requirements and evidence](docs/design/native-network.md)

The option applies to current source builds. Public v0.1.9 predates it. Scheduled commands keep their existing interfaces.
