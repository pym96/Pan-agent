package taskview

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/result"
	"time"
)

func (a *Reader) Task(ctx context.Context, owner string, key string) result.Value {
	var q, state, bid string
	var taskResult json.RawMessage
	var reason *string
	var cleanup bool
	var contextText, contextHash, conversationID *string
	var sequence *int64
	var startedAt, finishedAt, cancelAt, stopAt *time.Time
	var active bool
	var replaces *string
	var attempt json.RawMessage
	e := a.db.QueryRow(ctx, "SELECT question,state,bundle_id,result,reason,cleanup_confirmed,context_text,context_sha256,conversation_id,message_sequence,started_at,finished_at,cancel_requested_at,stop_confirmed_at,active_branch,replaces,attempt_result FROM ew_tasks WHERE id=$1 AND account_id=$2", key, owner).Scan(&q, &state, &bid, &taskResult, &reason, &cleanup, &contextText, &contextHash, &conversationID, &sequence, &startedAt, &finishedAt, &cancelAt, &stopAt, &active, &replaces, &attempt)
	if e != nil {
		return result.Fail(result.Missing, "任务不存在")
	}
	events := []json.RawMessage{}
	rows, e := a.db.Query(ctx, "SELECT event FROM ew_task_events WHERE task_id=$1 ORDER BY sequence", key)
	if e != nil {
		return result.Fail(result.Unavailable, "无法读取事件")
	}
	for rows.Next() {
		var b json.RawMessage
		if rows.Scan(&b) != nil {
			rows.Close()
			return result.Fail(result.Unavailable, "无法读取事件")
		}
		events = append(events, b)
	}
	rows.Close()
	if rows.Err() != nil {
		return result.Fail(result.Unavailable, "无法读取事件")
	}
	mode := "offline-faux"
	if state == "queued" {
		mode = "pending"
	}
	for _, ev := range events {
		var v struct {
			Type string `json:"type"`
			Mode string `json:"mode"`
		}
		if json.Unmarshal(ev, &v) == nil && v.Type == "execution.identity" && v.Mode != "" {
			mode = v.Mode
		}
	}
	var ownership json.RawMessage
	_ = a.db.QueryRow(ctx, `SELECT jsonb_build_object('workerId',worker_id,'generation',generation,'revokedAt',revoked_at,'attemptId',execution_id) FROM ew_tasks WHERE id=$1 AND account_id=$2`, key, owner).Scan(&ownership)
	return result.OK(result.Success, map[string]any{"ownership": ownership, "id": key, "question": q, "state": state, "bundleId": bid, "result": taskResult, "reason": reason, "cleanupConfirmed": cleanup, "events": events, "recovery": a.checkpointMetadata(ctx, key), "mode": mode, "cancelRequestedAt": cancelAt, "stopConfirmedAt": stopAt, "activeBranch": active, "replaces": replaces, "attemptResult": attempt, "startedAt": startedAt, "finishedAt": finishedAt, "contextText": contextText, "contextSHA256": contextHash, "conversationId": conversationID, "sequence": sequence, "notice": "执行终态、产物验证与答案正确性分开；具体模式见执行身份，未知用量不补零"})
}
