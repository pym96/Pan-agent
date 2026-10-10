package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"pan-agent/evidence-web/internal/identity"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const workerLock int64 = 107010001

type Session struct {
	store *Store
	conn  *pgxpool.Conn
	id    string
}

func (s *Store) OpenSession(ctx context.Context, entry string, environment []string) (*Session, error) {
	conn, e := s.db.Acquire(ctx)
	if e != nil {
		return nil, e
	}
	var shared bool
	if e = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock_shared($1)", workerLock).Scan(&shared); e != nil || !shared {
		conn.Release()
		return nil, errors.New("legacy worker or migration active")
	}
	session := &Session{store: s, conn: conn, id: identity.NewID()}
	if _, e = conn.Exec(ctx, "INSERT INTO ew_owners(id,pid,connection_start) SELECT $1,$2,backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()", session.id, os.Getpid()); e != nil {
		session.Close()
		return nil, e
	}
	env, _ := json.Marshal(environment)
	if _, e = s.db.Exec(ctx, "INSERT INTO ew_reconcile_runtime VALUES(111,$1,$2) ON CONFLICT(singleton) DO UPDATE SET entry=excluded.entry,environment=excluded.environment", entry, env); e != nil {
		session.Close()
		return nil, e
	}
	return session, nil
}
func (s *Session) Renew(ctx context.Context) error {
	tag, e := s.conn.Exec(ctx, "UPDATE ew_owners SET heartbeat=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL AND heartbeat>clock_timestamp()-interval '10 seconds'", s.id)
	if e != nil {
		return e
	}
	if tag.RowsAffected() != 1 {
		return ErrFenced
	}
	return nil
}
func (s *Session) Close() {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	s.store.db.Exec(ctx, "UPDATE ew_owners SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1", s.id)
	revokeLost(ctx, s.store.db)
	s.conn.Exec(ctx, "SELECT pg_advisory_unlock_shared($1)", workerLock)
	s.conn.Release()
}

var ErrNoTask = pgx.ErrNoRows

func (s *Session) Claim(ctx context.Context) (Authority, string, error) {
	tid, _, q, e := claimTask(ctx, s.store.db, s.id)
	a := Authority{Task: tid, Owner: s.id}
	if e != nil {
		return a, "", e
	}
	e = s.store.db.QueryRow(ctx, "SELECT execution_id,generation FROM ew_tasks WHERE id=$1 AND worker_id=$2", tid, s.id).Scan(&a.Attempt, &a.Generation)
	return a, q, e
}
