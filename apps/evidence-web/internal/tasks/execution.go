package tasks

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/result"
)

type Input struct {
	Files                    map[string][]byte
	Checkpoint               []byte
	ContextText, ContextHash string
}

func (s *Store) Load(ctx context.Context, a Authority) (Input, error) {
	if !a.Valid() {
		return Input{}, ErrFenced
	}
	tid, attempt := a.Task, a.Attempt
	tx, e := s.db.Begin(ctx)
	if e != nil {
		return Input{}, e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx, a); e != nil {
		return Input{}, e
	}
	var bid string
	if e = tx.QueryRow(ctx, "SELECT bundle_id FROM ew_tasks WHERE id=$1", tid).Scan(&bid); e != nil {
		return Input{}, e
	}

	var checkpoint []byte
	var cp *string
	if e := tx.QueryRow(ctx, "SELECT resume_checkpoint FROM ew_tasks WHERE id=$1", tid).Scan(&cp); e != nil {
		return Input{}, e
	}
	if cp != nil {
		var sha string
		if e := tx.QueryRow(ctx, `SELECT c.payload,c.sha256 FROM ew_checkpoints c JOIN ew_tasks t ON t.id=c.task_id WHERE c.id=$1 AND c.task_id=$2 AND c.account_id=t.account_id AND c.bundle_id=t.bundle_id AND c.conversation_id=t.conversation_id AND c.consumed_by=$3 AND NOT c.eligible`, *cp, tid, attempt).Scan(&checkpoint, &sha); e != nil || evidence.Hash(checkpoint) != sha {
			return Input{}, errors.New("resume checkpoint invalid")
		}
	}
	files := map[string][]byte{}
	rows, e := tx.Query(ctx, "SELECT name,content FROM ew_files WHERE bundle_id=$1", bid)
	if e != nil {
		return Input{}, e
	}
	for rows.Next() {
		var n string
		var b []byte
		if e = rows.Scan(&n, &b); e != nil {
			rows.Close()
			return Input{}, e
		}
		if !evidence.ValidName(n) || n == "task.json" {
			rows.Close()
			return Input{}, errors.New("reserved or unsafe input name")
		}
		files[n] = b
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return Input{}, e
	}
	var summary, contextText, contextHash string
	if e = tx.QueryRow(ctx, "SELECT summary_name FROM ew_bundles WHERE id=$1", bid).Scan(&summary); e != nil {
		return Input{}, e
	}
	if e = tx.QueryRow(ctx, "SELECT context_text,context_sha256 FROM ew_tasks WHERE id=$1", tid).Scan(&contextText, &contextHash); e != nil {
		return Input{}, e
	}
	var snapshot publicContext
	if json.Unmarshal([]byte(contextText), &snapshot) != nil || evidence.Hash([]byte(contextText)) != contextHash {
		return Input{}, errors.New("context identity invalid")
	}
	metadata, _ := json.Marshal(map[string]any{"summary": summary, "followup": len(snapshot.Turns) > 0, "priorTurns": snapshot.Turns})
	files["task.json"] = metadata
	if e = tx.Commit(ctx); e != nil {
		return Input{}, e
	}
	return Input{Files: files, Checkpoint: checkpoint, ContextText: contextText, ContextHash: contextHash}, nil
}

