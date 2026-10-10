package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/evidence"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type Process struct{ Config config.Execution }

func (p *Process) docker(ctx context.Context, args ...string) ([]byte, error) {
	c := exec.CommandContext(ctx, "docker", args...)
	c.Env = p.Config.Environment
	return c.Output()
}
func (p *Process) cleanupTask(ctx context.Context, tid string) error {
	if _, e := os.Stat(filepath.Join(p.Config.Root, tid, "stop-unconfirmed")); e == nil {
		return errors.New("controlled stop confirmation unavailable; admission blocked")
	}

	if !evidence.ValidHash(tid) {
		return errors.New("invalid task identity")
	}
	name := p.Config.Namespace + "-" + tid
	b, e := p.docker(ctx, "ps", "-aq", "--filter", "name=^/"+name+"$")
	if e != nil {
		return errors.New("docker inspection unavailable")
	}
	if len(bytes.TrimSpace(b)) == 0 {
		return nil
	}
	raw, e := p.docker(ctx, "inspect", name)
	if e != nil {
		return errors.New("container inspect unavailable")
	}
	var rows []struct {
		Config struct{ Labels map[string]string }
	}
	if json.Unmarshal(raw, &rows) != nil || len(rows) != 1 || rows[0].Config.Labels["pan.issue"] != p.Config.Namespace || rows[0].Config.Labels["pan.task"] != tid {
		return errors.New("container owner mismatch")
	}
	if _, e = p.docker(ctx, "rm", "-f", name); e != nil {
		return errors.New("container stop unconfirmed")
	}
	b, e = p.docker(ctx, "ps", "-aq", "--filter", "name=^/"+name+"$")
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

func (p *Process) Stop(ctx context.Context, pid int, entry, dir, tid string) error {
	if !filepath.IsAbs(entry) || !filepath.IsAbs(dir) || !filepath.IsAbs(p.Config.Root) {
		return errors.New("stop runtime unavailable")
	}
	if _, e := os.Stat(filepath.Join(p.Config.Root, tid, "stop-unconfirmed")); e == nil {
		return errors.New("controlled stop confirmation unavailable; admission blocked")
	}

	if e := stopNode(pid, entry, dir); e != nil {
		return e
	}
	if e := p.cleanupTask(ctx, tid); e != nil {
		return e
	}
	cmd := exec.CommandContext(ctx, "node", filepath.Join(filepath.Dir(entry), "archive-recover.mjs"), dir)
	cmd.Env = p.Config.Environment
	if e := cmd.Run(); e != nil {
		return errors.New("archive recovery unconfirmed")
	}
	return nil
}
func (p *Process) Reconcile(ctx context.Context, entry string, environment []string, input []byte) ([]byte, error) {
	bounded, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(bounded, "node", filepath.Join(filepath.Dir(entry), "reconcile.mjs"))
	cmd.Env = environment
	cmd.Stdin = bytes.NewReader(input)
	return cmd.Output()
}
