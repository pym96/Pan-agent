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
npm install /path/to/pan-agent-0.1.0.tgz --omit=dev --ignore-scripts --no-audit --no-fund
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

Pan-authored code is licensed under the MIT License included as `LICENSE` in this package, copyright 2026 Pan Agent contributors. Third-party licenses are not replaced by Pan's license. Install the v0.1.0 tarball from GitHub Releases; this package is not published on npm.

Runtime code has no third-party npm runtime dependencies. Build-time dependencies: TypeScript (Apache-2.0), @types/node (MIT), undici-types (MIT). These dependencies are not bundled. The repository's license inventory documents separate recording tools and retained references.
