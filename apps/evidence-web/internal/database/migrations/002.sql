CREATE TABLE IF NOT EXISTS ew_tasks (
 id text PRIMARY KEY, bundle_id text NOT NULL REFERENCES ew_bundles(id), account_id text NOT NULL REFERENCES ew_accounts(id),
 question text NOT NULL, state text NOT NULL CHECK(state IN ('queued','running','completed','failed','interrupted')),
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 worker_id text, node_pid integer, result jsonb, reason text, cleanup_confirmed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ew_tasks_owner ON ew_tasks(account_id,bundle_id,created_at);
CREATE TABLE IF NOT EXISTS ew_task_events (
 sequence bigserial PRIMARY KEY, task_id text NOT NULL REFERENCES ew_tasks(id), event jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS ew_task_artifacts (
 task_id text NOT NULL REFERENCES ew_tasks(id), name text NOT NULL, sha256 text NOT NULL, content bytea NOT NULL,
 PRIMARY KEY(task_id,name)
);
CREATE TABLE IF NOT EXISTS ew_worker_lease (singleton integer PRIMARY KEY CHECK(singleton=107), worker_id text NOT NULL, heartbeat timestamptz NOT NULL);
