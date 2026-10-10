-- Additive migration. Stop legacy (unfenced) application Workers before applying.
CREATE TABLE ew_owners (
 id text PRIMARY KEY, heartbeat timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz, pid integer NOT NULL
);
ALTER TABLE ew_tasks ADD COLUMN generation bigint NOT NULL DEFAULT 0;
ALTER TABLE ew_tasks ADD COLUMN revoked_at timestamptz;
ALTER TABLE ew_attempts ADD COLUMN owner_id text;
ALTER TABLE ew_attempts ADD COLUMN generation bigint NOT NULL DEFAULT 0;
CREATE TABLE ew_admissions (
 task_id text NOT NULL REFERENCES ew_tasks(id), attempt_id text NOT NULL REFERENCES ew_attempts(id),
 owner_id text NOT NULL REFERENCES ew_owners(id), generation bigint NOT NULL,
 ordinal bigint NOT NULL, action text NOT NULL CHECK(action IN ('model','tool')),
 monotonic_ns bigint NOT NULL, admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(attempt_id,ordinal)
);
