# PostgreSQL migrations

001.sql preserves #106 accounts, hashed sessions, bundle ownership/overview and exact bytea input files.002.sql adds tasks, ordered observations, immutable artifact bytes and a single Worker heartbeat. SQL files are embedded and applied in filename order at startup; each is idempotent for the current schema.

A session-scoped advisory lock on a dedicated PostgreSQL connection excludes a second Worker. That same connection updates its heartbeat. Connection failure cancels admission/execution. Stale running tasks become interrupted/unknown on status reads after10s without heartbeat. Startup reconciles only previously owned Node/container identities before new admission; cleanup uncertainty blocks admission. Interrupted tasks are not automatically requeued. This is one-Worker local lifecycle handling, not distributed leases/checkpoint recovery or exactly-once execution.

003.sql adds immutable bundle-bound conversations, per-conversation request/order uniqueness and nullable task snapshot/start fields; legacy results are preserved without manufactured context. Adds visible blocked terminal state. Probe: scripts/check-migration108.py (rollback-only owned schema).
