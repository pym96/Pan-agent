-- Fail closed on loss of the dedicated heartbeat connection, including before
-- the next heartbeat. Existing owners cannot inherit a new connection identity.
ALTER TABLE ew_owners ADD COLUMN connection_pid integer NOT NULL DEFAULT pg_backend_pid();
ALTER TABLE ew_owners ADD COLUMN connection_start timestamptz NOT NULL DEFAULT '-infinity';
ALTER TABLE ew_owners ADD COLUMN server_start timestamptz NOT NULL DEFAULT pg_postmaster_start_time();
UPDATE ew_owners SET revoked_at=COALESCE(revoked_at,clock_timestamp());
