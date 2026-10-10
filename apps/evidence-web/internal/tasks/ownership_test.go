package tasks

import (
	"context"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/testfixture"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func claimedAuthority(t *testing.T, db *pgxpool.Pool, w string) Authority {
	t.Helper()
	ctx := context.Background()
	tid, _, _, e := claimTask(ctx, db, w)
	if e != nil {
		t.Fatal(e)
	}
	a := &Authority{Task: tid, Owner: w}
	if e = db.QueryRow(ctx, "SELECT execution_id,generation FROM ew_tasks WHERE id=$1", tid).Scan(&a.Attempt, &a.Generation); e != nil {
		t.Fatal(e)
	}
	return *a
}
func TestOwnershipClaimCompetition(t *testing.T) {
	db := testfixture.Database(t)
	testfixture.Owner(t, db, "worker-a")
	testfixture.Owner(t, db, "worker-b")
	first := testfixture.Task(t, db, "conversation-a", 1)
	testfixture.Task(t, db, "conversation-a", 2)
	other := testfixture.Task(t, db, "conversation-b", 1)
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
	testfixture.Owner(t, db, "new-worker")
	testfixture.Task(t, db, "conversation-c", 1)
	if _, _, _, e := claimTask(context.Background(), db, "new-worker"); e == nil {
		t.Fatal("old live slots ignored")
	}
}
func TestAdmissionRevocationLinearization(t *testing.T) {
	db := testfixture.Database(t)
	worker := identity.NewID()
	testfixture.Owner(t, db, worker)
	testfixture.Task(t, db, "conversation", 1)
	ctx := context.Background()
	a := claimedAuthority(t, db, worker)
	// Valid preflight, then revoke in the exact check-before-dispatch window.
	tx, e := db.Begin(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if e = requireAuthority(ctx, tx, a); e != nil {
		t.Fatal(e)
	}
	_ = tx.Rollback(ctx)
	_, _ = db.Exec(ctx, "UPDATE ew_tasks SET revoked_at=clock_timestamp(),state='interrupted' WHERE id=$1", a.Task)
	if e = New(db, nil).Admit(ctx, a, a, 1, "model"); e == nil {
		t.Fatal("preflight bypassed revocation")
	}
	if _, e = executorExec(ctx, db, a, "UPDATE ew_tasks SET state='completed' WHERE id=$1", a.Task); e == nil {
		t.Fatal("late completion accepted")
	}
	if e = New(db, nil).Checkpoint(ctx, a, t.TempDir(), "invalidate", "", ""); e == nil {
		t.Fatal("old checkpoint mutation accepted")
	}
	// A new generation is assigned only after explicit stop + queue in production.
	_, _ = db.Exec(ctx, "UPDATE ew_tasks SET state='queued',cleanup_confirmed=true,execution_id=$2 WHERE id=$1", a.Task, identity.NewID())
	b := claimedAuthority(t, db, worker)
	if b.Generation <= a.Generation {
		t.Fatal("generation not monotonic")
	}
	if e = New(db, nil).Admit(ctx, b, a, 1, "tool"); e == nil {
		t.Fatal("old identity accepted")
	}
	foreign := b
	foreign.Task = identity.NewID()
	if e = New(db, nil).Admit(ctx, b, foreign, 1, "tool"); e == nil {
		t.Fatal("foreign identity accepted")
	}
	if e = New(db, nil).Admit(ctx, b, b, 1, "tool"); e != nil {
		t.Fatal(e)
	}
	if e = New(db, nil).Admit(ctx, b, b, 1, "tool"); e == nil {
		t.Fatal("duplicate action admitted")
	}
	_, _ = db.Exec(ctx, "UPDATE ew_tasks SET state='cancelling',cancel_requested_at=now() WHERE id=$1", b.Task)
	if e = New(db, nil).Admit(ctx, b, b, 2, "model"); e == nil {
		t.Fatal("cancel bypassed")
	}
	var count int
	_ = db.QueryRow(ctx, "SELECT count(*) FROM ew_admissions WHERE attempt_id=$1", b.Attempt).Scan(&count)
	if count != 1 {
		t.Fatal("prior admission not retained")
	}
	if _, e = executorExec(ctx, db, a, "UPDATE ew_tasks SET state='completed' WHERE id=$1", a.Task); e == nil {
		t.Fatal("old result overwrites new attempt")
	}
}
func TestExpiredOwnerCannotRenew(t *testing.T) {
	db := testfixture.Database(t)
	worker := identity.NewID()
	testfixture.Owner(t, db, worker)
	testfixture.Task(t, db, "c", 1)
	ctx := context.Background()
	a := claimedAuthority(t, db, worker)
	_, _ = db.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp()-interval '20 seconds'")
	if e := New(db, nil).Admit(ctx, a, a, 1, "model"); e == nil {
		t.Fatal("expired lease still admits before reaper")
	}
	tag, e := db.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL AND heartbeat>clock_timestamp()-interval '10 seconds'", worker)
	if e != nil || tag.RowsAffected() != 0 {
		t.Fatal("expired owner renewed")
	}
	if e = revokeLost(ctx, db); e != nil {
		t.Fatal(e)
	}
	// Even an administratively advanced timestamp cannot revive the revoked owner.
	_, _ = db.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp()")
	if e = New(db, nil).Admit(ctx, a, a, 1, "model"); e == nil {
		t.Fatal("revoked owner resurrected")
	}
}
