// Package store owns durable control-plane state. Pi files own only runtime context.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sync/atomic"
	"time"
)

type Store struct {
	DB           *pgxpool.Pool
	Reads        *pgxpool.Pool
	EventQueries atomic.Int64
	EventQueryNS atomic.Int64
}
type Task struct {
	ID      string `json:"id"`
	Session string `json:"session"`
	Key     string `json:"key"`
	Prompt  string `json:"prompt"`
	Status  string `json:"status"`
}
type Event struct {
	Task string          `json:"task"`
	ID   int64           `json:"id"`
	Kind string          `json:"kind"`
	Data json.RawMessage `json:"data"`
}

var ErrConflict = errors.New("idempotency key conflicts with request")
var ErrBusy = errors.New("queue full or interrupted session")

func Open(ctx context.Context, url string) (*Store, error) {
	c, e := pgxpool.ParseConfig(url)
	if e != nil {
		return nil, e
	}
	c.MaxConns = 4
	p, e := pgxpool.NewWithConfig(ctx, c)
	if e != nil {
		return nil, e
	}
	readConfig := c.Copy()
	readConfig.MaxConns = 8
	reads, e := pgxpool.NewWithConfig(ctx, readConfig)
	if e != nil {
		p.Close()
		return nil, e
	}
	return &Store{DB: p, Reads: reads}, nil
}
func (s *Store) Close() { s.Reads.Close(); s.DB.Close() }
func (s *Store) Init(ctx context.Context) error {
	_, e := s.DB.Exec(ctx, `CREATE TABLE IF NOT EXISTS sessions(id text PRIMARY KEY, blocked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS tasks(id text PRIMARY KEY,session text NOT NULL REFERENCES sessions(id),key text NOT NULL,prompt text NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,finished_at timestamptz,UNIQUE(session,key));
CREATE TABLE IF NOT EXISTS events(id bigserial PRIMARY KEY,session text NOT NULL,task text NOT NULL,kind text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS event_session_id ON events(session,id);
CREATE INDEX IF NOT EXISTS task_status ON tasks(status,created_at);`)
	return e
}

