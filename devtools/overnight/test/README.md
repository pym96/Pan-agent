# Complete offline tests

`overnight.test.ts` covers C-AUTO-01…07 with actual local role processes, Git remotes/worktrees, real coordinator crash points, concurrency, fake-clock boundaries, owned descendant cancellation, canaries and CLI commands. Named A-* indexes retain per-case identities, observed counters and raw timing. See the [obligation map](../../../docs/design/workorder-45-obligations.json).

The test-only raw canary input and unexpected role results are explicitly labelled synthetic fixtures. They are excluded from credential-free public reports, while actual argv/environment, generated ledger/tracker/status outputs are scanned. Negative controls must be detected. Failure records remain retained; a later repair run uses a fresh evidence directory.
