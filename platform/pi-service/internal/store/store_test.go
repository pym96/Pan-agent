package store

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"os"
	"sync"
	"testing"
)

func TestDurableAdmissionAndRecovery(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires a dedicated empty PostgreSQL test database")
	}
	ctx := context.Background()
	s, e := Open(ctx, url)
	if e != nil {
		t.Fatal(e)
	}
	defer s.DB.Close()
	if e = s.Init(ctx); e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	ids := make(chan string, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			v, _, err := s.Submit(ctx, Task{ID: fmt.Sprint(i), Session: "same", Key: "one", Prompt: "hello"})
			if err != nil {
				t.Error(err)
				return
			}
			ids <- v.ID
		}(i)
	}
	wg.Wait()
	close(ids)
	id := ""
	for v := range ids {
		if id != "" && id != v {
			t.Fatal("duplicate admitted")
		}
		id = v
	}
	if _, _, e = s.Submit(ctx, Task{ID: "conflict", Session: "same", Key: "one", Prompt: "different"}); !errors.Is(e, ErrConflict) {
		t.Fatal(e)
	}
	running, e := s.Claim(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if _, _, e = s.Submit(ctx, Task{ID: "queued", Session: "same", Key: "two", Prompt: "next"}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Claim(ctx); !errors.Is(e, pgx.ErrNoRows) {
		t.Fatal("same session executed concurrently", e)
	}
	if e = s.Recover(ctx); e != nil {
		t.Fatal(e)
	}
	tasks, e := s.Tasks(ctx, "same")
	if e != nil || len(tasks) != 2 || tasks[0].Status != "interrupted" || tasks[1].Status != "cancelled" {
		t.Fatal(tasks, e)
	}
	if _, _, e = s.Submit(ctx, Task{ID: "new", Session: "same", Key: "new", Prompt: "new"}); !errors.Is(e, ErrBusy) {
		t.Fatal("uncertain session reused", e)
	}
	events, e := s.Events(ctx, "same", 0)
	if e != nil || len(events) < 4 {
		t.Fatal(events, e)
	}
	var last int64
	for _, v := range events {
		if v.ID <= last {
			t.Fatal("event order")
		}
		last = v.ID
	}
	tail, e := s.Events(ctx, "same", events[1].ID)
	if e != nil || len(tail) != len(events)-2 {
		t.Fatal(tail, e)
	}
	_ = running
	for i := 0; i < 128; i++ {
		_, _, e = s.Submit(ctx, Task{ID: fmt.Sprintf("q%d", i), Session: fmt.Sprintf("q%d", i), Key: "one", Prompt: "bounded"})
		if e != nil {
			t.Fatal(i, e)
		}
	}
	if _, _, e = s.Submit(ctx, Task{ID: "overflow", Session: "overflow", Key: "one", Prompt: "bounded"}); !errors.Is(e, ErrBusy) {
		t.Fatal("queue unbounded", e)
	}
}
