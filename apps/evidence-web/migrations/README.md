# PostgreSQL migrations

001.sql is embedded in the Go executable and runs idempotently at startup/account initialization. ew_accounts and hashed ew_sessions establish identity; ew_bundles owns parser output and account ownership; ew_files stores exact immutable upload bytes plus SHA256. File rows and bundle metadata commit in one transaction. Tables belong to a dedicated web106 database; never point the helper at shared production state. Future schema changes need new migrations. The first slice supports PostgreSQL14+ and has no Redis authority.
