ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS active_branch boolean NOT NULL DEFAULT true;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS replaces text REFERENCES ew_tasks(id);
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS stop_confirmed_at timestamptz;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS attempt_result jsonb;
ALTER TABLE ew_tasks DROP CONSTRAINT IF EXISTS ew_tasks_state_check;
ALTER TABLE ew_tasks ADD CONSTRAINT ew_tasks_state_check CHECK(state IN ('queued','running','completed','failed','interrupted','blocked','cancelling','cancelled','superseded'));
CREATE TABLE IF NOT EXISTS ew_controls (
 account_id text NOT NULL REFERENCES ew_accounts(id), conversation_id text NOT NULL REFERENCES ew_conversations(id),
 request_id text NOT NULL, target_id text NOT NULL REFERENCES ew_tasks(id), action text NOT NULL, question text NOT NULL,
 replacement_id text REFERENCES ew_tasks(id), decision text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,conversation_id,request_id)
);
