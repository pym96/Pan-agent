package taskview

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/evidence"
)

func (a *Reader) checkpointMetadata(ctx context.Context, tid string) map[string]any {
	out := map[string]any{"recoverable": false, "attempts": []any{}}
	var cp string
	var eligible bool
	var payload []byte
	var sha string
	e := a.db.QueryRow(ctx, `SELECT c.id,c.eligible AND c.consumed_by IS NULL AND t.cleanup_confirmed AND t.active_branch AND t.cancel_requested_at IS NULL AND t.state IN ('interrupted','failed') AND c.attempt_id=t.execution_id,c.payload,c.sha256 FROM ew_checkpoints c JOIN ew_tasks t ON t.id=c.task_id WHERE t.id=$1 ORDER BY c.created_at DESC LIMIT 1`, tid).Scan(&cp, &eligible, &payload, &sha)
	if e == nil {
		out["checkpointId"] = cp
		out["recoverable"] = eligible && evidence.Hash(payload) == sha
		var c struct {
			Version   int `json:"version"`
			Operation struct {
				State string `json:"state"`
			} `json:"operation"`
		}
		if json.Unmarshal(payload, &c) == nil && c.Version == 2 {
			out["operationState"] = c.Operation.State
			out["reconcileAvailable"] = eligible && evidence.Hash(payload) == sha
			out["recoverable"] = false
			var verdict json.RawMessage
			if a.db.QueryRow(ctx, "SELECT reconciliation FROM ew_checkpoints WHERE id=$1", cp).Scan(&verdict) == nil {
				out["reconciliation"] = verdict
			}
		}
		if evidence.Hash(payload) != sha {
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
func (a *Reader) checkpointAccounting(ctx context.Context, tid string) map[string]any {
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
