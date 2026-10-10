package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"pan-agent/evidence-web/internal/evidence"
	"path/filepath"
	"reflect"
)

func (s *Store) Checkpoint(ctx context.Context, a Authority, dir, kind, point, sha string) error {
	if !a.Valid() {
		return ErrFenced
	}
	tid, attempt := a.Task, a.Attempt
	tx, e := s.db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = requireAuthority(ctx, tx, a); e != nil {
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
		if !evidence.ValidHash(point) || !evidence.ValidHash(sha) {
			return errors.New("invalid checkpoint identity")
		}
		path := filepath.Join(dir, "checkpoint.json")
		st, err := os.Lstat(path)
		if err != nil || !st.Mode().IsRegular() || st.Size() > 8<<20 {
			return errors.New("checkpoint file invalid")
		}
		raw, err := os.ReadFile(path)
		if err != nil || evidence.Hash(raw) != sha {
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
			if tx.QueryRow(ctx, "SELECT payload,sha256 FROM ew_checkpoints WHERE id=$1 AND task_id=$2 AND attempt_id=$3 AND consumed_by IS NULL FOR UPDATE", point, tid, attempt).Scan(&previous, &previousSHA) != nil || evidence.Hash(previous) != previousSHA {
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
