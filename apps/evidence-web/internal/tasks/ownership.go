package tasks

import (
	"context"
	"errors"
	"pan-agent/evidence-web/internal/evidence"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sys/unix"
)

// All executor mutations and admissions share the task-row lock with control,
// revocation, publication and recovery. A lease is an upper bound, not stop proof.
const ownerLease = 10 * time.Second
const claimLock int64 = 112010001
const recoveryLock int64 = 112010002

var ErrFenced = errors.New("execution authority revoked; stop-only handoff")

type Authority struct {
	Task, Attempt, Owner string
	Generation           int64
}

func requireAuthority(ctx context.Context, tx pgx.Tx, a Authority) error {
	if !a.Valid() {
		return ErrFenced
	}
	var valid bool
	err := tx.QueryRow(ctx, `SELECT t.state='running' AND t.execution_id=$2 AND t.worker_id=$3 AND t.generation=$4 AND t.revoked_at IS NULL AND o.revoked_at IS NULL AND o.server_start=pg_postmaster_start_time() AND EXISTS(SELECT 1 FROM pg_stat_activity p WHERE p.pid=o.connection_pid AND p.backend_start=o.connection_start) AND o.heartbeat>clock_timestamp()-interval '10 seconds'
 FROM ew_tasks t JOIN ew_owners o ON o.id=t.worker_id WHERE t.id=$1 FOR UPDATE OF t`, a.Task, a.Attempt, a.Owner, a.Generation).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid {
		return ErrFenced
	}
	return nil
}
func executorExec(ctx context.Context, db *pgxpool.Pool, a Authority, sql string, args ...any) (pgconn.CommandTag, error) {
	if !a.Valid() {
		return pgconn.CommandTag{}, ErrFenced
	}
	tx, e := db.Begin(ctx)
	if e != nil {
		return pgconn.CommandTag{}, e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx, a); e != nil {
		return pgconn.CommandTag{}, e
	}
	tag, e := tx.Exec(ctx, sql, args...)
	if e != nil {
		return tag, e
	}
	return tag, tx.Commit(ctx)
}
func (s *Store) Admit(ctx context.Context, want, got Authority, ordinal int64, action string) error {
	if !want.Valid() || got != want || ordinal < 1 || (action != "model" && action != "tool") {
		return ErrFenced
	}
	tx, e := s.db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx, want); e != nil {
		return e
	}
	var previous int64
	if e = tx.QueryRow(ctx, "SELECT COALESCE(max(ordinal),0) FROM ew_admissions WHERE attempt_id=$1", want.Attempt).Scan(&previous); e != nil {
		return e
	}
	if ordinal != previous+1 {
		return errors.New("admission sequence rejected")
	}
	var stamp unix.Timespec
	if e = unix.ClockGettime(unix.CLOCK_MONOTONIC, &stamp); e != nil {
		return e
	}
	_, e = tx.Exec(ctx, "INSERT INTO ew_admissions(task_id,attempt_id,owner_id,generation,ordinal,action,monotonic_ns) VALUES($1,$2,$3,$4,$5,$6,$7)", want.Task, want.Attempt, want.Owner, want.Generation, ordinal, action, stamp.Nano())
	if e != nil {
		return e
	}
	return tx.Commit(ctx) // linearization point; ACK only follows commit
}
func revokeLost(ctx context.Context, db *pgxpool.Pool) error {
	tx, e := db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, "UPDATE ew_owners SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL AND (heartbeat<=clock_timestamp()-interval '10 seconds' OR server_start<>pg_postmaster_start_time() OR NOT EXISTS(SELECT 1 FROM pg_stat_activity p WHERE p.pid=ew_owners.connection_pid AND p.backend_start=ew_owners.connection_start))")
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `UPDATE ew_tasks t SET revoked_at=clock_timestamp(),state=CASE WHEN state='running' THEN 'interrupted' ELSE state END,reason='owner revoked; stop not confirmed',finished_at=COALESCE(finished_at,now()) WHERE t.revoked_at IS NULL AND t.state IN ('running','cancelling') AND EXISTS(SELECT 1 FROM ew_owners o WHERE o.id=t.worker_id AND o.revoked_at IS NOT NULL)`)
	if e != nil {
		return e
	}
	return tx.Commit(ctx)
}