// Start serializes child creation/PID registration with revocation; no job is sent before commit.
func (s *Store) Start(ctx context.Context, a Authority, start func() (int, error)) error {
	if !a.Valid() {
		return ErrFenced
	}
	tx, e := s.db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx, a); e != nil {
		return e
	}
	pid, e := start()
	if e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "UPDATE ew_tasks SET node_pid=$2 WHERE id=$1", a.Task, pid); e != nil {
		return e
	}
	if _, e = tx.Exec(ctx, "UPDATE ew_attempts SET node_pid=$2,state='running' WHERE id=$1", a.Attempt, pid); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (s *Store) Event(ctx context.Context, a Authority, event json.RawMessage) error {
	_, e := executorExec(ctx, s.db, a, "INSERT INTO ew_task_events(task_id,event) VALUES($1,$2)", a.Task, event)
	return e
}
func (s *Store) State(ctx context.Context, a Authority) (string, error) {
	if !a.Valid() {
		return "", ErrFenced
	}
	var state string
	e := s.db.QueryRow(ctx, "SELECT state FROM ew_tasks WHERE id=$1 AND execution_id=$2 AND worker_id=$3 AND generation=$4", a.Task, a.Attempt, a.Owner, a.Generation).Scan(&state)
	return state, e
}
func (s *Store) Publish(ctx context.Context, a Authority, final json.RawMessage) error {
	if !a.Valid() {
		return ErrFenced
	}
	tid, attempt := a.Task, a.Attempt
	var reply result.ExecutionReply
	if json.Unmarshal(final, &reply) != nil || !reply.Cleanup {
		return errors.New("executor result unavailable")
	}

	state := "failed"
	if reply.Result.Status == "completed" {
		state = "completed"
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	tx, e := s.db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx, a); e != nil {
		return e
	}
	var current string
	if e = tx.QueryRow(ctx, "SELECT state FROM ew_tasks WHERE id=$1 FOR UPDATE", tid).Scan(&current); e != nil {
		return e
	}
	if current != "running" && current != "cancelling" {
		return errors.New("task ownership lost")
	}
	// A failed host receipt barrier remains available for readonly reconciliation.
	// Its dispatch state never grants replay; cancellation/completion still revoke it.
	keepPending := false
	if state == "failed" && current == "running" {
		var pending []byte
		if tx.QueryRow(ctx, "SELECT payload FROM ew_checkpoints WHERE task_id=$1 AND attempt_id=$2 AND eligible AND consumed_by IS NULL ORDER BY created_at DESC LIMIT 1", tid, attempt).Scan(&pending) == nil {
			var point struct {
				Version int `json:"version"`
			}
			keepPending = json.Unmarshal(pending, &point) == nil && point.Version == 2
		}
	}
	if !keepPending {
		if _, e = tx.Exec(ctx, "UPDATE ew_checkpoints SET eligible=false WHERE task_id=$1", tid); e != nil {
			return e
		}
	}
	if state == "completed" {
		if len(reply.Artifacts) != 2 {
			return errors.New("artifact set invalid")
		}
		for name, artifact := range reply.Artifacts {
			if name != "details.csv" && name != "analysis.json" {
				return errors.New("artifact name invalid")
			}
			b, e := base64.StdEncoding.DecodeString(artifact.Base64)
			if e != nil || len(b) > 2<<20 || evidence.Hash(b) != artifact.SHA {
				return errors.New("artifact hash invalid")
			}
			if _, e = tx.Exec(ctx, "INSERT INTO ew_task_artifacts(task_id,name,sha256,content) VALUES($1,$2,$3,$4)", tid, name, artifact.SHA, b); e != nil {
				return e
			}
		}
	}
	// Persist metadata without duplicate base64 blobs; artifact downloads have their own owner-gated endpoint.
	var meta map[string]any
	_ = json.Unmarshal(final, &meta)
	art := map[string]any{}
	for n, a := range reply.Artifacts {
		art[n] = map[string]string{"sha256": a.SHA}
	}
	meta["artifacts"] = art
	clean, _ := json.Marshal(meta)
	if current == "cancelling" {
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET attempt_result=$2,state='cancelled',finished_at=now(),cleanup_confirmed=true,stop_confirmed_at=now(),reason='cancel intent won; late result retained as attempt only' WHERE id=$1", tid, clean)
		if e != nil {
			return e
		}
		return tx.Commit(ctx)
	}
	tag, e := tx.Exec(ctx, "UPDATE ew_tasks SET state=$2,result=$3,reason=NULL,finished_at=now(),stop_confirmed_at=now(),cleanup_confirmed=true WHERE id=$1 AND state='running'", tid, state, clean)
	if e != nil || tag.RowsAffected() != 1 {
		return errors.New("task ownership lost; result not published")
	}
	if _, e = tx.Exec(ctx, "UPDATE ew_attempts SET state=$2,result=$3,stopped_at=now() WHERE id=$1", attempt, state, clean); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
