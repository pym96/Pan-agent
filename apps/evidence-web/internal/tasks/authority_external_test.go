package tasks_test

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/tasks"
	"pan-agent/evidence-web/internal/testfixture"
	"testing"
)

func TestExplicitAuthorityEveryEffect(t *testing.T) {
	db := testfixture.Database(t)
	ctx := context.Background()
	s := tasks.New(db, nil)
	testfixture.Task(t, db, "c", 1)
	session, e := s.OpenSession(ctx, "/unused", nil)
	if e != nil {
		t.Fatal(e)
	}
	defer session.Close()
	good, _, e := session.Claim(ctx)
	if e != nil {
		t.Fatal(e)
	}
	missingTask := good
	missingTask.Task = ""
	missingAttempt := good
	missingAttempt.Attempt = ""
	missingOwner := good
	missingOwner.Owner = ""
	zero := good
	zero.Generation = 0
	foreign := good
	foreign.Task = identity.NewID()
	wrongAttempt := good
	wrongAttempt.Attempt = identity.NewID()
	wrongOwner := good
	wrongOwner.Owner = identity.NewID()
	stale := good
	stale.Generation++
	for _, a := range []tasks.Authority{{}, missingTask, missingAttempt, missingOwner, zero, foreign, wrongAttempt, wrongOwner, stale} {
		starts := 0
		if e = s.Start(ctx, a, func() (int, error) { starts++; return 1, nil }); e == nil || starts != 0 {
			t.Fatalf("start admitted %#v", a)
		}
		if e = s.Admit(ctx, a, a, 1, "model"); e == nil {
			t.Fatal("model admitted")
		}
		if e = s.Admit(ctx, a, a, 1, "tool"); e == nil {
			t.Fatal("tool admitted")
		}
		for _, kind := range []string{"invalidate", "checkpoint", "dispatch", "receipt"} {
			if e = s.Checkpoint(ctx, a, t.TempDir(), kind, "", ""); e == nil {
				t.Fatal(kind, "admitted")
			}
		}
		if e = s.Event(ctx, a, json.RawMessage(`{"type":"unauthorized"}`)); e == nil {
			t.Fatal("event admitted")
		}
		if e = s.Publish(ctx, a, json.RawMessage(`{"kind":"result","cleanupConfirmed":true,"result":{"status":"failed"}}`)); e == nil {
			t.Fatal("result admitted")
		}
	}
	var count int
	for _, table := range []string{"ew_admissions", "ew_checkpoints", "ew_task_events", "ew_task_artifacts"} {
		if e = db.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); e != nil || count != 0 {
			t.Fatal(table, count, e)
		}
	}
	var untouched bool
	if e = db.QueryRow(ctx, "SELECT state='running' AND result IS NULL AND node_pid IS NULL FROM ew_tasks WHERE id=$1", good.Task).Scan(&untouched); e != nil || !untouched {
		t.Fatal("rejected authority changed task/PID/result", e)
	}
	if e = s.Admit(ctx, good, good, 1, "model"); e != nil {
		t.Fatal(e)
	}
	if e = s.Checkpoint(ctx, good, t.TempDir(), "invalidate", "", ""); e != nil {
		t.Fatal(e)
	}
	if e = s.Publish(ctx, good, json.RawMessage(`{"kind":"result","cleanupConfirmed":true,"result":{"status":"failed"}}`)); e != nil {
		t.Fatal(e)
	}
	t.Log("external caller: absent, zero, foreign and stale identities cause zero admissions/checkpoint/events/results/child starts; valid authority retained")
}
