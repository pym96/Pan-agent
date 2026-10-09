-- Private host configuration, never API supplied; latest owned Worker registers its verifier.
CREATE TABLE IF NOT EXISTS ew_reconcile_runtime (
 singleton integer PRIMARY KEY CHECK(singleton=111), entry text NOT NULL, environment jsonb NOT NULL
);
ALTER TABLE ew_checkpoints ADD COLUMN IF NOT EXISTS reconciliation jsonb;