// Called only after the old Node has exited, or by the coordinator which verifies
// its exact PID/argv first. The task lock prevents a new claim/resume during stop.
func (s *Store) finishOwned(ctx context.Context, a Authority, entry, root string, coordinator bool) error {
	tx, e := s.db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var attempt, state, owner string
	var gen int64
	var pid int
	var stopped, revoked bool
	e = tx.QueryRow(ctx, `SELECT COALESCE(execution_id,id),state,COALESCE(worker_id,''),generation,COALESCE(node_pid,0),cleanup_confirmed,revoked_at IS NOT NULL FROM ew_tasks WHERE id=$1 FOR UPDATE`, a.Task).Scan(&attempt, &state, &owner, &gen, &pid, &stopped, &revoked)
	if e != nil {
		return e
	}
	if attempt != a.Attempt || gen != a.Generation || owner != a.Owner {
		return ErrFenced
	}
	if stopped {
		return nil
	}
	if !coordinator && revoked {
		return ErrFenced
	}
	if coordinator && !revoked && state != "cancelling" {
		return nil
	}
	if s.process == nil {
		return errors.New("stop adapter unavailable")
	}
	if e = s.process.Stop(ctx, pid, entry, filepath.Join(root, attempt), a.Task); e != nil {
		return e
	}

	if state == "running" {
		state = "interrupted"
	}
	if state == "cancelling" {
		state = "cancelled"
	}
	_, e = tx.Exec(ctx, `UPDATE ew_attempts SET state=$2,stopped_at=COALESCE(stopped_at,now()) WHERE id=$1`, attempt, state)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `UPDATE ew_tasks SET state=$2,cleanup_confirmed=true,stop_confirmed_at=clock_timestamp(),finished_at=COALESCE(finished_at,now()),reason=COALESCE(reason,'executor stopped; explicit recovery required') WHERE id=$1`, a.Task, state)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `INSERT INTO ew_task_events(task_id,event) VALUES($1,jsonb_build_object('type','ownership.stop_confirmed','attemptId',$2::text,'generation',$3::bigint,'nodeExited',true,'containerAbsent',true))`, a.Task, attempt, gen)
	if e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Maintain(ctx context.Context, entry, root string) error {
	if e := revokeLost(ctx, s.db); e != nil {
		return e
	}
	conn, e := s.db.Acquire(ctx)
	if e != nil {
		return e
	}
	defer conn.Release()
	var locked bool
	if e = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", recoveryLock).Scan(&locked); e != nil || !locked {
		return e
	}
	defer func() {
		bounded, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		conn.Exec(bounded, "SELECT pg_advisory_unlock($1)", recoveryLock)
	}()
	rows, e := s.db.Query(ctx, `SELECT id,execution_id,worker_id,generation FROM ew_tasks WHERE NOT cleanup_confirmed AND (revoked_at IS NOT NULL OR state='cancelling') AND execution_id IS NOT NULL`)
	if e != nil {
		return e
	}
	all := []Authority{}
	for rows.Next() {
		var a Authority
		if e = rows.Scan(&a.Task, &a.Attempt, &a.Owner, &a.Generation); e != nil {
			rows.Close()
			return e
		}
		all = append(all, a)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return e
	}
	for _, a := range all {
		if e = s.finishOwned(ctx, a, entry, root, true); e != nil {
			return e
		}
	}
	return nil
}
func assignOwner(ctx context.Context, tx pgx.Tx, tid, wid string) error {
	var attempt string
	var gen int64
	e := tx.QueryRow(ctx, `UPDATE ew_tasks SET generation=generation+1,revoked_at=NULL,execution_id=COALESCE(execution_id,id),worker_id=$2 WHERE id=$1 RETURNING execution_id,generation`, tid, wid).Scan(&attempt, &gen)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `INSERT INTO ew_attempts(id,task_id,owner_id,generation) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET owner_id=$3,generation=$4`, attempt, tid, wid, gen)
	return e
}

func (a Authority) Valid() bool {
	return evidence.ValidHash(a.Task) && evidence.ValidHash(a.Attempt) && evidence.ValidHash(a.Owner) && a.Generation > 0
}
func (s *Store) Finish(ctx context.Context, a Authority, entry, root string) error {
	if !a.Valid() {
		return ErrFenced
	}
	return s.finishOwned(ctx, a, entry, root, false)
}
