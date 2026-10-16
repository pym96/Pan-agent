# #56 original Harbor demonstration adapter

External, single-task orchestration around the unchanged released `runCli`/NativeKernel/TUI. Mac retains provider credentials and the TUI/archive. A credential-free SSH process runs pinned Harbor `DockerEnvironment` and `Verifier` on the server. The four injected tools route only to the one owned task container. This is not the stock trusted-local tool implementation, and stock UI host-authority wording is superseded by the launcher's explicit execution-boundary banner.

No Harbor CLI/Trial is claimed: this uses the pinned Python APIs directly. Original task instruction, `/app`, test script, source and resource limits are unchanged. Verifier is called only after the TUI session settles and exits; container state remains available until verification. Existing task/provider errors are retained; a missing verifier artifact is unscored. The stock runtime's inherited 64 model rounds remain, as explicitly adjudicated by Master; no new round/token cap is added.

Before live use, freeze a config binding installed-package, script, task, image, Harbor, dependency identities, dedicated paths and resource settings. `launcher.mjs CONFIG ACTIVATION` requires a matching Master activation and creates an exclusive attempt receipt. It rejects an existing output/receipt. `record.py CONFIG ACTIVATION CAPTURE` captures this launcher through a real PTY and waits for explicit approval marker files. No live task is part of the offline tests.

Preparation probes:

- `node test_tools.mjs INSTALLED_DIST_INDEX`: exact installed authorization interface, allow/deny/abort/path checks with fake RPC; zero model.
- `python test_broker.py SERVER_DEMO_ROOT`: temporary owned container; harmless file operations, path/symlink refusal, timeout and cleanup. No verifier or task solving.
- `python test_abort.py SERVER_DEMO_ROOT`: cancellation during a harmless sleep, stopped/removed container confirmation. No model/verifier.

`file_operation.py` is sent as code to the bound container's Python. It is never executed by host Python. Shell commands use Harbor's fixed container execution, no host fallback. Broker environment excludes provider credentials. Original task tests/oracle are never mounted during the agent phase; original Verifier copies tests only afterwards.

Private runtime/preparation outputs are identified in Handoff, not committed. Do not reuse #97 activation, archives or benchmark results. Pending live work is not an accepted score or release.
