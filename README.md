# Pan Agent

A terminal agent for local files and shell commands, with tool approvals and saved-run replay.

**Requirements:** Node.js **22.19.0+**, npm, and an interactive terminal. The local runtime needs no compiler, Python, Docker or database. Windows is not verified.

## Install

Copy only the commands inside each code block into your terminal, not the headings or explanatory text.

```sh
npm install -g --ignore-scripts https://github.com/pym96/Pan-agent/releases/download/v0.1.9/pan-agent-0.1.9.tgz
```

This installs the prebuilt **v0.1.9** release; no Git checkout or build is needed. [Release assets and checksums](https://github.com/pym96/Pan-agent/releases/tag/v0.1.9). Prefer a user-owned Node/npm installation; if npm reports permission denied, fix its prefix rather than running Pan with sudo.

If your terminal reports `pan-agent: command not found`, finish installation first. Check `command -v pan-agent`; npm's global executable directory (`$(npm prefix -g)/bin` on macOS/Linux) must be on your `PATH`. Reopen the terminal after fixing your Node/npm setup. This is an installation/PATH issue, not an API-key error.

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

**Tools run with your host-user authority.** The workspace is a working directory, not a sandbox. Ctrl-C requests cancellation during execution and can retain the draft. Bare startup needs a terminal; see the [package guide](typescript/README.md) for command interfaces.

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
