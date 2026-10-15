# Pan Agent

A terminal agent for working with local files and shell commands. Watch tool calls, approve operations, and replay saved runs without calling the model or executing tools again.

## Requirements

- Node.js **22.19.0 or newer**, with npm.
- An interactive terminal. Validated on macOS arm64; Linux and Windows are not yet verified for this release.
- For real tasks: a DeepSeek or Kimi Code API key. The offline demo requires no key.

The installed runtime needs no Python, Go, Docker, PostgreSQL, Redis or TypeScript compiler.

## Install

Release downloads are **pending review and license selection**. Until published, build from this repository:

```sh
git clone https://github.com/pym96/Pan-agent.git
cd Pan-agent
npm --prefix typescript ci --ignore-scripts
mkdir -p artifacts
(cd typescript && npm pack --pack-destination ../artifacts)
mkdir -p consumer
cd consumer
npm install ../artifacts/pan-agent-0.1.0.tgz --omit=dev --ignore-scripts --no-audit --no-fund
./node_modules/.bin/pan-agent --help
```

Once the `.tgz` is available in Releases, install that downloaded file with the same `npm install` command. No build is needed for a prebuilt package. The package is not published on npm.

## Try it without an API key

From the consumer directory:

```sh
./node_modules/.bin/pan-agent demo
```

This is an **offline, scripted model** using the real installed TUI, runtime and local tools. It creates a disposable workspace and prints its location. Submit `Create hello.js, run it, and read it back.`; inspect and approve the shell operation. The expected file contains `console.log("PAN_DEMO_OK");`.

Use `:runs` to find its run ID, then `:replay RUN_ID` to view the same saved run. Replay makes no model calls and does not rerun tools. Use `:exit` to close. Demo files remain available for inspection.

## Configure and run real tasks

```sh
./node_modules/.bin/pan-agent configure
```

Select your provider, model and credential source. Settings store preferences, **not the API key**. Choose environment credentials and set `KIMI_API_KEY` or `DEEPSEEK_API_KEY` in your terminal using your preferred secret manager; do not put keys in the repository or command arguments. macOS Keychain storage is also available through the configuration wizard.

```sh
mkdir -p workspace archives
./node_modules/.bin/pan-agent --kernel native \
  --workspace "$PWD/workspace" --memory-root "$PWD/archives"
```

Ask a task such as “Create hello.js that prints hello, run it, and check the file.” Real mode calls your provider and may incur charges. Blank input, startup, configuration and replay do not call a model.

**Local authority:** tools execute as your host user. The workspace is a working directory, **not a sandbox**. Review shell/protected-file approvals and use a disposable directory for your first task. Ctrl-C requests cancellation during execution; at idle it closes the TUI.

## Demonstration

[Recording guide and video status](docs/demo/tui-release56/README.md). A 41-second live-task and same-run replay video is recorded and awaiting review; no public video asset is available yet. The recording shows the installed TUI, a file task and the same run's trace replay, with its real/offline mode disclosed.

## License

**License selection pending.** No open-source license has been granted for this repository yet. Public release is blocked until the author selects a license and the package/notice checks are complete. [Dependency and licensing inventory](docs/demo/tui-release56/LICENSE-INVENTORY.md).

## Development

[Package guide](typescript/README.md) · [Architecture vocabulary](CONTEXT.md) · [Design documents](docs/design/README.md) · [Evidence](docs/evidence/README.md)

The TypeScript runtime/TUI is the user-facing product. Historical Python experiments, evaluation infrastructure and Web tooling remain in the repository for reference; they are not prerequisites for using the TUI.

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
