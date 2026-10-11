package executor

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/result"
	"pan-agent/evidence-web/internal/tasks"
	"path/filepath"
	"syscall"
	"time"
)

type Runner struct {
	cfg   config.Execution
	store *tasks.Store
}

func New(c config.Execution, s *tasks.Store) *Runner { return &Runner{cfg: c, store: s} }
func (r *Runner) Execute(ctx context.Context, a tasks.Authority, question string) (failure error) {
	if !a.Valid() {
		return tasks.ErrFenced
	}
	tid, attempt := a.Task, a.Attempt
	entry, root := r.cfg.Entry, r.cfg.Root
	input, e := r.store.Load(ctx, a)
	if e != nil {
		return e
	}
	dir := filepath.Join(root, attempt)
	defer func() {
		safe, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		e := r.store.Finish(safe, a, entry, root)
		if e != nil && failure == nil {
			failure = e
		}
	}()
	if e = os.Mkdir(dir, 0700); e != nil {
		return errors.New("task directory already exists or inaccessible")
	}
	for _, p := range []string{"input", "output"} {
		if e = os.Mkdir(filepath.Join(dir, p), 0755); e != nil {
			return e
		}
	}
	_ = os.Chmod(filepath.Join(dir, "output"), 0777)
	for n, b := range input.Files {
		if e = os.WriteFile(filepath.Join(dir, "input", n), b, 0444); e != nil {
			return e
		}
	}
	_ = os.Chmod(filepath.Join(dir, "input"), 0555)

	cmd := exec.CommandContext(ctx, "node", entry, "--task-root", dir)
	cmd.Env = append([]string(nil), r.cfg.Environment...)
	if r.cfg.Mode == "kimi" {
		cmd.Env = append(cmd.Env, "KIMI_API_KEY="+r.cfg.KimiKey)
	}
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
	if e = r.store.Start(ctx, a, func() (int, error) {
		e := cmd.Start()
		if e != nil {
			return 0, e
		}
		return cmd.Process.Pid, nil
	}); e != nil {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			_ = cmd.Wait()
		}
		return e
	}

	defer func() {
		if cmd.ProcessState == nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
			_ = cmd.Wait()
		}
	}()
	identity := map[string]any{"type": "execution.identity", "attemptId": attempt, "mode": r.cfg.Mode, "provider": "pan-faux", "model": "web107-scripted", "reasoning": "off"}
	for _, setting := range r.cfg.Environment {
		if setting == "WEB_CHECKPOINT_MODE=1" {
			identity["model"] = "checkpoint-faux-v1"
		}
	}
	if r.cfg.Mode == "kimi" {
		identity["provider"] = "kimi-code"
		identity["model"] = "k3-256k"
		identity["reasoning"] = "high"
		identity["endpoint"] = "https://api.kimi.com/coding/v1/chat/completions"
	}
	rawIdentity, _ := json.Marshal(identity)
	if e = r.store.Event(ctx, a, rawIdentity); e != nil {
		return e
	}
	jobData := map[string]any{"taskId": tid, "attemptId": attempt, "root": dir, "question": question, "contextText": input.ContextText, "contextSHA256": input.ContextHash, "authority": a}
	if input.Checkpoint != nil {
		jobData["checkpoint"] = json.RawMessage(input.Checkpoint)
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
				var err error
				queryCtx, cancel := context.WithTimeout(monitorCtx, time.Second)
				state, err = r.store.State(queryCtx, a)
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
	var reply result.ExecutionReply
	for scanner.Scan() {
		b := append([]byte(nil), scanner.Bytes()...)
		var envelope struct {
			Kind         string          `json:"kind"`
			Event        json.RawMessage `json:"event"`
			CheckpointID string          `json:"checkpointId"`
			SHA          string          `json:"sha256"`
			Authority    tasks.Authority `json:"authority"`
			Ordinal      int64           `json:"ordinal"`
			Action       string          `json:"action"`
		}
		if json.Unmarshal(b, &envelope) != nil {
			return errors.New("executor protocol invalid")
		}
		if envelope.Kind == "admission" {
			if e = r.store.Admit(ctx, a, envelope.Authority, envelope.Ordinal, envelope.Action); e != nil {
				return e
			}
			ack, _ := json.Marshal(map[string]any{"action": "admission_ack", "authority": envelope.Authority, "ordinal": envelope.Ordinal})
			if _, e = io.WriteString(stdin, string(ack)+"\n"); e != nil {
				return e
			}
		} else if envelope.Kind == "checkpoint" || envelope.Kind == "invalidate" || envelope.Kind == "dispatch" || envelope.Kind == "receipt" {
			if e = r.store.Checkpoint(ctx, a, dir, envelope.Kind, envelope.CheckpointID, envelope.SHA); e != nil {
				return e
			}
			if _, e = io.WriteString(stdin, "{\"action\":\"checkpoint_ack\"}\n"); e != nil {
				return e
			}
		} else if envelope.Kind == "event" {
			if e = r.store.Event(ctx, a, envelope.Event); e != nil {
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
	if e = r.store.Publish(ctx, a, final); e != nil {
		return e
	}
	if r.cfg.Mode == "kimi" && reply.Result.Status == "model_error" {
		return errors.New("live provider failed; worker stopped; inspect safe metadata before explicit new attempt")
	}
	return nil
}
