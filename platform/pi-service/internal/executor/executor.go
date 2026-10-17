// Package executor runs a bounded pool. Ambiguous failures are terminal and never automatically resent.
package executor

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"io"
	"log"
	"net/http"
	"pan/pi-service/internal/store"
	"time"
)

type Pool struct {
	Store  *store.Store
	URL    string
	Notify func(string)
	Fatal  func(error)
}

func (p *Pool) Run(ctx context.Context) {
	client := &http.Client{Timeout: 60 * time.Second}
	for {
		if ctx.Err() != nil {
			return
		}
		t, e := p.Store.Claim(ctx)
		if e != nil {
			if !errors.Is(e, pgx.ErrNoRows) && ctx.Err() == nil {
				log.Printf("claim failed: %v", e)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(100 * time.Millisecond):
			}
			continue
		}
		p.Notify(t.Session)
		status := "interrupted"
		body, _ := json.Marshal(map[string]string{"session": t.Session, "task": t.ID, "prompt": t.Prompt})
		requestCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		req, _ := http.NewRequestWithContext(requestCtx, "POST", p.URL+"/run", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err == nil {
			if resp.StatusCode == 200 {
				scanner := bufio.NewScanner(io.LimitReader(resp.Body, 2<<20))
				scanner.Buffer(make([]byte, 4096), 65536)
				count := 0
				for scanner.Scan() {
					count++
					if count > 512 {
						break
					}
					var ev struct {
						Kind string          `json:"kind"`
						Data json.RawMessage `json:"data"`
					}
					if json.Unmarshal(scanner.Bytes(), &ev) != nil {
						break
					}
					if ev.Kind != "text" && ev.Kind != "result" && ev.Kind != "runtime" {
						break
					}
					if p.Store.Append(requestCtx, t, ev.Kind, ev.Data) != nil {
						break
					}
					p.Notify(t.Session)
					if ev.Kind == "result" {
						status = "completed"
						break
					}
				}
			}
			resp.Body.Close()
		}
		cancel()
		// Retry only an idempotent state transaction, never the model request.
		var finishErr error
		for attempt := 0; attempt < 3; attempt++ {
			finishCtx, finishCancel := context.WithTimeout(context.Background(), 5*time.Second)
			finishErr = p.Store.Finish(finishCtx, t, status)
			finishCancel()
			if finishErr == nil {
				break
			}
			time.Sleep(time.Duration(attempt+1) * 100 * time.Millisecond)
		}
		if finishErr != nil {
			log.Printf("terminal persistence unresolved task=%s; stopping", t.ID)
			if p.Fatal != nil {
				p.Fatal(finishErr)
			}
			return
		}
		p.Notify(t.Session)
	}
}
