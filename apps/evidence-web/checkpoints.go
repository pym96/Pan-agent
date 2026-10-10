package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"time"
)

// Authorization is the DB ownership chain, never a supplied file/hash. Local DB administrators
// and trusted host operators remain inside the trust boundary; these hashes are not signatures.
func (a *app) resume(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in struct {
		RequestID    string `json:"requestId"`
		CheckpointID string `json:"checkpointId"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	if len(in.RequestID) < 1 || len(in.RequestID) > 128 || !hashPattern.MatchString(in.CheckpointID) {
		fail(w, 400, "invalid resume identity")
		return
	}
	ctx := r.Context()
	tx, e := a.db.Begin(ctx)
	if e != nil {
		fail(w, 503, "resume unavailable")
		return
	}
	defer tx.Rollback(ctx)
	cid, tid := r.PathValue("id"), r.PathValue("task")
	var bid string
	if tx.QueryRow(ctx, "SELECT bundle_id FROM ew_conversations WHERE id=$1 AND account_id=$2 FOR UPDATE", cid, owner).Scan(&bid) != nil {
		fail(w, 404, "conversation not found")
		return
	}
	var oldTask, oldPoint, attempt string
	if tx.QueryRow(ctx, "SELECT task_id,checkpoint_id,attempt_id FROM ew_resumes WHERE account_id=$1 AND conversation_id=$2 AND request_id=$3", owner, cid, in.RequestID).Scan(&oldTask, &oldPoint, &attempt) == nil {
		if oldTask != tid || oldPoint != in.CheckpointID {
			fail(w, 409, "requestId already bound")
			return
		}
		send(w, 200, map[string]string{"taskId": tid, "attemptId": attempt, "decision": "resuming"})
		return
	}
	var state string
	var stopped, active bool
	var cancelled bool
	if tx.QueryRow(ctx, "SELECT state,cleanup_confirmed,active_branch,cancel_requested_at IS NOT NULL FROM ew_tasks WHERE id=$1 AND account_id=$2 AND conversation_id=$3 AND bundle_id=$4 FOR UPDATE", tid, owner, cid, bid).Scan(&state, &stopped, &active, &cancelled) != nil {
		fail(w, 404, "task not found")
		return
	}
	if (state != "interrupted" && state != "failed") || !stopped || !active || cancelled {
		fail(w, 409, "task not stopped or checkpoint superseded")
		return
	}
	var raw []byte
	var sha string
	if tx.QueryRow(ctx, `SELECT payload,sha256 FROM ew_checkpoints WHERE id=$1 AND task_id=$2 AND account_id=$3 AND conversation_id=$4 AND bundle_id=$5 AND eligible AND consumed_by IS NULL AND attempt_id=(SELECT execution_id FROM ew_tasks WHERE id=$2) FOR UPDATE`, in.CheckpointID, tid, owner, cid, bid).Scan(&raw, &sha) != nil || hash(raw) != sha {
		fail(w, 409, "no valid owned checkpoint")
		return
	}
	var version struct {
		Version int `json:"version"`
	}
	if json.Unmarshal(raw, &version) != nil {
		fail(w, 409, "checkpoint invalid")
		return
	}
	if version.Version == 2 {
		var entry string
		var environmentRaw []byte
		if tx.QueryRow(ctx, "SELECT entry,environment FROM ew_reconcile_runtime WHERE singleton=111").Scan(&entry, &environmentRaw) != nil {
			fail(w, 409, "reconciler unavailable")
			return
		}
		var environment []string
		if json.Unmarshal(environmentRaw, &environment) != nil {
			fail(w, 409, "reconciler unavailable")
			return
		}
		var question, contextSHA string
		if tx.QueryRow(ctx, "SELECT question,context_sha256 FROM ew_tasks WHERE id=$1", tid).Scan(&question, &contextSHA) != nil {
			fail(w, 409, "task identity unavailable")
			return
		}
		input, _ := json.Marshal(map[string]any{"checkpoint": json.RawMessage(raw), "job": map[string]string{"taskId": tid, "question": question, "contextSHA256": contextSHA}})
		bounded, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		cmd := exec.CommandContext(bounded, "node", filepath.Join(filepath.Dir(entry), "reconcile.mjs"))
		cmd.Env = environment
		cmd.Stdin = bytes.NewReader(input)
		output, err := cmd.Output()
		var decision map[string]string
		if json.Unmarshal(output, &decision) != nil {
			decision = map[string]string{"decision": "unresolved", "reason": "operation_validation_unavailable"}
		}
		_, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET reconciliation=$2 WHERE id=$1", in.CheckpointID, decision)
		if e != nil {
			fail(w, 503, "reconciliation unavailable")
			return
		}
		if err != nil || (decision["decision"] != "confirmed_complete" && decision["decision"] != "confirmed_not_started") {
			if tx.Commit(ctx) != nil {
				fail(w, 503, "reconciliation unavailable")
				return
			}
			send(w, 409, map[string]string{"error": "仍未知: " + decision["reason"], "decision": "unresolved"})
			return
		}
	}
	attempt = id()
	_, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET eligible=false,consumed_by=$2 WHERE id=$1", in.CheckpointID, attempt)
	if e == nil {
		_, e = tx.Exec(ctx, "INSERT INTO ew_attempts(id,task_id,checkpoint_id,state) VALUES($1,$2,$3,'resuming')", attempt, tid, in.CheckpointID)
	}
	if e == nil {
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET state='queued',execution_id=$2,resume_checkpoint=$3,node_pid=NULL,reason='explicit resume queued; validation before effects',finished_at=NULL,stop_confirmed_at=NULL WHERE id=$1", tid, attempt, in.CheckpointID)
	}
	if e == nil {
		_, e = tx.Exec(ctx, "INSERT INTO ew_resumes VALUES($1,$2,$3,$4,$5,$6)", owner, cid, in.RequestID, tid, in.CheckpointID, attempt)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		fail(w, 503, "resume unavailable")
		return
	}
	send(w, 200, map[string]string{"taskId": tid, "attemptId": attempt, "decision": "resuming"})
}

func checkpointBarrier(ctx context.Context, db *pgxpool.Pool, tid, attempt, dir, kind, point, sha string) error {
	tx, e := db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx); e != nil {
		return e
	}
	var state, current string
	if e = tx.QueryRow(ctx, "SELECT state,execution_id FROM ew_tasks WHERE id=$1 FOR UPDATE", tid).Scan(&state, &current); e != nil {
		return e
	}
	if state != "running" || current != attempt {
		return errors.New("checkpoint control superseded")
	}
	if _, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET eligible=false WHERE task_id=$1", tid); e != nil {
		return e
	}
	if kind == "checkpoint" || kind == "dispatch" || kind == "receipt" {
		if !hashPattern.MatchString(point) || !hashPattern.MatchString(sha) {
			return errors.New("invalid checkpoint identity")
		}
		path := filepath.Join(dir, "checkpoint.json")
		st, err := os.Lstat(path)
		if err != nil || !st.Mode().IsRegular() || st.Size() > 8<<20 {
			return errors.New("checkpoint file invalid")
		}
		raw, err := os.ReadFile(path)
		if err != nil || hash(raw) != sha {
			return errors.New("checkpoint bytes invalid")
		}
		var envelope struct {
			Version   int             `json:"version"`
			TaskID    string          `json:"taskId"`
			AttemptID string          `json:"attemptId"`
			Native    json.RawMessage `json:"native"`
		}
		if json.Unmarshal(raw, &envelope) != nil || (envelope.Version != 1 && envelope.Version != 2) || envelope.TaskID != tid || envelope.AttemptID != attempt || len(envelope.Native) == 0 {
			return errors.New("checkpoint ownership invalid")
		}
		if kind == "dispatch" || kind == "receipt" {
			var previous []byte
			var previousSHA string
			if tx.QueryRow(ctx, "SELECT payload,sha256 FROM ew_checkpoints WHERE id=$1 AND task_id=$2 AND attempt_id=$3 AND consumed_by IS NULL FOR UPDATE", point, tid, attempt).Scan(&previous, &previousSHA) != nil || hash(previous) != previousSHA {
				return errors.New("operation previous invalid")
			}
			var before, after map[string]any
			if json.Unmarshal(previous, &before) != nil || json.Unmarshal(raw, &after) != nil {
				return errors.New("operation encoding invalid")
			}
			prior, ok := before["operation"].(map[string]any)
			if !ok {
				return errors.New("operation previous missing")
			}
			next, ok := after["operation"].(map[string]any)
			if !ok {
				return errors.New("operation next missing")
			}
			if !reflect.DeepEqual(before["native"], after["native"]) || !reflect.DeepEqual(before["identity"], after["identity"]) || !reflect.DeepEqual(prior["binding"], next["binding"]) || (kind == "dispatch" && (prior["state"] != "pre_dispatch" || next["state"] != "dispatched")) || (kind == "receipt" && (prior["state"] != "dispatched" || next["state"] != "completed")) {
				return errors.New("operation transition rejected")
			}
			if _, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET payload=$2,sha256=$3,eligible=true WHERE id=$1", point, raw, sha); e != nil {
				return e
			}
			return tx.Commit(ctx)
		}
		_, e = tx.Exec(ctx, `INSERT INTO ew_checkpoints(id,task_id,attempt_id,account_id,conversation_id,bundle_id,sha256,payload) SELECT $1,id,$3,account_id,conversation_id,bundle_id,$4,$5 FROM ew_tasks WHERE id=$2`, point, tid, attempt, sha, raw)
		if e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}
func (a *app) checkpointMetadata(ctx context.Context, tid string) map[string]any {
	out := map[string]any{"recoverable": false, "attempts": []any{}}
	var cp string
	var eligible bool
	var payload []byte
	var sha string
	e := a.db.QueryRow(ctx, `SELECT c.id,c.eligible AND c.consumed_by IS NULL AND t.cleanup_confirmed AND t.active_branch AND t.cancel_requested_at IS NULL AND t.state IN ('interrupted','failed') AND c.attempt_id=t.execution_id,c.payload,c.sha256 FROM ew_checkpoints c JOIN ew_tasks t ON t.id=c.task_id WHERE t.id=$1 ORDER BY c.created_at DESC LIMIT 1`, tid).Scan(&cp, &eligible, &payload, &sha)
	if e == nil {
		out["checkpointId"] = cp
		out["recoverable"] = eligible && hash(payload) == sha
		var c struct {
			Version   int `json:"version"`
			Operation struct {
				State string `json:"state"`
			} `json:"operation"`
		}
		if json.Unmarshal(payload, &c) == nil && c.Version == 2 {
			out["operationState"] = c.Operation.State
			out["reconcileAvailable"] = eligible && hash(payload) == sha
			out["recoverable"] = false
			var verdict json.RawMessage
			if a.db.QueryRow(ctx, "SELECT reconciliation FROM ew_checkpoints WHERE id=$1", cp).Scan(&verdict) == nil {
				out["reconciliation"] = verdict
			}
		}
		if hash(payload) != sha {
			out["reason"] = "checkpoint_integrity_invalid"
		}
	}
	rows, e := a.db.Query(ctx, "SELECT id,checkpoint_id,node_pid,state,started_at,stopped_at,result FROM ew_attempts WHERE task_id=$1 ORDER BY started_at,id", tid)
	if e == nil {
		defer rows.Close()
		items := []any{}
		for rows.Next() {
			var id string
			var checkpoint *string
			var pid *int
			var state string
			var start, stop any
			var result json.RawMessage
			if rows.Scan(&id, &checkpoint, &pid, &state, &start, &stop, &result) == nil {
				items = append(items, map[string]any{"id": id, "checkpointId": checkpoint, "nodePid": pid, "state": state, "startedAt": start, "stoppedAt": stop, "result": result})
			}
		}
		out["attempts"] = items
	}
	out["accounting"] = a.checkpointAccounting(ctx, tid)
	return out
}

// Settlement identity, not attempts' cumulative totals, prevents double counting restored usage.
func (a *app) checkpointAccounting(ctx context.Context, tid string) map[string]any {
	unavailable := map[string]any{"unavailable": true, "known": nil, "unknown": nil, "input": nil, "output": nil, "totalTokens": nil}
	rows, e := a.db.Query(ctx, "SELECT DISTINCT ON (event->>'runId',event->>'turn') event FROM ew_task_events WHERE task_id=$1 AND event->>'type'='model.turn_settled' ORDER BY event->>'runId',event->>'turn',sequence", tid)
	result := map[string]any{"label": "Faux synthetic; actual settled exchanges deduplicated by run/turn", "known": 0, "unknown": 0, "input": 0.0, "output": 0.0, "totalTokens": 0.0}
	if e != nil {
		return unavailable
	}
	defer rows.Close()
	for rows.Next() {
		var raw []byte
		if rows.Scan(&raw) != nil {
			return unavailable
		}
		var event struct {
			Usage struct {
				Status string             `json:"status"`
				Value  map[string]float64 `json:"value"`
			} `json:"usage"`
		}
		if json.Unmarshal(raw, &event) != nil {
			return unavailable
		}
		if event.Usage.Status == "reported" {
			result["known"] = result["known"].(int) + 1
			for _, k := range []string{"input", "output", "totalTokens"} {
				result[k] = result[k].(float64) + event.Usage.Value[k]
			}
		} else {
			result["unknown"] = result["unknown"].(int) + 1
		}
	}
	if rows.Err() != nil {
		return unavailable
	}
	rows.Close()
	// A sent but unsettled exchange is unknown, never free.
	var missing int
	if e = a.db.QueryRow(ctx, `SELECT count(*) FROM (SELECT DISTINCT event->>'runId' r,event->>'turn' n FROM ew_task_events WHERE task_id=$1 AND event->>'type'='model.turn_started' EXCEPT SELECT DISTINCT event->>'runId',event->>'turn' FROM ew_task_events WHERE task_id=$1 AND event->>'type'='model.turn_settled') x`, tid).Scan(&missing); e != nil {
		return unavailable
	}
	var finishedTools, uncertainTools int
	if a.db.QueryRow(ctx, `SELECT count(*) FROM ew_task_events WHERE task_id=$1 AND event->>'type'='sandbox.result'`, tid).Scan(&finishedTools) != nil {
		return unavailable
	}
	if a.db.QueryRow(ctx, `SELECT count(*) FROM (SELECT DISTINCT event->>'toolCallId' FROM ew_task_events WHERE task_id=$1 AND event->>'type'='operation.persisted' AND event->>'phase'='dispatched' EXCEPT SELECT DISTINCT event->>'toolCallId' FROM ew_task_events WHERE task_id=$1 AND event->>'type'='sandbox.result') x`, tid).Scan(&uncertainTools) != nil {
		return unavailable
	}
	result["observedToolExecutions"] = finishedTools
	result["dispatchedWithoutObservedResult"] = uncertainTools
	result["unknown"] = result["unknown"].(int) + missing
	return result
}
