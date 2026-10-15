# Pan Agent

A terminal agent for working with local files and shell commands. Watch tool calls, approve operations, and replay saved runs without calling the model or executing tools again.

## Requirements

- Node.js **22.19.0 or newer**, with npm.
- An interactive terminal. Validated on macOS arm64; Linux and Windows are not yet verified for this release.
- For real tasks: a DeepSeek or Kimi Code API key. The offline demo requires no key.

The installed runtime needs no Python, Go, Docker, PostgreSQL, Redis or TypeScript compiler.

## Install

Download the **v0.1.0** assets from GitHub Releases:

- [TUI package: pan-agent-0.1.0.tgz](https://github.com/pym96/Pan-agent/releases/download/v0.1.0/pan-agent-0.1.0.tgz)
- [SHA256SUMS](https://github.com/pym96/Pan-agent/releases/download/v0.1.0/SHA256SUMS)

Download both files into a new directory and run:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
npm install ./pan-agent-0.1.0.tgz --omit=dev --ignore-scripts --no-audit --no-fund
./node_modules/.bin/pan-agent --help
```

On systems whose `shasum` does not support `--ignore-missing`, run `shasum -a 256 pan-agent-0.1.0.tgz` and compare it with the matching line in SHA256SUMS. The checksum file also lists the optional video. No build is needed for the prebuilt package. The package is not published on npm.

To build from source:

```sh
git clone https://github.com/pym96/Pan-agent.git
cd Pan-agent
npm --prefix typescript ci --ignore-scripts
mkdir -p artifacts
(cd typescript && npm pack --pack-destination ../artifacts)
mkdir -p consumer
cd consumer
npm install ../artifacts/pan-agent-0.1.0.tgz --omit=dev --ignore-scripts --no-audit --no-fund
```

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

[Watch database recovery and same-run trace replay](https://github.com/pym96/Pan-agent/releases/download/v0.1.1/pan-agent-wal-demo.mp4) — a real Kimi-driven task: recover 11 records, inspect a failed checksum, correct it and verify the output. [Task, adaptation and recording details](docs/demo/tui-release56/WAL-DEMO.md). This is an adapted Terminal-Bench task demonstration, not an official benchmark score.

[Watch/download the 41-second demo](https://github.com/pym96/Pan-agent/releases/download/v0.1.0/pan-agent-demo.mp4) — an actual installed TUI task followed by same-run replay. [Recording details](docs/demo/tui-release56/README.md). The recording shows the installed TUI, a file task and the same run's trace replay, with its real/offline mode disclosed.

## License

[MIT License](LICENSE), copyright 2026 Pan Agent contributors. Third-party dependencies and retained external materials keep their own licenses; MIT applies to Pan-authored code. [Dependency and licensing inventory](docs/demo/tui-release56/LICENSE-INVENTORY.md).

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
