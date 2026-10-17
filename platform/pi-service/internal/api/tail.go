package api

import (
	"context"
	"pan/pi-service/internal/store"
	"sync"
	"sync/atomic"
)

// Tail is a bounded, disposable projection of committed rows, never an authority.
// At most 128 subscribed sessions, 256 events / 64KiB each. Old cursors fall back to SQL.
type Tail struct {
	mu       sync.Mutex
	sessions map[string]*tailSession
	read     func(context.Context, string, int64) ([]store.Event, error)
	Hits     atomic.Int64
}
type tailSession struct {
	mu            sync.Mutex
	refs          int
	dirty         bool
	latest, floor int64
	bytes         int
	events        []store.Event
}

func NewTail(read func(context.Context, string, int64) ([]store.Event, error)) *Tail {
	return &Tail{sessions: map[string]*tailSession{}, read: read}
}
func (t *Tail) Attach(s string) func() {
	t.mu.Lock()
	v := t.sessions[s]
	if v == nil && len(t.sessions) < 128 {
		v = &tailSession{dirty: true}
		t.sessions[s] = v
	}
	if v != nil {
		v.refs++
	}
	t.mu.Unlock()
	return func() {
		if v == nil {
			return
		}
		t.mu.Lock()
		defer t.mu.Unlock()
		v.refs--
		if v.refs == 0 {
			delete(t.sessions, s)
		}
	}
}
func (t *Tail) Dirty(s string) {
	t.mu.Lock()
	v := t.sessions[s]
	t.mu.Unlock()
	if v != nil {
		v.mu.Lock()
		v.dirty = true
		v.mu.Unlock()
	}
}
func (t *Tail) Events(ctx context.Context, s string, cursor int64) ([]store.Event, error) {
	t.mu.Lock()
	v := t.sessions[s]
	t.mu.Unlock()
	if v == nil {
		return t.read(ctx, s, cursor)
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.dirty {
		rows, e := t.read(ctx, s, v.latest)
		if e != nil {
			return nil, e
		}
		v.dirty = len(rows) == 256
		for _, row := range rows {
			v.latest = row.ID
			v.events = append(v.events, row)
			v.bytes += len(row.Data) + len(row.Kind) + len(row.Task) + 16
			for len(v.events) > 256 || v.bytes > 65536 {
				first := v.events[0]
				v.floor = first.ID
				v.bytes -= len(first.Data) + len(first.Kind) + len(first.Task) + 16
				v.events[0] = store.Event{}
				v.events = v.events[1:]
			}
		}
	}
	if cursor < v.floor {
		return t.read(ctx, s, cursor)
	}
	out := []store.Event{}
	for _, row := range v.events {
		if row.ID > cursor {
			out = append(out, row)
		}
	}
	t.Hits.Add(1)
	return out, nil
}
