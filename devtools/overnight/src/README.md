# Source map

- `model.ts`: strict public manifest/result identity, fixed templates, safe display.
- `storage.ts`: checksummed ledger, exclusive owner, explicit recovery and tracker interface.
- `process.ts`: process interface, fixed offline launch, ordinary process-group inventory/cleanup, local Git adapter.
- `coordinator.ts`: bounded single-job transitions, result/ref validation, recovery and summary.
- `fixture.ts`: disposable offline manifest/Git fixture factory; synthetic authorization only.
- `cli.ts`: foreground start/status/stop/resume/demo entry.
- `check-package.ts`: protected base bytes and independent package checks.

Back to [operator guide](../README.md). No Pan/Provider/account imports.

#46 adds `connector.ts` (explicit staged CLI), `connector-authority.ts` (Human/binary/config binding), `codex-process.ts` (existing ProcessAdapter), `connector-output.ts` (bounded JSONL/structured-result evidence), `github-tracker.ts` (fixed issue and intent/read-back), and `check-package-46.ts` (new version-aware scope gate). The historical #45 scope checker remains unchanged and is run on its exact accepted baseline.
