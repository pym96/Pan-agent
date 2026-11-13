# Pan Agent

A terminal agent for local files and shell commands, with tool approvals and saved-run replay.

**Requirements:** Node.js **22.19.0+**, npm, and an interactive terminal. The local runtime needs no compiler, Python, Docker or database. Windows is not verified.

## Install

```sh
npm install -g --ignore-scripts https://github.com/pym96/Pan-agent/releases/download/v0.1.9/pan-agent-0.1.9.tgz
pan-agent
```

This installs the prebuilt **v0.1.9** release; no Git checkout or build is needed. [Release assets and checksums](https://github.com/pym96/Pan-agent/releases/tag/v0.1.9). Prefer a user-owned Node/npm installation; if npm reports permission denied, fix its prefix rather than running Pan with sudo.

## First run

Enter a project directory and run `pan-agent`. The first-run wizard selects the provider, model and credential source. Subsequent launches reuse those preferences.

- **Workspace:** current directory. Override with `--workspace DIR`.
- **History:** `~/.pan-agent/archives`. Override with `--memory-root DIR`.
- **Settings:** `~/.pan-agent/settings.json`; API keys are not stored in this file.

Choose environment credentials and set `DEEPSEEK_API_KEY` or `KIMI_API_KEY` using your secret manager. macOS Keychain is also available through the wizard. Use `pan-agent configure` to change preferences. Startup, configuration and idle make no model requests; submitting a real task may incur provider charges.

Keep history outside the workspace. If starting from your home directory causes overlap, enter a project subdirectory or supply a disjoint `--memory-root`. Bare startup needs a terminal; automation should use the explicit command interfaces in the [package guide](typescript/README.md).

**Tools run with your host-user authority.** The workspace is a working directory, not a sandbox. Review tool approvals and use a disposable project for your first task. Use `:exit` to quit; Ctrl-C requests cancellation during execution and can retain the draft.

## Try it without a key

```sh
pan-agent demo
```

The demo uses a scripted offline model with the actual TUI and tools. Ask `Create hello.js, run it, and read it back.`, then approve the shell command. Use `:runs` and `:replay RUN_ID` to inspect saved execution without rerunning tools or calling a model; `:exit` quits.

## Watch

[Real-time Markdown](https://github.com/pym96/Pan-agent/releases/download/v0.1.5/pan-agent-markdown-live.mp4) · [Database recovery with Harbor verification](https://github.com/pym96/Pan-agent/releases/download/v0.1.3/pan-agent-harbor-demo.mp4)

These recordings retain their original versions and scopes. [Recording details](docs/demo/tui-release56/README.md).

## More

[Package, build and publish guide](typescript/README.md) · [Sandbox, Loop and Goal](docs/demo/consumer-readiness/README.md) · [Architecture](CONTEXT.md) · [Design](docs/design/README.md) · [Evidence](docs/evidence/README.md)

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
