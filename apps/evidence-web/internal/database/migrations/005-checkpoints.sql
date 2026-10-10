-- Private state is never selected by public projections. Same task, distinct attempts.
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS execution_id text;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS resume_checkpoint text;
CREATE TABLE IF NOT EXISTS ew_attempts (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES ew_tasks(id),
 checkpoint_id text, node_pid integer, started_at timestamptz NOT NULL DEFAULT now(),
 stopped_at timestamptz, state text NOT NULL DEFAULT 'running', result jsonb
);
CREATE TABLE IF NOT EXISTS ew_checkpoints (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES ew_tasks(id),
 attempt_id text NOT NULL REFERENCES ew_attempts(id), account_id text NOT NULL REFERENCES ew_accounts(id),
 conversation_id text, bundle_id text NOT NULL REFERENCES ew_bundles(id),
 sha256 text NOT NULL, payload bytea NOT NULL, eligible boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), consumed_by text
);
CREATE TABLE IF NOT EXISTS ew_resumes (
 account_id text NOT NULL, conversation_id text NOT NULL, request_id text NOT NULL,
 task_id text NOT NULL, checkpoint_id text NOT NULL, attempt_id text NOT NULL,
 PRIMARY KEY(account_id,conversation_id,request_id)
);
