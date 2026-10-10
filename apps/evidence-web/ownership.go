package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sys/unix"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

// All executor mutations and admissions share the task-row lock with control,
// revocation, publication and recovery. A lease is an upper bound, not stop proof.
const ownerLease = 10 * time.Second
const claimLock int64 = 112010001
const recoveryLock int64 = 112010002

var errFenced = errors.New("execution authority revoked; stop-only handoff")

type authority struct {
	Task, Attempt, Owner string
	Generation           int64
}
type authorityKey struct{}

func getAuthority(ctx context.Context) *authority {
	a, _ := ctx.Value(authorityKey{}).(*authority)
	return a
}
func requireAuthority(ctx context.Context, tx pgx.Tx) error {
	a := getAuthority(ctx)
	if a == nil {
		return nil
	}
	var valid bool
	err := tx.QueryRow(ctx, `SELECT t.state='running' AND t.execution_id=$2 AND t.worker_id=$3 AND t.generation=$4 AND t.revoked_at IS NULL AND o.revoked_at IS NULL AND o.server_start=pg_postmaster_start_time() AND EXISTS(SELECT 1 FROM pg_stat_activity p WHERE p.pid=o.connection_pid AND p.backend_start=o.connection_start) AND o.heartbeat>clock_timestamp()-interval '10 seconds'
 FROM ew_tasks t JOIN ew_owners o ON o.id=t.worker_id WHERE t.id=$1 FOR UPDATE OF t`, a.Task, a.Attempt, a.Owner, a.Generation).Scan(&valid)
	if err != nil {
		return err
	}
	if !valid {
		return errFenced
	}
	return nil
}
func executorExec(ctx context.Context, db *pgxpool.Pool, sql string, args ...any) (pgconn.CommandTag, error) {
	if getAuthority(ctx) == nil {
		return db.Exec(ctx, sql, args...)
	}
	tx, e := db.Begin(ctx)
	if e != nil {
		return pgconn.CommandTag{}, e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx); e != nil {
		return pgconn.CommandTag{}, e
	}
	tag, e := tx.Exec(ctx, sql, args...)
	if e != nil {
		return tag, e
	}
	return tag, tx.Commit(ctx)
}
func admit(ctx context.Context, db *pgxpool.Pool, got authority, ordinal int64, action string) error {
	want := getAuthority(ctx)
	if want == nil || got != *want || ordinal < 1 || (action != "model" && action != "tool") {
		return errFenced
	}
	tx, e := db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx); e != nil {
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
func finishOwned(ctx context.Context, db *pgxpool.Pool, a authority, entry, root string, coordinator bool) error {
	tx, e := db.Begin(ctx)
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
		return errFenced
	}
	if stopped {
		return nil
	}
	if !coordinator && revoked {
		return errFenced
	}
	if coordinator && !revoked && state != "cancelling" {
		return nil
	}
	if e = stopNode(pid, entry, filepath.Join(root, attempt)); e != nil {
		return e
	}
	if e = cleanupTask(ctx, a.Task); e != nil {
		return e
	}
	if e = sealInterrupted(ctx, entry, filepath.Join(root, attempt)); e != nil {
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
func recoverOwners(ctx context.Context, db *pgxpool.Pool, entry, root string) error {
	if e := revokeLost(ctx, db); e != nil {
		return e
	}
	conn, e := db.Acquire(ctx)
	if e != nil {
		return e
	}
	defer conn.Release()
	var locked bool
	if e = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", recoveryLock).Scan(&locked); e != nil || !locked {
		return e
	}
	defer conn.Exec(context.Background(), "SELECT pg_advisory_unlock($1)", recoveryLock)
	rows, e := db.Query(ctx, `SELECT id,execution_id,worker_id,generation FROM ew_tasks WHERE NOT cleanup_confirmed AND (revoked_at IS NOT NULL OR state='cancelling') AND execution_id IS NOT NULL`)
	if e != nil {
		return e
	}
	all := []authority{}
	for rows.Next() {
		var a authority
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
		if e = finishOwned(ctx, db, a, entry, root, true); e != nil {
			return e
		}
	}
	return nil
}
func workOwners(db *pgxpool.Pool, entry, root string) error {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	wid := id()
	heartbeatConn, e := db.Acquire(ctx)
	if e != nil {
		return e
	}
	defer heartbeatConn.Release()
	var shared bool
	if e = heartbeatConn.QueryRow(ctx, "SELECT pg_try_advisory_lock_shared($1)", workerLock).Scan(&shared); e != nil || !shared {
		return errors.New("legacy worker or migration active")
	}
	defer heartbeatConn.Exec(context.Background(), "SELECT pg_advisory_unlock_shared($1)", workerLock)

	if _, e := heartbeatConn.Exec(ctx, "INSERT INTO ew_owners(id,pid,connection_start) SELECT $1,$2,backend_start FROM pg_stat_activity WHERE pid=pg_backend_pid()", wid, os.Getpid()); e != nil {
		return e
	}
	env, _ := json.Marshal(nodeEnvironment())
	if _, e := db.Exec(ctx, "INSERT INTO ew_reconcile_runtime VALUES(111,$1,$2) ON CONFLICT(singleton) DO UPDATE SET entry=excluded.entry,environment=excluded.environment", entry, env); e != nil {
		return e
	}
	// Heartbeat failure permanently ends this process's authority. It cannot renew
	// an expired lease even before a coordinator notices the expiration.
	beatDone := make(chan struct{})
	go func() {
		defer close(beatDone)
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c, stop := context.WithTimeout(ctx, 2*time.Second)
				tag, e := heartbeatConn.Exec(c, "UPDATE ew_owners SET heartbeat=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL AND heartbeat>clock_timestamp()-interval '10 seconds'", wid)
				stop()
				if e != nil || tag.RowsAffected() != 1 {
					cancel()
					return
				}
			}
		}
	}()
	recoveryDone := make(chan struct{})
	go func() {
		defer close(recoveryDone)
		for ctx.Err() == nil {
			c, stop := context.WithTimeout(ctx, 30*time.Second)
			_ = recoverOwners(c, db, entry, root)
			stop()
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
		}
	}()
	defer func() {
		cancel()
		<-beatDone
		<-recoveryDone
		c, stop := context.WithTimeout(context.Background(), 3*time.Second)
		defer stop()
		_, _ = db.Exec(c, "UPDATE ew_owners SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1", wid)
		_ = revokeLost(c, db)
	}()
	for ctx.Err() == nil {
		tid, bid, q, e := claimTask(ctx, db, wid)
		if errors.Is(e, pgx.ErrNoRows) {
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(300 * time.Millisecond):
			}
			continue
		}
		if e != nil {
			return fmt.Errorf("claim failed: %w", e)
		}
		a := authority{Task: tid, Owner: wid}
		if e = db.QueryRow(ctx, "SELECT execution_id,generation FROM ew_tasks WHERE id=$1 AND worker_id=$2", tid, wid).Scan(&a.Attempt, &a.Generation); e != nil {
			return e
		}
		if e = executeTask(context.WithValue(ctx, authorityKey{}, &a), db, tid, bid, q, entry, root); e != nil && !errors.Is(e, errFenced) {
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
