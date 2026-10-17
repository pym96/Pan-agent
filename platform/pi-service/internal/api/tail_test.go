package api

import (
	"context"
	"encoding/json"
	"pan/pi-service/internal/store"
	"sync"
	"sync/atomic"
	"testing"
)

func TestTailCoalescesReadsAndReplaysOldCursor(t *testing.T) {
	var queries atomic.Int64
	var newest atomic.Int64
	newest.Store(1)
	read := func(_ context.Context, _ string, c int64) ([]store.Event, error) {
		queries.Add(1)
		out := []store.Event{}
		for i := c + 1; i <= newest.Load() && len(out) < 256; i++ {
			out = append(out, store.Event{ID: i, Kind: "text", Data: json.RawMessage(`{"text":"hello"}`)})
		}
		return out, nil
	}
	tail := NewTail(read)
	detach := tail.Attach("a")
	defer detach()
	var wg sync.WaitGroup
	for i := 0; i < 1000; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, e := tail.Events(context.Background(), "a", 0)
			if e != nil || len(v) != 1 {
				t.Error(v, e)
			}
		}()
	}
	wg.Wait()
	if queries.Load() != 1 {
		t.Fatal("read amplification", queries.Load())
	}
	newest.Store(300)
	tail.Dirty("a")
	tail.Events(context.Background(), "a", 1)
	tail.Events(context.Background(), "a", 257)
	v, e := tail.Events(context.Background(), "a", 0)
	if e != nil || len(v) != 256 || v[0].ID != 1 {
		t.Fatal("old cursor not replayed", len(v), e)
	}
	tail.mu.Lock()
	s := tail.sessions["a"]
	tail.mu.Unlock()
	if len(s.events) > 256 || s.bytes > 65536 {
		t.Fatal("cache unbounded")
	}
}
