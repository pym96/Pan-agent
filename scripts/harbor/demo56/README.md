# #56 original Harbor demonstration adapter

External, single-task orchestration around the unchanged released `runCli`/NativeKernel/TUI. Mac retains provider credentials and the TUI/archive. A credential-free SSH process runs pinned Harbor `DockerEnvironment` and `Verifier` on the server. The four injected tools route only to the one owned task container. This is not the stock trusted-local tool implementation, and stock UI host-authority wording is superseded by the launcher's explicit execution-boundary banner.

No Harbor CLI/Trial is claimed: this uses the pinned Python APIs directly. Original task instruction, `/app`, test script, source and resource limits are unchanged. Verifier is called after the actual session settles, active tool work drains, and the broker acknowledges a sealed agent phase; this includes watchdog cancellation. Container state remains available until verification. Existing task/provider errors are retained; a missing verifier artifact is unscored. The stock runtime's inherited 64 model rounds remain, as explicitly adjudicated by Master; no new round/token cap is added.

Before live use, freeze a config binding installed-package, script, task, image, Harbor, dependency identities, dedicated paths and resource settings. `launcher.mjs CONFIG ACTIVATION` requires a matching Master activation and creates an exclusive attempt receipt. It rejects an existing output/receipt. `record.py CONFIG ACTIVATION CAPTURE` captures this launcher through a real PTY. Criteria1.7 uses an explicitly bound automatic Allow-once channel through the installed session API; each request is audited and Runtime authorization remains active. The older marker-file mechanism is retained for historical recordings. No live task is part of the offline tests.

Preparation probes:

- `node test_approval.mjs`: per-request scoped approval, invalid identity/phase/abort refusal.
- `node test_deadline.mjs INSTALLED_DIST_INDEX`: installed NativeKernel cancellation during model/tool/approval waits with fake model and short offline timer; no real provider.
- `python test_handoff.py SERVER_DEMO_ROOT`: bounded harmless timed-out command, retained marker, post-stop dispatch refusal, original verifier on an unrecovered fixture (expected zero), cleanup. Not a model task or success result.

- `node test_tools.mjs INSTALLED_DIST_INDEX`: exact installed authorization interface, allow/deny/abort/path checks with fake RPC; zero model.
- `python test_broker.py SERVER_DEMO_ROOT`: temporary owned container; harmless file operations, path/symlink refusal, timeout and cleanup. No verifier or task solving.
- `python test_abort.py SERVER_DEMO_ROOT`: cancellation during a harmless sleep, stopped/removed container confirmation. No model/verifier.

`file_operation.py` is sent as code to the bound container's Python. It is never executed by host Python. Shell commands use Harbor's fixed container execution, no host fallback. Broker environment excludes provider credentials. Original task tests/oracle are never mounted during the agent phase; original Verifier copies tests only afterwards.

Private runtime/preparation outputs are identified in Handoff, not committed. Do not reuse #97 activation, archives or benchmark results. Pending live work is not an accepted score or release.

The agent deadline remains900s and ends admission, not environment lifetime. A30s stop-confirmation grace permits draining/cancellation only, never additional model/tool work. Failure to confirm stop remains unscored. The original verifier retains its own900s limit. Optional verifier-only dependency proxy uses an in-process relay bound to the owned Docker bridge gateway, accepts only that container IP, and forwards to an existing server loopback proxy. It starts after agent stop and closes before environment removal; no shared/global proxy configuration or original test changes.
