package worker_test

import (
	"context"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/tasks"
	"pan-agent/evidence-web/internal/worker"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDatabaseFailureIsBounded(t *testing.T) {
	cfg, e := pgxpool.ParseConfig("postgres://fixture:fixture@127.0.0.1:1/absent?sslmode=disable")
	if e != nil {
		t.Fatal(e)
	}
	db, e := pgxpool.NewWithConfig(context.Background(), cfg)
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	c := worker.Coordinator{Store: tasks.New(db, nil), Config: config.Config{Maintenance: time.Second}}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if e = c.Cycle(ctx); e == nil {
		t.Fatal("unavailable DB cycle reported success")
	}
	// Cancelled supervision returns without another retry; no aggressive wall-clock SLO.
	done := make(chan struct{})
	cancel()
	go func() { c.Run(ctx); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("cancelled coordinator stuck")
	}
}
