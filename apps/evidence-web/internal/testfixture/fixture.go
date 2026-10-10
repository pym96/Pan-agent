package testfixture

import (
	"context"
	"os"
	"pan-agent/evidence-web/internal/database"
	"pan-agent/evidence-web/internal/identity"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Real PostgreSQL transactions in a unique rollback-independent schema. No
// existing application tasks or runtimes are mutated, and no executor is started.
func Database(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("WEB112_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("owned PostgreSQL fixture not configured")
	}
	ctx := context.Background()
	base, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	schema := "probe112_" + identity.NewID()
	if _, e = base.Exec(ctx, "CREATE SCHEMA "+schema); e != nil {
		t.Fatal(e)
	}
	cfg, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	cfg.MaxConns = 4
	db, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		db.Close()
		_, _ = base.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		base.Close()
	})
	if e = database.Migrate(ctx, db); e != nil {
		t.Fatal(e)
	}
	_, e = db.Exec(ctx, `INSERT INTO ew_accounts VALUES('account','synthetic@example.test','unused'); INSERT INTO ew_bundles(id,account_id,title,summary_name,parser_version,overview) VALUES('bundle','account','fixture','summary.json','fixture','{}'); INSERT INTO ew_files VALUES('bundle','summary.json','fixture',decode('7b7d','hex'))`)
	if e != nil {
		t.Fatal(e)
	}
	t.Setenv("WEB_ISSUE", "web112")
	return db
}
func Owner(t *testing.T, db *pgxpool.Pool, w string) {
	t.Helper()
	if _, e := db.Exec(context.Background(), "INSERT INTO ew_owners(id,pid,connection_start) SELECT $1,1,backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()", w); e != nil {
		t.Fatal(e)
	}
}
func Task(t *testing.T, db *pgxpool.Pool, c string, seq int) string {
	t.Helper()
	tid := identity.NewID()
	_, e := db.Exec(context.Background(), "INSERT INTO ew_conversations(id,account_id,bundle_id) VALUES($1,'account','bundle') ON CONFLICT DO NOTHING", c)
	if e != nil {
		t.Fatal(e)
	}
	_, e = db.Exec(context.Background(), "INSERT INTO ew_tasks(id,account_id,bundle_id,question,state,conversation_id,message_sequence,request_id) VALUES($1,'account','bundle','fixture','queued',$2,$3,$1)", tid, c, seq)
	if e != nil {
		t.Fatal(e)
	}
	return tid
}
