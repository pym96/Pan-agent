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
	keys := []string{"PATH", "DOCKER_HOST", "DOCKER_CONFIG", "PAN_ENTRY", "PAN_IMAGE", "WEB107_TASK_ROOT", "WEB107_SCENARIO", "ANALYSIS_CPUS", "ANALYSIS_MEMORY_GIB"}
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
	if !hashPattern.MatchString(tid) {
		return errors.New("invalid task identity")
	}
	name := "web107-" + tid
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
	if json.Unmarshal(raw, &rows) != nil || len(rows) != 1 || rows[0].Config.Labels["pan.issue"] != "web107" || rows[0].Config.Labels["pan.task"] != tid {
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
func recoverTasks(db *pgxpool.Pool, entry, root string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	rows, e := db.Query(ctx, "SELECT id,COALESCE(node_pid,0) FROM ew_tasks WHERE state='running' OR (state IN ('interrupted','failed') AND NOT cleanup_confirmed)")
	if e != nil {
		return e
	}
	type pending struct {
		id  string
		pid int
	}
	all := []pending{}
	for rows.Next() {
		var p pending
		if rows.Scan(&p.id, &p.pid) != nil {
			rows.Close()
			return errors.New("pending scan")
		}
		all = append(all, p)
	}
	rows.Close()
	for _, p := range all {
		_, _ = db.Exec(ctx, "UPDATE ew_tasks SET state=CASE WHEN state='running' THEN 'interrupted' ELSE state END,reason=COALESCE(reason,'worker lost; no automatic retry'),finished_at=COALESCE(finished_at,now()) WHERE id=$1", p.id)
		if e = stopNode(p.pid, entry, filepath.Join(root, p.id)); e == nil {
			e = cleanupTask(ctx, p.id)
		}
		if e != nil {
			return e
		}
		if _, e = db.Exec(ctx, "UPDATE ew_tasks SET cleanup_confirmed=true WHERE id=$1", p.id); e != nil {
			return e
		}
	}
	return nil
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
		e = db.QueryRow(ctx, "UPDATE ew_tasks SET state='running',worker_id=$1 WHERE id=(SELECT id FROM ew_tasks WHERE state='queued' ORDER BY created_at LIMIT 1) RETURNING id,bundle_id,question", wid).Scan(&tid, &bid, &question)
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
	dir := filepath.Join(root, tid)
	defer func() {
		safe, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		err := cleanupTask(safe, tid)
		st := "failed"
		reason := "executor failure"
		if ctx.Err() != nil {
			st = "interrupted"
			reason = "worker stopped; no automatic retry"
		}
		if failure != nil {
			_, _ = db.Exec(safe, "UPDATE ew_tasks SET state=$2,reason=$3,finished_at=now(),cleanup_confirmed=$4 WHERE id=$1 AND state='running'", tid, st, reason, err == nil)
		}
		if err != nil {
			failure = err
		} else {
			_, _ = db.Exec(safe, "UPDATE ew_tasks SET cleanup_confirmed=true WHERE id=$1 AND state='interrupted'", tid)
		}
	}()
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
	metadata, _ := json.Marshal(map[string]string{"summary": summary})
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
	if e = cmd.Start(); e != nil {
		return e
	}
	defer func() {
		if cmd.ProcessState == nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			_ = cmd.Wait()
		}
	}()
	if _, e = db.Exec(ctx, "UPDATE ew_tasks SET node_pid=$2 WHERE id=$1", tid, cmd.Process.Pid); e != nil {
		return e
	}
	job, _ := json.Marshal(map[string]string{"taskId": tid, "root": dir, "question": question})
	if _, e = io.WriteString(stdin, string(job)+"\n"); e != nil {
		return e
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 65536), 8<<20)
	var final json.RawMessage
	var reply executionReply
	for scanner.Scan() {
		b := append([]byte(nil), scanner.Bytes()...)
		var envelope struct {
			Kind  string          `json:"kind"`
			Event json.RawMessage `json:"event"`
		}
		if json.Unmarshal(b, &envelope) != nil {
			return errors.New("executor protocol invalid")
		}
		if envelope.Kind == "event" {
			if _, e = db.Exec(ctx, "INSERT INTO ew_task_events(task_id,event) VALUES($1,$2)", tid, envelope.Event); e != nil {
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
	if e = cmd.Wait(); e != nil {
		return errors.New("executor exit nonzero")
	}
	if final == nil || !reply.Cleanup {
		return errors.New("executor result unavailable")
	}
	cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cleanCancel()
	if e = cleanupTask(cleanCtx, tid); e != nil {
		return e
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
	tag, e := tx.Exec(ctx, "UPDATE ew_tasks SET state=$2,result=$3,finished_at=now(),cleanup_confirmed=true WHERE id=$1 AND state='running'", tid, state, clean)
	if e != nil || tag.RowsAffected() != 1 {
		return errors.New("task ownership lost; result not published")
	}
	return tx.Commit(ctx)
}
