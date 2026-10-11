package tasks

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/result"
)

func (a *Store) Resume(ctx context.Context, owner string, key, taskID string, in ResumeInput) result.Value {
	if len(in.RequestID) < 1 || len(in.RequestID) > 128 || !evidence.ValidHash(in.CheckpointID) {
		return result.Fail(result.Invalid, "invalid resume identity")
	}
	tx, e := a.db.Begin(ctx)
	if e != nil {
		return result.Fail(result.Unavailable, "resume unavailable")
	}
	defer tx.Rollback(ctx)
	cid, tid := key, taskID
	var bid string
	if tx.QueryRow(ctx, "SELECT bundle_id FROM ew_conversations WHERE id=$1 AND account_id=$2 FOR UPDATE", cid, owner).Scan(&bid) != nil {
		return result.Fail(result.Missing, "conversation not found")
	}
	var oldTask, oldPoint, attempt string
	if tx.QueryRow(ctx, "SELECT task_id,checkpoint_id,attempt_id FROM ew_resumes WHERE account_id=$1 AND conversation_id=$2 AND request_id=$3", owner, cid, in.RequestID).Scan(&oldTask, &oldPoint, &attempt) == nil {
		if oldTask != tid || oldPoint != in.CheckpointID {
			return result.Fail(result.Conflict, "requestId already bound")
		}
		return result.OK(result.Success, map[string]string{"taskId": tid, "attemptId": attempt, "decision": "resuming"})
	}
	var state string
	var stopped, active bool
	var cancelled bool
	if tx.QueryRow(ctx, "SELECT state,cleanup_confirmed,active_branch,cancel_requested_at IS NOT NULL FROM ew_tasks WHERE id=$1 AND account_id=$2 AND conversation_id=$3 AND bundle_id=$4 FOR UPDATE", tid, owner, cid, bid).Scan(&state, &stopped, &active, &cancelled) != nil {
		return result.Fail(result.Missing, "task not found")
	}
	var live bool
	if tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM ew_task_events WHERE task_id=$1 AND event->>'type'='execution.identity' AND event->>'mode'='kimi')", tid).Scan(&live) != nil {
		return result.Fail(result.Unavailable, "execution identity unavailable")
	}
	if live {
		return result.Fail(result.Conflict, "live Kimi resume unsupported; no provider send; create an explicit new task")
	}
	if (state != "interrupted" && state != "failed") || !stopped || !active || cancelled {
		return result.Fail(result.Conflict, "task not stopped or checkpoint superseded")
	}
	var raw []byte
	var sha string
	if tx.QueryRow(ctx, `SELECT payload,sha256 FROM ew_checkpoints WHERE id=$1 AND task_id=$2 AND account_id=$3 AND conversation_id=$4 AND bundle_id=$5 AND eligible AND consumed_by IS NULL AND attempt_id=(SELECT execution_id FROM ew_tasks WHERE id=$2) FOR UPDATE`, in.CheckpointID, tid, owner, cid, bid).Scan(&raw, &sha) != nil || evidence.Hash(raw) != sha {
		return result.Fail(result.Conflict, "no valid owned checkpoint")
	}
	var version struct {
		Version int `json:"version"`
	}
	if json.Unmarshal(raw, &version) != nil {
		return result.Fail(result.Conflict, "checkpoint invalid")
	}
	if version.Version == 2 {
		var entry string
		var environmentRaw []byte
		if tx.QueryRow(ctx, "SELECT entry,environment FROM ew_reconcile_runtime WHERE singleton=111").Scan(&entry, &environmentRaw) != nil {
			return result.Fail(result.Conflict, "reconciler unavailable")
		}
		var environment []string
		if json.Unmarshal(environmentRaw, &environment) != nil {
			return result.Fail(result.Conflict, "reconciler unavailable")
		}
		var question, contextSHA string
		if tx.QueryRow(ctx, "SELECT question,context_sha256 FROM ew_tasks WHERE id=$1", tid).Scan(&question, &contextSHA) != nil {
			return result.Fail(result.Conflict, "task identity unavailable")
		}
		input, _ := json.Marshal(map[string]any{"checkpoint": json.RawMessage(raw), "job": map[string]string{"taskId": tid, "question": question, "contextSHA256": contextSHA}})
		output, err := a.process.Reconcile(ctx, entry, environment, input)
		var decision map[string]string
		if json.Unmarshal(output, &decision) != nil {
			decision = map[string]string{"decision": "unresolved", "reason": "operation_validation_unavailable"}
		}
		_, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET reconciliation=$2 WHERE id=$1", in.CheckpointID, decision)
		if e != nil {
			return result.Fail(result.Unavailable, "reconciliation unavailable")
		}
		if err != nil || (decision["decision"] != "confirmed_complete" && decision["decision"] != "confirmed_not_started") {
			if tx.Commit(ctx) != nil {
				return result.Fail(result.Unavailable, "reconciliation unavailable")
			}
			return result.OK(result.Conflict, map[string]string{"error": "仍未知: " + decision["reason"], "decision": "unresolved"})
		}
	}
	attempt = identity.NewID()
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
		return result.Fail(result.Unavailable, "resume unavailable")
	}
	return result.OK(result.Success, map[string]string{"taskId": tid, "attemptId": attempt, "decision": "resuming"})
}
