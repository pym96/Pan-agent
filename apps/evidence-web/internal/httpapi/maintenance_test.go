package httpapi

import (
	"context"
	"errors"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/querylog"
	"pan-agent/evidence-web/internal/tasks"
	"pan-agent/evidence-web/internal/taskview"
	"pan-agent/evidence-web/internal/worker"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type recordedQueries struct {
	querylog.QueryTracer
	mu  sync.Mutex
	sql []string
}

func (r *recordedQueries) TraceQueryStart(ctx context.Context, c *pgx.Conn, d pgx.TraceQueryStartData) context.Context {
	r.mu.Lock()
	r.sql = append(r.sql, d.SQL)
	r.mu.Unlock()
	return r.QueryTracer.TraceQueryStart(ctx, c, d)
}

type stopProof struct {
	calls     int
	confirmed bool
}

func (p *stopProof) Stop(context.Context, int, string, string, string) error {
	p.calls++
	if !p.confirmed {
		return errors.New("stop still unknown")
	}
	return nil
}
func (p *stopProof) Reconcile(context.Context, string, []string, []byte) ([]byte, error) {
	return nil, errors.New("not used")
}
func TestQueriesReadOnlyAndMaintenanceBarrier(t *testing.T) {
	a, tid, token := cacheFixture(t)
	ctx := context.Background()
	db := a.db
	wid := identity.NewID()
	_, e := db.Exec(ctx, "INSERT INTO ew_owners(id,pid,connection_start,heartbeat) SELECT $1,1,backend_start,clock_timestamp()-interval '20 seconds' FROM pg_stat_activity WHERE pid=pg_backend_pid()", wid)
	if e != nil {
		t.Fatal(e)
	}
	_, e = db.Exec(ctx, "UPDATE ew_tasks SET state='running',worker_id=$2,execution_id=id,generation=1,started_at=now(),cleanup_confirmed=false WHERE id=$1", tid, wid)
	if e != nil {
		t.Fatal(e)
	}
	_, e = db.Exec(ctx, "INSERT INTO ew_attempts(id,task_id,owner_id,generation) VALUES($1,$1,$2,1)", tid, wid)
	if e != nil {
		t.Fatal(e)
	}
	trace := &recordedQueries{}
	pc := db.Config()
	pc.ConnConfig.Tracer = trace
	reader, e := pgxpool.NewWithConfig(ctx, pc)
	if e != nil {
		t.Fatal(e)
	}
	defer reader.Close()
	a.identity = identity.New(reader)
	a.queries = taskview.New(reader)
	proof := &stopProof{}
	store := tasks.New(db, proof)
	coordinator := worker.Coordinator{Store: store, Config: config.Config{Maintenance: time.Second}}
	release := make(chan struct{})
	done := make(chan error, 1)
	go func() { <-release; done <- coordinator.Cycle(ctx) }()
	for _, mode := range []string{"miss", "hit", "off"} {
		if mode == "off" {
			a.views.cfg.Enabled = false
		}
		w := viewRequest(a, tid, token)
		if w.Code != 200 || stateOf(w) != "running" {
			t.Fatal(mode, w.Code, w.Body.String())
		}
	}
	trace.mu.Lock()
	for _, q := range trace.sql {
		if !strings.HasPrefix(strings.TrimSpace(strings.ToUpper(q)), "SELECT ") {
			t.Fatal("read path wrote lifecycle", q)
		}
	}
	n := len(trace.sql)
	trace.mu.Unlock()
	var revoked bool
	db.QueryRow(ctx, "SELECT revoked_at IS NOT NULL FROM ew_owners WHERE id=$1", wid).Scan(&revoked)
	if revoked || proof.calls != 0 {
		t.Fatal("query caused revocation/stop")
	}
	// No more HTTP requests. The completion channel observes the entire maintenance cycle.
	close(release)
	if e = <-done; e == nil {
		t.Fatal("unknown stop reported successful")
	}
	var state string
	var stopped bool
	db.QueryRow(ctx, "SELECT state,cleanup_confirmed FROM ew_tasks WHERE id=$1", tid).Scan(&state, &stopped)
	if state != "interrupted" || stopped || proof.calls != 1 {
		t.Fatal(state, stopped, proof.calls)
	}
	// Confirmed stop only in a later explicit cycle; old owner never revives.
	proof.confirmed = true
	if e = coordinator.Cycle(ctx); e != nil {
		t.Fatal(e)
	}
	db.QueryRow(ctx, "SELECT cleanup_confirmed FROM ew_tasks WHERE id=$1", tid).Scan(&stopped)
	if !stopped {
		t.Fatal("no stop proof")
	}
	_, e = db.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp() WHERE id=$1", wid)
	if e != nil {
		t.Fatal(e)
	}
	if e = store.Admit(ctx, tasks.Authority{Task: tid, Attempt: tid, Owner: wid, Generation: 1}, tasks.Authority{Task: tid, Attempt: tid, Owner: wid, Generation: 1}, 1, "model"); e == nil {
		t.Fatal("maintenance resurrected old owner")
	}
	t.Logf("%d categorized HTTP SQL statements SELECT-only; paused maintenance hit/miss/off leave owner intact; cycle completion without reads revokes, unknown stop fails closed, later proof stops", n)
}
