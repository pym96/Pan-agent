package main

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"sync"
	"testing"
)

// Real PostgreSQL transactions in a unique rollback-independent schema. No
// existing application tasks or runtimes are mutated, and no executor is started.
func ownershipDB(t *testing.T) *pgxpool.Pool {
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
	schema := "probe112_" + id()
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
	entries, _ := migrations.ReadDir("migrations")
	for _, f := range entries {
		sql, _ := migrations.ReadFile("migrations/" + f.Name())
		if _, e = db.Exec(ctx, string(sql)); e != nil {
			t.Fatal(e)
		}
	}
	_, e = db.Exec(ctx, `INSERT INTO ew_accounts VALUES('account','synthetic@example.test','unused'); INSERT INTO ew_bundles(id,account_id,title,summary_name,parser_version,overview) VALUES('bundle','account','fixture','summary.json','fixture','{}'); INSERT INTO ew_files VALUES('bundle','summary.json','fixture',decode('7b7d','hex'))`)
	if e != nil {
		t.Fatal(e)
	}
	t.Setenv("WEB_ISSUE", "web112")
	return db
}
func ownerFixture(t *testing.T, db *pgxpool.Pool, w string) {
	t.Helper()
	if _, e := db.Exec(context.Background(), "INSERT INTO ew_owners(id,pid,connection_start) SELECT $1,1,backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()", w); e != nil {
		t.Fatal(e)
	}
}
func taskFixture(t *testing.T, db *pgxpool.Pool, c string, seq int) string {
	t.Helper()
	tid := id()
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
func claimedAuthority(t *testing.T, db *pgxpool.Pool, w string) context.Context {
	t.Helper()
	ctx := context.Background()
	tid, _, _, e := claimTask(ctx, db, w)
	if e != nil {
		t.Fatal(e)
	}
	a := &authority{Task: tid, Owner: w}
	if e = db.QueryRow(ctx, "SELECT execution_id,generation FROM ew_tasks WHERE id=$1", tid).Scan(&a.Attempt, &a.Generation); e != nil {
		t.Fatal(e)
	}
	return context.WithValue(ctx, authorityKey{}, a)
}
func TestOwnershipClaimCompetition(t *testing.T) {
	db := ownershipDB(t)
	ownerFixture(t, db, "worker-a")
	ownerFixture(t, db, "worker-b")
	first := taskFixture(t, db, "conversation-a", 1)
	taskFixture(t, db, "conversation-a", 2)
	other := taskFixture(t, db, "conversation-b", 1)
	var wg sync.WaitGroup
	got := make(chan string, 2)
	errs := make(chan error, 2)
	for _, w := range []string{"worker-a", "worker-b"} {
		wg.Add(1)
		go func(w string) {
			defer wg.Done()
			tid, _, _, e := claimTask(context.Background(), db, w)
			got <- tid
			errs <- e
		}(w)
	}
	wg.Wait()
	close(got)
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	seen := map[string]bool{}
	for tid := range got {
		seen[tid] = true
	}
	if len(seen) != 2 || !seen[first] || !seen[other] {
		t.Fatalf("claims: %v", seen)
	}
	if _, _, _, e := claimTask(context.Background(), db, "worker-a"); e == nil {
		t.Fatal("third resource slot admitted")
	}
	// Expiration cannot release a live slot, nor manufacture stop confirmation.
	_, _ = db.Exec(context.Background(), "UPDATE ew_owners SET heartbeat=clock_timestamp()-interval '20 seconds'")
	if e := revokeLost(context.Background(), db); e != nil {
		t.Fatal(e)
	}
	var count int
	_ = db.QueryRow(context.Background(), "SELECT count(*) FROM ew_tasks WHERE revoked_at IS NOT NULL AND NOT cleanup_confirmed").Scan(&count)
	if count != 2 {
		t.Fatal(count)
	}
	ownerFixture(t, db, "new-worker")
	taskFixture(t, db, "conversation-c", 1)
	if _, _, _, e := claimTask(context.Background(), db, "new-worker"); e == nil {
		t.Fatal("old live slots ignored")
	}
}
func TestAdmissionRevocationLinearization(t *testing.T) {
	db := ownershipDB(t)
	ownerFixture(t, db, "worker")
	taskFixture(t, db, "conversation", 1)
	ctx := claimedAuthority(t, db, "worker")
	a := *getAuthority(ctx)
	// Valid preflight, then revoke in the exact check-before-dispatch window.
	tx, e := db.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if e = requireAuthority(ctx, tx); e != nil {
		t.Fatal(e)
	}
	_ = tx.Rollback(ctx)
	_, _ = db.Exec(ctx, "UPDATE ew_tasks SET revoked_at=clock_timestamp(),state='interrupted' WHERE id=$1", a.Task)
	if e = admit(ctx, db, a, 1, "model"); e == nil {
		t.Fatal("preflight bypassed revocation")
	}
	if _, e = executorExec(ctx, db, "UPDATE ew_tasks SET state='completed' WHERE id=$1", a.Task); e == nil {
		t.Fatal("late completion accepted")
	}
	if e = checkpointBarrier(ctx, db, a.Task, a.Attempt, t.TempDir(), "invalidate", "", ""); e == nil {
		t.Fatal("old checkpoint mutation accepted")
	}
	// A new generation is assigned only after explicit stop + queue in production.
	_, _ = db.Exec(ctx, "UPDATE ew_tasks SET state='queued',cleanup_confirmed=true,execution_id=$2 WHERE id=$1", a.Task, id())
	newer := claimedAuthority(t, db, "worker")
	b := *getAuthority(newer)
	if b.Generation <= a.Generation {
		t.Fatal("generation not monotonic")
	}
	if e = admit(newer, db, a, 1, "tool"); e == nil {
		t.Fatal("old identity accepted")
	}
	foreign := b
	foreign.Task = id()
	if e = admit(newer, db, foreign, 1, "tool"); e == nil {
		t.Fatal("foreign identity accepted")
	}
	if e = admit(newer, db, b, 1, "tool"); e != nil {
		t.Fatal(e)
	}
	if e = admit(newer, db, b, 1, "tool"); e == nil {
		t.Fatal("duplicate action admitted")
	}
	_, _ = db.Exec(ctx, "UPDATE ew_tasks SET state='cancelling',cancel_requested_at=now() WHERE id=$1", b.Task)
	if e = admit(newer, db, b, 2, "model"); e == nil {
		t.Fatal("cancel bypassed")
	}
	var count int
	_ = db.QueryRow(ctx, "SELECT count(*) FROM ew_admissions WHERE attempt_id=$1", b.Attempt).Scan(&count)
	if count != 1 {
		t.Fatal("prior admission not retained")
	}
	if _, e = executorExec(ctx, db, "UPDATE ew_tasks SET state='completed' WHERE id=$1", a.Task); e == nil {
		t.Fatal("old result overwrites new attempt")
	}
}
func TestExpiredOwnerCannotRenew(t *testing.T) {
	db := ownershipDB(t)
	ownerFixture(t, db, "worker")
	taskFixture(t, db, "c", 1)
	ctx := claimedAuthority(t, db, "worker")
	a := *getAuthority(ctx)
	_, _ = db.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp()-interval '20 seconds'")
	if e := admit(ctx, db, a, 1, "model"); e == nil {
		t.Fatal("expired lease still admits before reaper")
	}
	tag, e := db.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp() WHERE id='worker' AND revoked_at IS NULL AND heartbeat>clock_timestamp()-interval '10 seconds'")
	if e != nil || tag.RowsAffected() != 0 {
		t.Fatal("expired owner renewed")
	}
	if e = revokeLost(ctx, db); e != nil {
		t.Fatal(e)
	}
	// Even an administratively advanced timestamp cannot revive the revoked owner.
	_, _ = db.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp()")
	if e = admit(ctx, db, a, 1, "model"); e == nil {
		t.Fatal("revoked owner resurrected")
	}
}
