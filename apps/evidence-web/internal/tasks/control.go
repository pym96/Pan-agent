package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/result"

	"github.com/jackc/pgx/v5"
)

func (a *Store) Control(ctx context.Context, owner string, key, taskID, verb string, in ControlInput) result.Value {
	action := verb
	if (action != "cancel" && action != "replace") || len(in.RequestID) < 1 || len(in.RequestID) > 128 || (action == "replace" && (len(in.Question) < 1 || len(in.Question) > 4000)) || (action == "cancel" && in.Question != "") {
		return result.Fail(result.Invalid, "invalid control action/requestId/question")
	}
	cid, tid := key, taskID
	tx, e := a.db.Begin(ctx)
	if e != nil {
		return result.Fail(result.Unavailable, "control unavailable")
	}
	defer tx.Rollback(ctx)
	var bid string
	var seq int64
	if tx.QueryRow(ctx, "SELECT bundle_id,next_sequence FROM ew_conversations WHERE id=$1 AND account_id=$2 FOR UPDATE", cid, owner).Scan(&bid, &seq) != nil {
		return result.Fail(result.Missing, "conversation not found")
	}
	var oldTarget, oldAction, oldQuestion, decision string
	var replacement *string
	e = tx.QueryRow(ctx, "SELECT target_id,action,question,replacement_id,decision FROM ew_controls WHERE account_id=$1 AND conversation_id=$2 AND request_id=$3", owner, cid, in.RequestID).Scan(&oldTarget, &oldAction, &oldQuestion, &replacement, &decision)
	if e == nil {
		if oldTarget != tid || oldAction != action || oldQuestion != in.Question {
			return result.Fail(result.Conflict, "requestId bound to different control")
		}
		return result.OK(result.Success, map[string]any{"targetId": tid, "replacementId": replacement, "decision": decision})
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return result.Fail(result.Unavailable, "control unavailable")
	}
	var state string
	var active, stopped bool
	var targetSeq int64
	if tx.QueryRow(ctx, "SELECT state,active_branch,message_sequence,cleanup_confirmed FROM ew_tasks WHERE id=$1 AND conversation_id=$2 AND account_id=$3 FOR UPDATE", tid, cid, owner).Scan(&state, &active, &targetSeq, &stopped) != nil {
		return result.Fail(result.Missing, "task not found in conversation")
	}
	if action == "replace" {
		var current string
		e = tx.QueryRow(ctx, "SELECT id FROM ew_tasks WHERE conversation_id=$1 AND active_branch AND state IN ('running','cancelling','queued') ORDER BY CASE WHEN state IN ('running','cancelling') THEN 0 ELSE 1 END,message_sequence LIMIT 1", cid).Scan(&current)
		if e != nil || current != tid || !active || (state != "running" && state != "queued") {
			return result.Fail(result.Conflict, "target is not the current replaceable task; append instead")
		}
		next := identity.NewID()
		replacement = &next
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET active_branch=false,state=CASE WHEN id=$2 THEN state ELSE 'superseded' END,reason=CASE WHEN id=$2 THEN reason ELSE 'superseded by explicit replacement '||$3 END,finished_at=CASE WHEN id=$2 THEN finished_at ELSE now() END,cleanup_confirmed=CASE WHEN id=$2 THEN cleanup_confirmed ELSE true END WHERE conversation_id=$1 AND active_branch AND (id=$2 OR (message_sequence>$4 AND state IN ('queued','blocked')))", cid, tid, next, targetSeq)
		if e == nil {
			_, e = tx.Exec(ctx, "INSERT INTO ew_tasks(id,bundle_id,account_id,question,state,conversation_id,message_sequence,request_id,replaces) VALUES($1,$2,$3,$4,'queued',$5,$6,$1,$7)", next, bid, owner, in.Question, cid, seq, tid)
		}
		if e == nil {
			_, e = tx.Exec(ctx, "UPDATE ew_conversations SET next_sequence=next_sequence+1 WHERE id=$1", cid)
		}
		if e != nil {
			return result.Fail(result.Unavailable, "replacement unavailable")
		}
	}
	decision = state
	e = nil
	var hasPoint bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM ew_checkpoints WHERE task_id=$1 AND eligible)", tid).Scan(&hasPoint); e != nil {
		return result.Fail(result.Unavailable, "control unavailable")
	}
	if _, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET eligible=false WHERE task_id=$1", tid); e != nil {
		return result.Fail(result.Unavailable, "control unavailable")
	}
	if state == "queued" || (hasPoint && stopped && (state == "interrupted" || state == "failed")) {
		decision = "cancelled"
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET state='cancelled',cancel_requested_at=now(),finished_at=now(),cleanup_confirmed=true,stop_confirmed_at=now(),reason='cancelled before execution' WHERE id=$1", tid)
	} else if state == "running" || (hasPoint && !stopped && (state == "interrupted" || state == "failed")) {
		decision = "cancelling"
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET state='cancelling',cancel_requested_at=now(),cleanup_confirmed=false,reason='cancel intent persisted; stop not confirmed' WHERE id=$1", tid)
	}
	if e == nil && decision == "cancelled" {
		_, e = tx.Exec(ctx, "UPDATE ew_attempts SET state='cancelled',stopped_at=now() WHERE task_id=$1 AND node_pid IS NULL AND state='resuming'", tid)
	}
	if e == nil {
		_, e = tx.Exec(ctx, "INSERT INTO ew_controls(account_id,conversation_id,request_id,target_id,action,question,replacement_id,decision) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", owner, cid, in.RequestID, tid, action, in.Question, replacement, decision)
	}
	if e == nil {
		event, _ := json.Marshal(map[string]any{"type": "control.persisted", "action": action, "decision": decision, "replacementId": replacement, "requestId": in.RequestID})
		_, e = tx.Exec(ctx, "INSERT INTO ew_task_events(task_id,event) VALUES($1,$2)", tid, event)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		return result.Fail(result.Unavailable, "control unavailable")
	}
	return result.OK(result.Success, map[string]any{"targetId": tid, "replacementId": replacement, "decision": decision})
}
