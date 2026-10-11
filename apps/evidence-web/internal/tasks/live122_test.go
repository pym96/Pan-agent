package tasks

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/result"
	"pan-agent/evidence-web/internal/testfixture"
	"strings"
	"testing"
)

func TestLiveSessionAndResume122(t *testing.T) {
	db := testfixture.Database(t)
	ctx := context.Background()
	s := New(db, nil)
	// No credential may be serialized even if a future caller passes an unsafe env.
	if _, e := s.OpenSession(ctx, "/executor", []string{"WEB_PROVIDER=kimi", "KIMI_API_KEY=SYNTHETIC-122"}); e == nil {
		t.Fatal("credential persisted")
	}
	live, e := s.OpenSession(ctx, "/executor", []string{"WEB_PROVIDER=kimi", "PATH=/bin"})
	if e != nil {
		t.Fatal(e)
	}
	for _, mode := range []string{"kimi", "offline-faux"} {
		if other, e := s.OpenSession(ctx, "/executor", []string{"WEB_PROVIDER=" + mode}); e == nil {
			other.Close()
			t.Fatal("concurrent live worker allowed")
		}
	}
	var raw string
	if e = db.QueryRow(ctx, "SELECT environment::text FROM ew_reconcile_runtime").Scan(&raw); e != nil || strings.Contains(raw, "SYNTHETIC") {
		t.Fatal("reconcile environment", e)
	}
	tid := testfixture.Task(t, db, "live-conversation", 1)
	if _, e = db.Exec(ctx, "UPDATE ew_tasks SET state='interrupted',cleanup_confirmed=true WHERE id=$1", tid); e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(ctx, `INSERT INTO ew_task_events(task_id,event) VALUES($1,'{"type":"execution.identity","mode":"kimi"}')`, tid); e != nil {
		t.Fatal(e)
	}
	v := s.Resume(ctx, "account", "live-conversation", tid, ResumeInput{RequestID: "one", CheckpointID: strings.Repeat("a", 64)})
	b, _ := json.Marshal(v.Body)
	if v.Kind != result.Conflict || !strings.Contains(string(b), "unsupported") {
		t.Fatalf("resume was not explicit unsupported: %s", b)
	}
	v = s.Resume(ctx, "foreign", "live-conversation", tid, ResumeInput{RequestID: "two", CheckpointID: strings.Repeat("a", 64)})
	if v.Kind != result.Missing {
		t.Fatal("foreign live task disclosed")
	}
	live.Close()
	faux, e := s.OpenSession(ctx, "/executor", []string{"WEB_PROVIDER=offline-faux"})
	if e != nil {
		t.Fatal(e)
	}
	faux.Close()
}
