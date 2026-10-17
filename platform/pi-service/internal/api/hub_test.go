package api

import (
	"sync"
	"testing"
)

func TestNotificationsAreBoundedAndSessionScoped(t *testing.T) {
	h := NewHub()
	a, done := h.Subscribe("a")
	b, doneB := h.Subscribe("b")
	defer doneB()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10000; j++ {
				h.Notify("a")
			}
		}()
	}
	wg.Wait()
	if len(a) != 1 || len(b) != 0 {
		t.Fatal("unbounded or cross-session notification")
	}
	done()
	h.Notify("a")
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.subs) != 1 {
		t.Fatal("subscription leaked")
	}
}
