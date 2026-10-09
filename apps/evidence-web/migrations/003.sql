CREATE TABLE IF NOT EXISTS ew_conversations (
 id text PRIMARY KEY, bundle_id text NOT NULL REFERENCES ew_bundles(id), account_id text NOT NULL REFERENCES ew_accounts(id),
 next_sequence bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS conversation_id text REFERENCES ew_conversations(id);
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS message_sequence bigint;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS context_text text;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS context_sha256 text;
ALTER TABLE ew_tasks ADD COLUMN IF NOT EXISTS started_at timestamptz;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='ew_tasks'::regclass AND attname='active_branch' AND NOT attisdropped) THEN
  ALTER TABLE ew_tasks DROP CONSTRAINT IF EXISTS ew_tasks_state_check;
  ALTER TABLE ew_tasks ADD CONSTRAINT ew_tasks_state_check CHECK(state IN ('queued','running','completed','failed','interrupted','blocked'));
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ew_message_order ON ew_tasks(conversation_id,message_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS ew_request_identity ON ew_tasks(account_id,conversation_id,request_id);
