# PostgreSQL migrations

001.sql preserves #106 accounts, hashed sessions, bundle ownership/overview and exact bytea input files.002.sql adds tasks, ordered observations, immutable artifact bytes and a single Worker heartbeat. SQL files are embedded and applied in filename order at startup; each is idempotent for the current schema.

A session-scoped advisory lock on a dedicated PostgreSQL connection excludes a second Worker. That same connection updates its heartbeat. Connection failure cancels admission/execution. Stale running tasks become interrupted/unknown on status reads after10s without heartbeat. Startup reconciles only previously owned Node/container identities before new admission; cleanup uncertainty blocks admission. Interrupted tasks are not automatically requeued. This is one-Worker local lifecycle handling, not distributed leases/checkpoint recovery or exactly-once execution.

003.sql adds immutable bundle-bound conversations, per-conversation request/order uniqueness and nullable task snapshot/start fields; legacy results are preserved without manufactured context. Adds visible blocked terminal state. Probe: scripts/check-migration108.py (rollback-only owned schema).

004.sql adds control intents, active-branch/replaces and cancellation/stop/attempt fields without deleting prior rows. Startup applies pending SQL under a transaction/advisory lock and hash ledger;003 skips narrowing the state vocabulary on a post004 schema. check-migration109.py verifies legacy content and cancellation preservation with real SQL in a rolled-back owned schema.

- `005-checkpoints.sql`: nullable current execution/resume references, separate attempts, private checkpoint payloads/eligibility and an idempotent resume ledger. Historical tasks receive no fabricated attempt records. Existing migration hash receipts remain unchanged.

006_operations.sql adds private Worker verifier configuration and retained reconciliation decisions without altering prior task/checkpoint records.

007 adds per-owner leases, task/attempt generations and the append-only action-admission ledger. 008 binds owner authority to its dedicated PG backend/start identity and revokes older owners during migration. Both require legacy Workers stopped; migrations acquire the exclusive Worker advisory lock. Existing source/results/usage are preserved.
