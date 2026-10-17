// Bounded SSE/load probe; synthetic-model task workload is measured separately from connection count.
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Receipt struct {
	Session     string    `json:"session"`
	Index       int       `json:"index"`
	Established bool      `json:"established"`
	Heartbeats  int       `json:"heartbeats"`
	IDs         []int64   `json:"ids"`
	Duplicates  int       `json:"duplicates"`
	Regressions int       `json:"regressions"`
	Reconnects  int       `json:"reconnects"`
	LastSeen    time.Time `json:"lastSeen"`
	Error       string    `json:"error,omitempty"`
}

func main() {
	base := flag.String("url", "http://api:8080", "API")
	n := flag.Int("connections", 100, "connections <=10000")
	hold := flag.Duration("hold", 120*time.Second, "hold")
	out := flag.String("out", "/evidence/load.json", "output")
	name := flag.String("session", "load-142", "session")
	shards := flag.Int("session-shards", 1, "unique subscribed sessions; <= connections")
	flag.Parse()
	if *n < 1 || *n > 10000 || *hold > 120*time.Second || *shards < 1 || *shards > *n {
		panic("invalid load bound")
	}
	start := time.Now()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tr := &http.Transport{MaxIdleConns: 12000, MaxIdleConnsPerHost: 12000, MaxConnsPerHost: 12050, ResponseHeaderTimeout: 10 * time.Second}
	client := &http.Client{Transport: tr}
	control := &http.Client{Transport: tr, Timeout: 5 * time.Second}
	receipts := make([]Receipt, *n)
	var mu sync.Mutex
	var wg sync.WaitGroup
	var established atomic.Int64
	for i := 0; i < *n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			sessionName := fmt.Sprintf("%s-s%d", *name, i%*shards)
			v := Receipt{Index: i, IDs: []int64{}, Session: sessionName}
			defer func() { mu.Lock(); receipts[i] = v; mu.Unlock() }()
			cursor := int64(0)
			first := true
			for {
				req, _ := http.NewRequestWithContext(ctx, "GET", *base+"/sessions/"+sessionName+"/events", nil)
				if cursor > 0 {
					req.Header.Set("Last-Event-ID", strconv.FormatInt(cursor, 10))
				}
				resp, e := client.Do(req)
				if e != nil {
					if ctx.Err() == nil {
						v.Error = e.Error()
					}
					return
				}
				if resp.StatusCode != 200 {
					v.Error = resp.Status
					resp.Body.Close()
					return
				}
				if first {
					v.Established = true
					established.Add(1)
					first = false
				}
				scan := bufio.NewScanner(resp.Body)
				scan.Buffer(make([]byte, 4096), 65536)
				reconnect := false
				for scan.Scan() {
					line := scan.Text()
					if strings.HasPrefix(line, ": heartbeat") {
						v.Heartbeats++
						v.LastSeen = time.Now()
					}
					if strings.HasPrefix(line, "id: ") {
						id, _ := strconv.ParseInt(strings.TrimPrefix(line, "id: "), 10, 64)
						if id == cursor {
							v.Duplicates++
						}
						if id < cursor {
							v.Regressions++
						}
						if id > cursor {
							v.IDs = append(v.IDs, id)
							cursor = id
						}
						v.LastSeen = time.Now()
					}
					if i%10 == 0 && v.Reconnects == 0 && time.Since(start) > 30*time.Second {
						v.Reconnects++
						reconnect = true
						break
					}
				}
				resp.Body.Close()
				if !reconnect {
					if ctx.Err() == nil {
						v.Error = fmt.Sprint(scan.Err())
					}
					return
				}
			}
		}(i)
		if i%25 == 24 {
			time.Sleep(50 * time.Millisecond)
		}
	}
	rampEnd := time.Now()
	metrics := []json.RawMessage{}
	latencies := []float64{}
	taskErrors := []string{}
	taskCount := 0
	deadline := time.Now().Add(*hold)
	timer := time.AfterFunc(*hold, cancel)
	defer timer.Stop()
	for time.Until(deadline) > 6*time.Second {
		req, _ := http.NewRequestWithContext(ctx, "GET", *base+"/metrics", nil)
		if resp, e := control.Do(req); e == nil {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
			resp.Body.Close()
			if json.Valid(b) {
				metrics = append(metrics, b)
			}
		}
		sessionName := fmt.Sprintf("%s-s%d", *name, taskCount%*shards)
		key := fmt.Sprintf("fixed-seed-142-%d", taskCount)
		body, _ := json.Marshal(map[string]string{"key": key, "prompt": "Reply with a brief synthetic baseline greeting."})
		ts := time.Now()
		req, _ = http.NewRequestWithContext(ctx, "POST", *base+"/sessions/"+sessionName+"/tasks", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, e := control.Do(req)
		if e != nil {
			taskErrors = append(taskErrors, e.Error())
		} else {
			var t struct {
				ID string `json:"id"`
			}
			json.NewDecoder(resp.Body).Decode(&t)
			resp.Body.Close()
			if resp.StatusCode != 202 {
				taskErrors = append(taskErrors, resp.Status)
			} else {
				done := false
				for j := 0; j < 100; j++ {
					r, e := control.Get(*base + "/sessions/" + *name + "/tasks")
					if e != nil {
						break
					}
					var tasks []struct {
						ID     string `json:"id"`
						Status string `json:"status"`
					}
					json.NewDecoder(r.Body).Decode(&tasks)
					r.Body.Close()
					for _, v := range tasks {
						if v.ID == t.ID && v.Status == "completed" {
							done = true
						}
					}
					if done {
						latencies = append(latencies, time.Since(ts).Seconds()*1000)
						break
					}
					time.Sleep(50 * time.Millisecond)
				}
				if !done {
					taskErrors = append(taskErrors, "completion not observed within 5s")
				}
			}
		}
		taskCount++
		select {
		case <-ctx.Done():
		case <-time.After(5 * time.Second):
		}
	}
	<-ctx.Done()
	end := time.Now()
	cancel()
	wg.Wait()
	healthy := 0
	duplicates := 0
	regressions := 0
	for _, r := range receipts {
		if r.Established && r.Heartbeats > 0 && r.Error == "" && end.Sub(r.LastSeen) < 20*time.Second {
			healthy++
		}
		duplicates += r.Duplicates
		regressions += r.Regressions
	}
	sort.Float64s(latencies)
	quantile := func(q float64) any {
		if len(latencies) == 0 {
			return nil
		}
		return latencies[int(math.Ceil(q*float64(len(latencies))))-1]
	}
	report := map[string]any{"seed": 142, "uniqueSubscribedSessions": *shards, "executorConcurrencyLimit": 2, "model": "deterministic local HTTP through actual Pi1.3.0", "started": start, "rampEnd": rampEnd, "ended": end, "requested": *n, "established": established.Load(), "healthyAtEnd": healthy, "holdSeconds": end.Sub(rampEnd).Seconds(), "duplicates": duplicates, "regressions": regressions, "taskAttempts": taskCount, "taskErrors": taskErrors, "taskCompletionPollLatencyMs": latencies, "quantileAlgorithm": "nearest rank, ceil(q*n)-1; 50ms HTTP completion polling included", "p50": quantile(.5), "p95": quantile(.95), "p99": quantile(.99), "metrics": metrics, "connections": receipts}
	f, e := os.Create(*out)
	if e != nil {
		panic(e)
	}
	defer f.Close()
	json.NewEncoder(f).Encode(report)
	fmt.Printf("requested=%d established=%d healthy=%d taskCompleted=%d errors=%d\n", *n, established.Load(), healthy, len(latencies), len(taskErrors))
}
