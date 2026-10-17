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
	Bytes       int64     `json:"bytes"`
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
				parser := frame{}
				for scan.Scan() {
					line := scan.Text()
					if strings.HasPrefix(line, ": heartbeat") {
						v.Heartbeats++
						v.LastSeen = time.Now()
					}
					v.Bytes += int64(len(line) + 1)
					event, parseErr := parser.Feed(line)
					if parseErr != nil {
						v.Error = parseErr.Error()
						resp.Body.Close()
						return
					}
					if event != nil {
						id := event.ID
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
	timer := time.AfterFunc(*hold, cancel)
	defer timer.Stop()
	metrics := []json.RawMessage{}
	latencies := []float64{}
	taskErrors := []string{}
	taskRecords := []map[string]any{}
	taskCount := 0
	var measurements sync.Mutex
	var background sync.WaitGroup
	// Metrics collection is independent of the fixed open-loop task schedule.
	background.Add(1)
	go func() {
		defer background.Done()
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			req, _ := http.NewRequestWithContext(ctx, "GET", *base+"/metrics", nil)
			if resp, e := control.Do(req); e == nil {
				raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
				resp.Body.Close()
				if json.Valid(raw) {
					measurements.Lock()
					metrics = append(metrics, raw)
					measurements.Unlock()
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	for i := 0; time.Duration(i)*5*time.Second < *hold; i++ {
		target := rampEnd.Add(time.Duration(i) * 5 * time.Second)
		select {
		case <-ctx.Done():
			break
		case <-time.After(time.Until(target)):
		}
		if ctx.Err() != nil {
			break
		}
		taskCount++
		background.Add(1)
		go func(index int) {
			defer background.Done()
			sessionName := fmt.Sprintf("%s-s%d", *name, index%*shards)
			key := fmt.Sprintf("fixed-seed-142-%d", index)
			ts := time.Now()
			record := map[string]any{"key": key, "session": sessionName, "offeredAt": ts, "scheduledAt": rampEnd.Add(time.Duration(index) * 5 * time.Second), "outcome": "unknown"}
			latency := float64(-1)
			errText := ""
			defer func() {
				measurements.Lock()
				defer measurements.Unlock()
				taskRecords = append(taskRecords, record)
				if latency >= 0 {
					latencies = append(latencies, latency)
				}
				if errText != "" {
					taskErrors = append(taskErrors, key+": "+errText)
				}
			}()
			body, _ := json.Marshal(map[string]string{"key": key, "prompt": "Reply with a brief synthetic baseline greeting."})
			req, _ := http.NewRequestWithContext(ctx, "POST", *base+"/sessions/"+sessionName+"/tasks", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			resp, e := control.Do(req)
			if e != nil {
				errText = e.Error()
				record["error"] = errText
				return
			}
			record["httpStatus"] = resp.StatusCode
			var task struct {
				ID string `json:"id"`
			}
			json.NewDecoder(resp.Body).Decode(&task)
			resp.Body.Close()
			record["task"] = task.ID
			if resp.StatusCode != 202 {
				record["outcome"] = "not_acknowledged"
				errText = resp.Status
				return
			}
			record["acknowledgedAt"] = time.Now()
			record["outcome"] = "acknowledged_unobserved"
			for ctx.Err() == nil {
				req, _ := http.NewRequestWithContext(ctx, "GET", *base+"/sessions/"+sessionName+"/tasks", nil)
				r, e := control.Do(req)
				if e == nil {
					var tasks []struct {
						ID     string `json:"id"`
						Status string `json:"status"`
					}
					json.NewDecoder(r.Body).Decode(&tasks)
					r.Body.Close()
					for _, v := range tasks {
						if v.ID == task.ID && (v.Status == "completed" || v.Status == "interrupted" || v.Status == "cancelled") {
							record["outcome"] = v.Status
							record["observedAt"] = time.Now()
							if v.Status == "completed" {
								latency = time.Since(ts).Seconds() * 1000
								record["latencyMs"] = latency
							} else {
								errText = v.Status
							}
							return
						}
					}
				}
				select {
				case <-ctx.Done():
				case <-time.After(100 * time.Millisecond):
				}
			}
			errText = "terminal outcome not observed before hold deadline"
			record["error"] = errText
		}(i)
	}
	<-ctx.Done()
	end := time.Now()
	wg.Wait()
	background.Wait()
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
	report := map[string]any{"seed": 142, "uniqueSubscribedSessions": *shards, "executorConcurrencyLimit": 2, "model": "deterministic local HTTP through actual Pi1.3.0", "started": start, "rampEnd": rampEnd, "ended": end, "requested": *n, "established": established.Load(), "healthyAtEnd": healthy, "holdSeconds": end.Sub(rampEnd).Seconds(), "duplicates": duplicates, "regressions": regressions, "taskArrival": "open-loop one offer every 5s from ramp end; fixed 0.2/s", "taskRecords": taskRecords, "taskAttempts": taskCount, "taskErrors": taskErrors, "taskCompletionPollLatencyMs": latencies, "quantileAlgorithm": "nearest rank, ceil(q*n)-1; 100ms HTTP completion polling included", "p50": quantile(.5), "p95": quantile(.95), "p99": quantile(.99), "metrics": metrics, "connections": receipts}
	f, e := os.Create(*out)
	if e != nil {
		panic(e)
	}
	defer f.Close()
	json.NewEncoder(f).Encode(report)
	fmt.Printf("requested=%d established=%d healthy=%d taskCompleted=%d errors=%d\n", *n, established.Load(), healthy, len(latencies), len(taskErrors))
}
