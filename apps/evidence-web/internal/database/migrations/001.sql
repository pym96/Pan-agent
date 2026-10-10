CREATE TABLE IF NOT EXISTS ew_accounts (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS ew_sessions (
 token_hash text PRIMARY KEY, account_id text NOT NULL REFERENCES ew_accounts(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ew_bundles (
 id text PRIMARY KEY, account_id text NOT NULL REFERENCES ew_accounts(id),
 title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 summary_name text NOT NULL, parser_version text NOT NULL, overview jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ew_bundle_owner ON ew_bundles(account_id,created_at);
CREATE TABLE IF NOT EXISTS ew_files (
 bundle_id text NOT NULL REFERENCES ew_bundles(id), name text NOT NULL,
 sha256 text NOT NULL, content bytea NOT NULL,
 PRIMARY KEY(bundle_id,name)
);
