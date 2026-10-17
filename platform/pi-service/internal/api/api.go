// Package api projects committed events. Notifications are hints, PostgreSQL is authoritative.
package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"pan/pi-service/internal/store"
	"regexp"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

type Hub struct {
	mu   sync.Mutex
	subs map[string]map[chan struct{}]bool
}

func NewHub() *Hub { return &Hub{subs: map[string]map[chan struct{}]bool{}} }
func (h *Hub) Subscribe(s string) (chan struct{}, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c := make(chan struct{}, 1)
	if h.subs[s] == nil {
		h.subs[s] = map[chan struct{}]bool{}
	}
	h.subs[s][c] = true
	return c, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.subs[s], c)
		if len(h.subs[s]) == 0 {
			delete(h.subs, s)
		}
	}
}
func (h *Hub) Notify(s string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.subs[s] {
		select {
		case c <- struct{}{}:
		default:
		}
	}
}

type API struct {
	Store       *store.Store
	Hub         *Hub
	Connections atomic.Int64
	Delivered   atomic.Int64
	Heartbeats  atomic.Int64
	Slow        atomic.Int64
}

var valid = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}
func (a *API) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		if e := a.Store.DB.Ping(ctx); e != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "runtime": "actual Pi 1.3.0", "model": "synthetic local baseline"})
	})
	m.HandleFunc("POST /sessions/{session}/tasks", a.submit)
	m.HandleFunc("GET /sessions/{session}/tasks", a.history)
	m.HandleFunc("GET /sessions/{session}/events", a.events)
	m.HandleFunc("GET /metrics", a.metrics)
	return m
}
func (a *API) submit(w http.ResponseWriter, r *http.Request) {
	s := r.PathValue("session")
	var body struct {
		Key    string `json:"key"`
		Prompt string `json:"prompt"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if !valid.MatchString(s) || d.Decode(&body) != nil || !valid.MatchString(body.Key) || len(body.Prompt) == 0 || len(body.Prompt) > 8192 {
		http.Error(w, "invalid request", 400)
		return
	}
	b := make([]byte, 16)
	rand.Read(b)
	t, fresh, e := a.Store.Submit(r.Context(), store.Task{ID: hex.EncodeToString(b), Session: s, Key: body.Key, Prompt: body.Prompt})
	if e != nil {
		status := 500
		if errors.Is(e, store.ErrConflict) {
			status = 409
		}
		if errors.Is(e, store.ErrBusy) {
			status = 429
		}
		http.Error(w, http.StatusText(status), status)
		return
	}
	a.Hub.Notify(s)
	code := 200
	if fresh {
		code = 202
	}
	writeJSON(w, code, t)
}
func (a *API) history(w http.ResponseWriter, r *http.Request) {
	if !valid.MatchString(r.PathValue("session")) {
		http.Error(w, "invalid session", 400)
		return
	}
	v, e := a.Store.Tasks(r.Context(), r.PathValue("session"))
	if e != nil {
		http.Error(w, "unavailable", 503)
		return
	}
	writeJSON(w, 200, v)
}
func (a *API) events(w http.ResponseWriter, r *http.Request) {
	s := r.PathValue("session")
	cursor := int64(0)
	var e error
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		cursor, e = strconv.ParseInt(v, 10, 64)
	}
	if !valid.MatchString(s) || e != nil || cursor < 0 {
		http.Error(w, "invalid cursor/session", 400)
		return
	}
	if a.Connections.Add(1) > 11000 {
		a.Connections.Add(-1)
		http.Error(w, "connection limit", 503)
		return
	}
	defer a.Connections.Add(-1)
	hint, unsub := a.Hub.Subscribe(s)
	defer unsub()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	rc := http.NewResponseController(w)
	send := func(text string) bool {
		rc.SetWriteDeadline(time.Now().Add(5 * time.Second))
		_, err := fmt.Fprint(w, text)
		if err == nil {
			err = rc.Flush()
		}
		if err != nil {
			a.Slow.Add(1)
		}
		return err == nil
	}
	if !send(": connected\n\n") {
		return
	}
	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	for {
		items, err := a.Store.Events(r.Context(), s, cursor)
		if err != nil {
			return
		}
		for _, v := range items {
			raw, _ := json.Marshal(v)
			if !send(fmt.Sprintf("id: %d\nevent: %s\ndata: %s\n\n", v.ID, v.Kind, raw)) {
				return
			}
			cursor = v.ID
			a.Delivered.Add(1)
		}
		if len(items) == 256 {
			continue
		}
		select {
		case <-r.Context().Done():
			return
		case <-hint:
		case <-tick.C:
			if !send(": heartbeat\n\n") {
				return
			}
			a.Heartbeats.Add(1)
		}
	}
}
func (a *API) metrics(w http.ResponseWriter, r *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	st := a.Store.DB.Stat()
	writeJSON(w, 200, map[string]any{"timestamp": time.Now().UTC(), "connections": a.Connections.Load(), "eventsDelivered": a.Delivered.Load(), "heartbeats": a.Heartbeats.Load(), "writeFailures": a.Slow.Load(), "goroutines": runtime.NumGoroutine(), "heapBytes": mem.HeapAlloc, "pgAcquired": st.AcquiredConns(), "pgTotal": st.TotalConns(), "pgAcquireCount": st.AcquireCount(), "pgAcquireDurationNs": st.AcquireDuration().Nanoseconds()})
}
