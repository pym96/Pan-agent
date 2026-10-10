package worker

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/tasks"
	"path/filepath"
	"sync"
	"time"
)

// Coordinator runs even without HTTP reads. Cycle is the explicit completion barrier
// used by tests and diagnostics; failures are returned and logged, never hidden.
type Coordinator struct {
	Store  *tasks.Store
	Config config.Config
}

func (c Coordinator) Cycle(ctx context.Context) error {
	return c.Store.Maintain(ctx, c.Config.Execution.Entry, c.Config.Execution.Root)
}
func (c Coordinator) Run(ctx context.Context) {
	for ctx.Err() == nil {
		bounded, cancel := context.WithTimeout(ctx, 30*time.Second)
		err := c.Cycle(bounded)
		cancel()
		if err != nil {
			log.Printf("maintenance cycle failed: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(c.Config.Maintenance):
		}
	}
}
func Run(ctx context.Context, c config.Config, s *tasks.Store, execute func(context.Context, tasks.Authority, string) error) error {
	if e := os.MkdirAll(c.Execution.Root, 0700); e != nil {
		return e
	}
	actual, e := filepath.EvalSymlinks(c.Execution.Root)
	if e != nil || actual != filepath.Clean(c.Execution.Root) {
		return errors.New("task root alias rejected")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	session, e := s.OpenSession(ctx, c.Execution.Entry, c.Execution.Environment)
	if e != nil {
		return e
	}
	defer session.Close()
	var wg sync.WaitGroup
	wg.Add(2)
	defer func() { cancel(); wg.Wait() }()
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				bounded, stop := context.WithTimeout(ctx, 2*time.Second)
				e := session.Renew(bounded)
				stop()
				if e != nil {
					cancel()
					return
				}
			}
		}
	}()
	go func() { defer wg.Done(); (Coordinator{s, c}).Run(ctx) }()
	for ctx.Err() == nil {
		a, q, e := session.Claim(ctx)
		if errors.Is(e, tasks.ErrNoTask) {
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
		if e = execute(ctx, a, q); e != nil && !errors.Is(e, tasks.ErrFenced) {
			return e
		}
	}
	return nil
}