// Recover is used only while the service holds the database singleton advisory lock.
func (s *Store) Recover(ctx context.Context) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(142002)")
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `UPDATE sessions SET blocked=true WHERE id IN(SELECT session FROM tasks WHERE status='running'); INSERT INTO events(session,task,kind,data) SELECT session,id,'interrupted','{"reason":"service_restart_execution_uncertain"}' FROM tasks WHERE status='running'; UPDATE tasks SET status='interrupted',finished_at=now() WHERE status='running'; INSERT INTO events(session,task,kind,data) SELECT session,id,'cancelled','{"reason":"prior_execution_uncertain"}' FROM tasks WHERE status='queued' AND session IN(SELECT id FROM sessions WHERE blocked); UPDATE tasks SET status='cancelled',finished_at=now() WHERE status='queued' AND session IN(SELECT id FROM sessions WHERE blocked)`)
	if e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Submit(ctx context.Context, t Task) (Task, bool, error) {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return t, false, e
	}
	defer tx.Rollback(ctx)
	// Serialize admission so queue limit and duplicate identity are transactionally checked.
	_, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(142002)")
	if e != nil {
		return t, false, e
	}
	old := Task{}
	e = tx.QueryRow(ctx, "SELECT id,session,key,prompt,status FROM tasks WHERE session=$1 AND key=$2", t.Session, t.Key).Scan(&old.ID, &old.Session, &old.Key, &old.Prompt, &old.Status)
	if e == nil {
		if old.Prompt != t.Prompt {
			return t, false, ErrConflict
		}
		return old, false, nil
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return t, false, e
	}
	_, e = tx.Exec(ctx, "INSERT INTO sessions(id) VALUES($1) ON CONFLICT DO NOTHING", t.Session)
	if e != nil {
		return t, false, e
	}
	var blocked bool
	var queued int
	var sessionCount int
	e = tx.QueryRow(ctx, "SELECT blocked FROM sessions WHERE id=$1", t.Session).Scan(&blocked)
	if e != nil {
		return t, false, e
	}
	e = tx.QueryRow(ctx, "SELECT count(*) FROM tasks WHERE status='queued'").Scan(&queued)
	if e != nil {
		return t, false, e
	}
	e = tx.QueryRow(ctx, "SELECT count(*) FROM tasks WHERE session=$1", t.Session).Scan(&sessionCount)
	if e != nil {
		return t, false, e
	}
	if blocked || queued >= 128 || sessionCount >= 128 {
		return t, false, ErrBusy
	}
	t.Status = "queued"
	_, e = tx.Exec(ctx, "INSERT INTO tasks(id,session,key,prompt,status) VALUES($1,$2,$3,$4,'queued')", t.ID, t.Session, t.Key, t.Prompt)
	if e != nil {
		return t, false, e
	}
	_, e = tx.Exec(ctx, "INSERT INTO events(session,task,kind,data) VALUES($1,$2,'queued',jsonb_build_object('task',$2::text))", t.Session, t.ID)
	if e != nil {
		return t, false, e
	}
	return t, true, tx.Commit(ctx)
}
func (s *Store) Claim(ctx context.Context) (Task, error) {
	t := Task{}
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return t, e
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(142002)")
	if e != nil {
		return t, e
	}
	e = tx.QueryRow(ctx, `SELECT id,session,key,prompt,status FROM tasks t WHERE status='queued' AND NOT EXISTS(SELECT 1 FROM tasks r WHERE r.session=t.session AND r.status='running') AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.id=t.session AND s.blocked) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&t.ID, &t.Session, &t.Key, &t.Prompt, &t.Status)
	if e != nil {
		return t, e
	}
	_, e = tx.Exec(ctx, "UPDATE tasks SET status='running',started_at=now() WHERE id=$1", t.ID)
	if e != nil {
		return t, e
	}
	_, e = tx.Exec(ctx, "INSERT INTO events(session,task,kind,data) VALUES($1,$2,'running','{}')", t.Session, t.ID)
	if e != nil {
		return t, e
	}
	return t, tx.Commit(ctx)
}
func (s *Store) Append(ctx context.Context, t Task, kind string, data json.RawMessage) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(142002)")
	if e != nil {
		return e
	}
	var status string
	e = tx.QueryRow(ctx, "SELECT status FROM tasks WHERE id=$1", t.ID).Scan(&status)
	if e != nil {
		return e
	}
	if status != "running" {
		return errors.New("task is no longer running")
	}
	_, e = tx.Exec(ctx, "INSERT INTO events(session,task,kind,data) VALUES($1,$2,$3,$4)", t.Session, t.ID, kind, data)
	if e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Finish(ctx context.Context, t Task, status string) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(142002)")
	if e != nil {
		return e
	}
	var current string
	e = tx.QueryRow(ctx, "SELECT status FROM tasks WHERE id=$1 FOR UPDATE", t.ID).Scan(&current)
	if e != nil {
		return e
	}
	if current != "running" {
		return tx.Commit(ctx)
	}
	if status != "completed" {
		_, e = tx.Exec(ctx, "UPDATE sessions SET blocked=true WHERE id=$1", t.Session)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `INSERT INTO events(session,task,kind,data) SELECT session,id,'cancelled','{"reason":"prior_execution_uncertain"}' FROM tasks WHERE session=$1 AND status='queued';`, t.Session)
		if e != nil {
			return e
		}
		_, e = tx.Exec(ctx, "UPDATE tasks SET status='cancelled',finished_at=now() WHERE session=$1 AND status='queued'", t.Session)
		if e != nil {
			return e
		}
	}
	_, e = tx.Exec(ctx, "UPDATE tasks SET status=$2,finished_at=now() WHERE id=$1", t.ID, status)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, "INSERT INTO events(session,task,kind,data) VALUES($1,$2,$3,'{}')", t.Session, t.ID, status)
	if e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Events(ctx context.Context, session string, cursor int64) ([]Event, error) {
	start := time.Now()
	s.EventQueries.Add(1)
	defer func() { s.EventQueryNS.Add(time.Since(start).Nanoseconds()) }()
	rows, e := s.Reads.Query(ctx, "SELECT id,task,kind,data FROM events WHERE session=$1 AND id>$2 ORDER BY id LIMIT 256", session, cursor)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Event{}
	for rows.Next() {
		v := Event{}
		if e = rows.Scan(&v.ID, &v.Task, &v.Kind, &v.Data); e != nil {
			return nil, e
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (s *Store) Tasks(ctx context.Context, session string) ([]Task, error) {
	rows, e := s.DB.Query(ctx, "SELECT id,session,key,prompt,status FROM tasks WHERE session=$1 ORDER BY created_at LIMIT 128", session)
	if e != nil {
		return nil, e
	}
	defer rows.Close()
	out := []Task{}
	for rows.Next() {
		t := Task{}
		if e = rows.Scan(&t.ID, &t.Session, &t.Key, &t.Prompt, &t.Status); e != nil {
			return nil, e
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
