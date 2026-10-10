package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const workerLock int64 = 107010001

func nodeEnvironment() []string {
	keys := []string{"PATH", "DOCKER_HOST", "DOCKER_CONFIG", "PAN_ENTRY", "PAN_IMAGE", "WEB107_TASK_ROOT", "WEB107_SCENARIO", "ANALYSIS_CPUS", "ANALYSIS_MEMORY_GIB", "WEB_ISSUE", "WEB_FAUX_BARRIER", "WEB_RESULT_BARRIER", "WEB_TOOL_BARRIER", "WEB_CHECKPOINT_MODE", "WEB_CHECKPOINT_FAULT", "WEB_OPERATION_MODE", "WEB_OPERATION_FAULT", "WEB_ADMISSION_FAULT"}
	out := []string{}
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			out = append(out, k+"="+v)
		}
	}
	return out
}
func docker(ctx context.Context, args ...string) ([]byte, error) {
	c := exec.CommandContext(ctx, "docker", args...)
	c.Env = nodeEnvironment()
	return c.Output()
}
func cleanupTask(ctx context.Context, tid string) error {
	if runtimeIssue() == "web109" || (runtimeIssue() == "web110" || runtimeIssue() == "web111" || runtimeIssue() == "web112") {
		if _, e := os.Stat(filepath.Join(os.Getenv("WEB107_TASK_ROOT"), tid, "stop-unconfirmed")); e == nil {
			return errors.New("controlled stop confirmation unavailable; admission blocked")
		}
	}
	if !hashPattern.MatchString(tid) {
		return errors.New("invalid task identity")
	}
	name := runtimeIssue() + "-" + tid
	b, e := docker(ctx, "ps", "-aq", "--filter", "name=^/"+name+"$")
	if e != nil {
		return errors.New("docker inspection unavailable")
	}
	if len(bytes.TrimSpace(b)) == 0 {
		return nil
	}
	raw, e := docker(ctx, "inspect", name)
	if e != nil {
		return errors.New("container inspect unavailable")
	}
	var rows []struct {
		Config struct{ Labels map[string]string }
	}
	if json.Unmarshal(raw, &rows) != nil || len(rows) != 1 || rows[0].Config.Labels["pan.issue"] != runtimeIssue() || rows[0].Config.Labels["pan.task"] != tid {
		return errors.New("container owner mismatch")
	}
	if _, e = docker(ctx, "rm", "-f", name); e != nil {
		return errors.New("container stop unconfirmed")
	}
	b, e = docker(ctx, "ps", "-aq", "--filter", "name=^/"+name+"$")
	if e != nil || len(bytes.TrimSpace(b)) != 0 {
		return errors.New("container stop unconfirmed")
	}
	return nil
}
func stopNode(pid int, entry, root string) error {
	if pid == 0 {
		return nil
	}
	expected := []string{entry, "--task-root", root}
	b, e := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "command=").Output()
	if e != nil {
		return nil
	}
	cmd := strings.TrimSpace(string(b))
	if !strings.Contains(cmd, strings.Join(expected, " ")) {
		return errors.New("node PID ownership uncertain")
	}
	_ = syscall.Kill(-pid, syscall.SIGKILL)
	for i := 0; i < 50; i++ {
		if syscall.Kill(pid, 0) != nil {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("node stop unconfirmed")
}
func sealInterrupted(ctx context.Context, entry, dir string) error {
	if runtimeIssue() != "web110" && runtimeIssue() != "web111" && runtimeIssue() != "web112" {
		return nil
	}
	cmd := exec.CommandContext(ctx, "node", filepath.Join(filepath.Dir(entry), "archive-recover.mjs"), dir)
	cmd.Env = nodeEnvironment()
	if e := cmd.Run(); e != nil {
		return errors.New("archive recovery unconfirmed")
	}
	return nil
}
func recoverTasks(db *pgxpool.Pool, entry, root string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rows, e := db.Query(ctx, "SELECT id,COALESCE(node_pid,0),COALESCE(execution_id,id) FROM ew_tasks WHERE state IN ('running','cancelling') OR (state IN ('interrupted','failed','cancelled') AND NOT cleanup_confirmed)")
	if e != nil {
		return e
	}
	type pending struct {
		id        string
		pid       int
		execution string
	}
	all := []pending{}
	for rows.Next() {
		var p pending
		if rows.Scan(&p.id, &p.pid, &p.execution) != nil {
			rows.Close()
			return errors.New("pending scan")
		}
		all = append(all, p)
	}
	rows.Close()
	for _, p := range all {
		_, _ = db.Exec(ctx, "UPDATE ew_tasks SET state=CASE WHEN state='running' THEN 'interrupted' ELSE state END,reason=COALESCE(reason,'worker lost; no automatic retry'),finished_at=CASE WHEN state='cancelling' THEN finished_at ELSE COALESCE(finished_at,now()) END WHERE id=$1", p.id)
		if e = stopNode(p.pid, entry, filepath.Join(root, p.execution)); e == nil {
			e = cleanupTask(ctx, p.id)
		}
		if e == nil {
			e = sealInterrupted(ctx, entry, filepath.Join(root, p.execution))
		}
		if e != nil {
			return e
		}
		_, _ = db.Exec(ctx, "UPDATE ew_attempts SET state='interrupted',stopped_at=COALESCE(stopped_at,now()) WHERE id=$1 AND stopped_at IS NULL", p.execution)
		recordStop(ctx, db, p.id)
		if _, e = db.Exec(ctx, "UPDATE ew_tasks SET cleanup_confirmed=true,stop_confirmed_at=now(),state=CASE WHEN state='cancelling' THEN 'cancelled' ELSE state END,finished_at=COALESCE(finished_at,now()) WHERE id=$1", p.id); e != nil {
			return e
		}
	}
	return nil
}
func recordStop(ctx context.Context, db *pgxpool.Pool, tid string) {
	_, _ = db.Exec(ctx, `INSERT INTO ew_task_events(task_id,event) SELECT $1,jsonb_build_object('type','control.stop_confirmed','nodeExited',true,'containerAbsent',true,'containerName',$2::text) WHERE EXISTS(SELECT 1 FROM ew_tasks WHERE id=$1 AND cancel_requested_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM ew_task_events WHERE task_id=$1 AND event->>'type'='control.stop_confirmed')`, tid, runtimeIssue()+"-"+tid)
}
func work(db *pgxpool.Pool) error {
	root := os.Getenv("WEB107_TASK_ROOT")
	entry := os.Getenv("WEB107_EXECUTOR")
	if !filepath.IsAbs(root) || !filepath.IsAbs(entry) || !filepath.IsAbs(os.Getenv("PAN_ENTRY")) || !strings.HasPrefix(os.Getenv("PAN_IMAGE"), "sha256:") {
		return errors.New("worker requires absolute task root/executor/Pan entry and pinned PAN_IMAGE")
	}
	if e := os.MkdirAll(root, 0700); e != nil {
		return e
	}
	actual, e := filepath.EvalSymlinks(root)
	if e != nil || actual != filepath.Clean(root) {
		return errors.New("task root alias rejected")
	}
	if runtimeIssue() == "web112" {
		return workOwners(db, entry, root)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	conn, e := db.Acquire(ctx)
	if e != nil {
		return e
	}
	defer conn.Release()
	var locked bool
	if e = conn.QueryRow(ctx, "SELECT pg_try_advisory_lock($1)", workerLock).Scan(&locked); e != nil || !locked {
		return errors.New("web107 worker already owned")
	}
	defer conn.Exec(context.Background(), "SELECT pg_advisory_unlock($1)", workerLock)
	if runtimeIssue() == "web111" {
		environment, _ := json.Marshal(nodeEnvironment())
		if _, e = db.Exec(ctx, "INSERT INTO ew_reconcile_runtime VALUES(111,$1,$2) ON CONFLICT(singleton) DO UPDATE SET entry=excluded.entry,environment=excluded.environment", entry, environment); e != nil {
			return e
		}
	}
	if e = recoverTasks(db, entry, root); e != nil {
		return fmt.Errorf("admission blocked: %s", e)
	}
	wid := id()
	beat := func() error {
		c, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		_, e := conn.Exec(c, "INSERT INTO ew_worker_lease(singleton,worker_id,heartbeat) VALUES(107,$1,now()) ON CONFLICT(singleton) DO UPDATE SET worker_id=$1,heartbeat=now()", wid)
		return e
	}
	if beat() != nil {
		return errors.New("worker heartbeat unavailable")
	}
	defer db.Exec(context.Background(), "DELETE FROM ew_worker_lease WHERE worker_id=$1", wid)
	log.Print("web107 single worker started (offline-faux)")
	for ctx.Err() == nil {
		var tid, bid, question string
		tid, bid, question, e = claimTask(ctx, db, wid)
		if errors.Is(e, pgx.ErrNoRows) {
			if beat() != nil {
				return errors.New("worker lease lost")
			}
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(300 * time.Millisecond):
			}
			continue
		}
		if e != nil {
			return errors.New("task claim failed")
		}
		done := make(chan error, 1)
		go func() { done <- executeTask(ctx, db, tid, bid, question, entry, root) }()
		tick := time.NewTicker(time.Second)
		finished := false
		for !finished {
			select {
			case e = <-done:
				finished = true
			case <-tick.C:
				if beat() != nil {
					cancel()
					e = <-done
					finished = true
				}
			case <-ctx.Done():
				e = <-done
				finished = true
			}
		}
		tick.Stop()
		if e != nil {
			return fmt.Errorf("worker paused: %s", e)
		}
	}
	return nil
}

type executionReply struct {
	Kind   string `json:"kind"`
	Result struct {
		Status string `json:"status"`
	} `json:"result"`
	Artifacts map[string]struct {
		SHA    string `json:"sha256"`
		Base64 string `json:"base64"`
	} `json:"artifacts"`
	Cleanup bool `json:"cleanupConfirmed"`
}

func executeTask(ctx context.Context, db *pgxpool.Pool, tid, bid, question, entry, root string) (failure error) {
	var attempt string
	var checkpoint []byte
	if e := db.QueryRow(ctx, "SELECT COALESCE(execution_id,id) FROM ew_tasks WHERE id=$1", tid).Scan(&attempt); e != nil {
		return e
	}
	if !hashPattern.MatchString(attempt) {
		return errors.New("attempt identity invalid")
	}
	if _, e := executorExec(ctx, db, "UPDATE ew_tasks SET execution_id=$2 WHERE id=$1", tid, attempt); e != nil {
		return e
	}
	if _, e := executorExec(ctx, db, "INSERT INTO ew_attempts(id,task_id) VALUES($1,$2) ON CONFLICT(id) DO NOTHING", attempt, tid); e != nil {
		return e
	}

	dir := filepath.Join(root, attempt)
	defer func() {
		if a := getAuthority(ctx); a != nil {
			safe, stop := context.WithTimeout(context.Background(), 30*time.Second)
			defer stop()
			e := finishOwned(safe, db, *a, entry, root, false)
			if e != nil && failure == nil {
				failure = e
			}
			return
		}
		safe, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		err := cleanupTask(safe, tid)
		if err == nil {
			err = sealInterrupted(safe, entry, dir)
		}
		st := "interrupted"
		reason := "executor failure"
		if ctx.Err() != nil {
			st = "interrupted"
			reason = "worker stopped; no automatic retry"
		}
		if failure != nil {
			_, _ = db.Exec(safe, "UPDATE ew_tasks SET state=$2,reason=$3,finished_at=now(),cleanup_confirmed=false WHERE id=$1 AND state='running'", tid, st, reason)
		}
		var current string
		_ = db.QueryRow(safe, "SELECT state FROM ew_tasks WHERE id=$1", tid).Scan(&current)
		if current == "cancelling" {
			if err == nil {
				recordStop(safe, db, tid)
				_, e := db.Exec(safe, "UPDATE ew_tasks SET state='cancelled',finished_at=now(),cleanup_confirmed=true,stop_confirmed_at=now(),reason='cancelled; Node exited and owned container absent' WHERE id=$1 AND state='cancelling'", tid)
				if e == nil {
					failure = nil
				} else {
					failure = e
				}
			}
			if err != nil {
				_, _ = db.Exec(safe, "UPDATE ew_tasks SET reason=$2 WHERE id=$1", tid, err.Error())
			}
		}
		if current == "cancelled" && err == nil {
			recordStop(safe, db, tid)
		}
		_, _ = db.Exec(safe, `UPDATE ew_attempts a SET state=t.state,result=COALESCE(t.result,t.attempt_result),stopped_at=CASE WHEN $2 THEN COALESCE(a.stopped_at,now()) ELSE NULL END FROM ew_tasks t WHERE a.id=$1 AND t.id=a.task_id`, attempt, err == nil)
		if err == nil {
			_, _ = db.Exec(safe, "UPDATE ew_tasks SET stop_confirmed_at=now() WHERE id=$1 AND state IN ('interrupted','failed')", tid)
		}
		if err != nil {
			failure = err
		} else {
			_, _ = db.Exec(safe, "UPDATE ew_tasks SET cleanup_confirmed=true WHERE id=$1 AND state='interrupted'", tid)
		}
	}()
	var cp *string
	if e := db.QueryRow(ctx, "SELECT resume_checkpoint FROM ew_tasks WHERE id=$1", tid).Scan(&cp); e != nil {
		return e
	}
	if cp != nil {
		var sha string
		if e := db.QueryRow(ctx, `SELECT c.payload,c.sha256 FROM ew_checkpoints c JOIN ew_tasks t ON t.id=c.task_id WHERE c.id=$1 AND c.task_id=$2 AND c.account_id=t.account_id AND c.bundle_id=t.bundle_id AND c.conversation_id=t.conversation_id AND c.consumed_by=$3 AND NOT c.eligible`, *cp, tid, attempt).Scan(&checkpoint, &sha); e != nil || hash(checkpoint) != sha {
			return errors.New("resume checkpoint invalid")
		}
	}
	if e := os.Mkdir(dir, 0700); e != nil {
		return errors.New("task directory already exists or inaccessible")
	}
	for _, p := range []string{"input", "output"} {
		if e := os.Mkdir(filepath.Join(dir, p), 0755); e != nil {
			return e
		}
	}
	_ = os.Chmod(filepath.Join(dir, "output"), 0777)
	rows, e := db.Query(ctx, "SELECT name,content FROM ew_files WHERE bundle_id=$1", bid)
	if e != nil {
		return e
	}
	for rows.Next() {
		var n string
		var b []byte
		if e = rows.Scan(&n, &b); e != nil {
			rows.Close()
			return e
		}
		if !validName(n) || n == "task.json" {
			rows.Close()
			return errors.New("reserved or unsafe input name")
		}
		if e = os.WriteFile(filepath.Join(dir, "input", n), b, 0444); e != nil {
			rows.Close()
			return e
		}
	}
	rows.Close()
	var summary string
	if e = db.QueryRow(ctx, "SELECT summary_name FROM ew_bundles WHERE id=$1", bid).Scan(&summary); e != nil {
		return e
	}
	var contextText, contextHash string
	if e = db.QueryRow(ctx, "SELECT context_text,context_sha256 FROM ew_tasks WHERE id=$1", tid).Scan(&contextText, &contextHash); e != nil {
		return e
	}
	var snapshot publicContext
	if json.Unmarshal([]byte(contextText), &snapshot) != nil || hash([]byte(contextText)) != contextHash {
		return errors.New("context identity invalid")
	}
	metadata, _ := json.Marshal(map[string]any{"summary": summary, "followup": len(snapshot.Turns) > 0, "priorTurns": snapshot.Turns})
	if e = os.WriteFile(filepath.Join(dir, "input/task.json"), metadata, 0444); e != nil {
		return e
	}
	_ = os.Chmod(filepath.Join(dir, "input"), 0555)
	cmd := exec.CommandContext(ctx, "node", entry, "--task-root", dir)
	cmd.Env = nodeEnvironment()
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdin, e := cmd.StdinPipe()
	if e != nil {
		return e
	}
	defer stdin.Close()
	stdout, e := cmd.StdoutPipe()
	if e != nil {
		return e
	}
	logs, e := os.Create(filepath.Join(dir, "executor-stderr.log"))
	if e != nil {
		return e
	}
	defer logs.Close()
	cmd.Stderr = logs
	// Starting a child and registering its PID is serialized with revocation.
	// It receives no job/effect until this transaction commits.
	var startTx pgx.Tx
	if getAuthority(ctx) != nil {
		startTx, e = db.Begin(ctx)
		if e != nil {
			return e
		}
		defer startTx.Rollback(context.Background())
		if e = requireAuthority(ctx, startTx); e != nil {
			return e
		}
	}
	if e = cmd.Start(); e != nil {
		return e
	}
	defer func() {
		if cmd.ProcessState == nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			_ = cmd.Wait()
		}
	}()
	if startTx != nil {
		_, e = startTx.Exec(ctx, "UPDATE ew_tasks SET node_pid=$2 WHERE id=$1", tid, cmd.Process.Pid)
		if e == nil {
			_, e = startTx.Exec(ctx, "UPDATE ew_attempts SET node_pid=$2,state='running' WHERE id=$1", attempt, cmd.Process.Pid)
		}
		if e == nil {
			e = startTx.Commit(ctx)
		}
	} else {
		_, e = db.Exec(ctx, "UPDATE ew_tasks SET node_pid=$2 WHERE id=$1", tid, cmd.Process.Pid)
		if e == nil {
			_, e = db.Exec(ctx, "UPDATE ew_attempts SET node_pid=$2,state='running' WHERE id=$1", attempt, cmd.Process.Pid)
		}
	}
	if e != nil {
		return e
	}
	jobData := map[string]any{"taskId": tid, "attemptId": attempt, "root": dir, "question": question, "contextText": contextText, "contextSHA256": contextHash}
	if a := getAuthority(ctx); a != nil {
		jobData["authority"] = a
	}
	if checkpoint != nil {
		jobData["checkpoint"] = json.RawMessage(checkpoint)
	}
	job, _ := json.Marshal(jobData)
	if _, e = io.WriteString(stdin, string(job)+"\n"); e != nil {
		return e
	}
	monitorCtx, monitorCancel := context.WithCancel(context.Background())
	monitorDone := make(chan struct{})
	defer func() { monitorCancel(); <-monitorDone }()
	go func() {
		defer close(monitorDone)
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		sent := false
		var deadline time.Time
		for {
			select {
			case <-monitorCtx.Done():
				return
			case <-ticker.C:
				var state string
				queryCtx, cancel := context.WithTimeout(monitorCtx, time.Second)
				err := db.QueryRow(queryCtx, "SELECT state FROM ew_tasks WHERE id=$1", tid).Scan(&state)
				cancel()
				if err == nil && state == "cancelling" && !sent {
					_, _ = io.WriteString(stdin, "{\"action\":\"cancel\"}\n")
					sent = true
					deadline = time.Now().Add(5 * time.Second)
				}
				if sent && time.Now().After(deadline) {
					_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
					return
				}
			}
		}
	}()
	rawLog, e := os.Create(filepath.Join(dir, "executor-stdout.jsonl"))
	if e != nil {
		return e
	}
	defer rawLog.Close()
	scanner := bufio.NewScanner(io.TeeReader(stdout, rawLog))
	scanner.Buffer(make([]byte, 65536), 8<<20)
	var final json.RawMessage
	var reply executionReply
	for scanner.Scan() {
		b := append([]byte(nil), scanner.Bytes()...)
		var envelope struct {
			Kind         string          `json:"kind"`
			Event        json.RawMessage `json:"event"`
			CheckpointID string          `json:"checkpointId"`
			SHA          string          `json:"sha256"`
			Authority    authority       `json:"authority"`
			Ordinal      int64           `json:"ordinal"`
			Action       string          `json:"action"`
		}
		if json.Unmarshal(b, &envelope) != nil {
			return errors.New("executor protocol invalid")
		}
		if envelope.Kind == "admission" {
			if e = admit(ctx, db, envelope.Authority, envelope.Ordinal, envelope.Action); e != nil {
				return e
			}
			ack, _ := json.Marshal(map[string]any{"action": "admission_ack", "authority": envelope.Authority, "ordinal": envelope.Ordinal})
			if _, e = io.WriteString(stdin, string(ack)+"\n"); e != nil {
				return e
			}
		} else if envelope.Kind == "checkpoint" || envelope.Kind == "invalidate" || envelope.Kind == "dispatch" || envelope.Kind == "receipt" {
			if e = checkpointBarrier(ctx, db, tid, attempt, dir, envelope.Kind, envelope.CheckpointID, envelope.SHA); e != nil {
				return e
			}
			if _, e = io.WriteString(stdin, "{\"action\":\"checkpoint_ack\"}\n"); e != nil {
				return e
			}
		} else if envelope.Kind == "event" {
			if _, e = executorExec(ctx, db, "INSERT INTO ew_task_events(task_id,event) VALUES($1,$2)", tid, envelope.Event); e != nil {
				return e
			}
		} else if envelope.Kind == "result" {
			if final != nil {
				return errors.New("duplicate result")
			}
			final = b
			if json.Unmarshal(b, &reply) != nil {
				return errors.New("executor result invalid")
			}
		} else {
			return errors.New("executor failed")
		}
	}
	if e = scanner.Err(); e != nil {
		return e
	}
	monitorCancel()
	<-monitorDone
	if e = cmd.Wait(); e != nil {
		return errors.New("executor exit nonzero")
	}
	if final == nil || !reply.Cleanup {
		return errors.New("executor result unavailable")
	}
	if _, e = executorExec(ctx, db, "UPDATE ew_tasks SET attempt_result=$2 WHERE id=$1 AND state='cancelling'", tid, []byte(final)); e != nil {
		return e
	}
	cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cleanCancel()
	if getAuthority(ctx) == nil {
		if e = cleanupTask(cleanCtx, tid); e != nil {
			return e
		}
	}
	state := "failed"
	if reply.Result.Status == "completed" {
		state = "completed"
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	tx, e := db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx); e != nil {
		return e
	}
	var current string
	if e = tx.QueryRow(ctx, "SELECT state FROM ew_tasks WHERE id=$1 FOR UPDATE", tid).Scan(&current); e != nil {
		return e
	}
	if current != "running" && current != "cancelling" {
		return errors.New("task ownership lost")
	}
	// A failed host receipt barrier remains available for readonly reconciliation.
	// Its dispatch state never grants replay; cancellation/completion still revoke it.
	keepPending := false
	if state == "failed" && current == "running" {
		var pending []byte
		if tx.QueryRow(ctx, "SELECT payload FROM ew_checkpoints WHERE task_id=$1 AND attempt_id=$2 AND eligible AND consumed_by IS NULL ORDER BY created_at DESC LIMIT 1", tid, attempt).Scan(&pending) == nil {
			var point struct {
				Version int `json:"version"`
			}
			keepPending = json.Unmarshal(pending, &point) == nil && point.Version == 2
		}
	}
	if !keepPending {
		if _, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET eligible=false WHERE task_id=$1", tid); e != nil {
			return e
		}
	}
	if state == "completed" {
		if len(reply.Artifacts) != 2 {
			return errors.New("artifact set invalid")
		}
		for name, artifact := range reply.Artifacts {
			if name != "details.csv" && name != "analysis.json" {
				return errors.New("artifact name invalid")
			}
			b, e := base64.StdEncoding.DecodeString(artifact.Base64)
			if e != nil || len(b) > 2<<20 || hash(b) != artifact.SHA {
				return errors.New("artifact hash invalid")
			}
			if _, e = tx.Exec(ctx, "INSERT INTO ew_task_artifacts(task_id,name,sha256,content) VALUES($1,$2,$3,$4)", tid, name, artifact.SHA, b); e != nil {
				return e
			}
		}
	}
	// Persist metadata without duplicate base64 blobs; artifact downloads have their own owner-gated endpoint.
	var meta map[string]any
	_ = json.Unmarshal(final, &meta)
	art := map[string]any{}
	for n, a := range reply.Artifacts {
		art[n] = map[string]string{"sha256": a.SHA}
	}
	meta["artifacts"] = art
	clean, _ := json.Marshal(meta)
	if current == "cancelling" {
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET attempt_result=$2,state='cancelled',finished_at=now(),cleanup_confirmed=true,stop_confirmed_at=now(),reason='cancel intent won; late result retained as attempt only' WHERE id=$1", tid, clean)
		if e != nil {
			return e
		}
		return tx.Commit(ctx)
	}
	tag, e := tx.Exec(ctx, "UPDATE ew_tasks SET state=$2,result=$3,reason=NULL,finished_at=now(),stop_confirmed_at=now(),cleanup_confirmed=true WHERE id=$1 AND state='running'", tid, state, clean)
	if e != nil || tag.RowsAffected() != 1 {
		return errors.New("task ownership lost; result not published")
	}
	if _, e = tx.Exec(ctx, "UPDATE ew_attempts SET state=$2,result=$3,stopped_at=now() WHERE id=$1", attempt, state, clean); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

func runtimeIssue() string {
	if os.Getenv("WEB_ISSUE") == "web112" {
		return "web112"
	}
	if os.Getenv("WEB_ISSUE") == "web111" {
		return "web111"
	}
	if os.Getenv("WEB_ISSUE") == "web110" {
		return "web110"
	}
	if os.Getenv("WEB_ISSUE") == "web109" {
		return "web109"
	}
	if os.Getenv("WEB_ISSUE") == "web108" {
		return "web108"
	}
	return "web107"
}
