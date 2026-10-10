package tasks

import (
	"context"
	"errors"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/result"

	"github.com/jackc/pgx/v5"
)

func (a *Store) AppendQuestion(ctx context.Context, owner string, key string, in AppendQuestionInput) result.Value {
	if len(in.Question) < 1 || len(in.Question) > 4000 || len(in.RequestID) < 1 || len(in.RequestID) > 128 {
		return result.Fail(result.Invalid, "question 1–4000 bytes; requestId 1–128 bytes")
	}
	tx, e := a.db.Begin(ctx)
	if e != nil {
		return result.Fail(result.Unavailable, "submission unavailable")
	}
	defer tx.Rollback(ctx)
	var bid string
	var seq int64
	if tx.QueryRow(ctx, "SELECT bundle_id,next_sequence FROM ew_conversations WHERE id=$1 AND account_id=$2 FOR UPDATE", key, owner).Scan(&bid, &seq) != nil {
		return result.Fail(result.Missing, "conversation not found")
	}
	var tid, q, st string
	var oldSeq int64
	e = tx.QueryRow(ctx, "SELECT id,question,state,message_sequence FROM ew_tasks WHERE account_id=$1 AND conversation_id=$2 AND request_id=$3", owner, key, in.RequestID).Scan(&tid, &q, &st, &oldSeq)
	if e == nil {
		if q != in.Question {
			return result.Fail(result.Conflict, "requestId already bound to different question")
		}
		return result.OK(result.Success, map[string]any{"id": tid, "sequence": oldSeq, "state": st})
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		return result.Fail(result.Unavailable, "submission unavailable")
	}
	tid = identity.NewID()
	_, e = tx.Exec(ctx, "INSERT INTO ew_tasks(id,bundle_id,account_id,question,state,conversation_id,message_sequence,request_id) VALUES($1,$2,$3,$4,'queued',$5,$6,$7)", tid, bid, owner, in.Question, key, seq, in.RequestID)
	if e == nil {
		_, e = tx.Exec(ctx, "UPDATE ew_conversations SET next_sequence=next_sequence+1 WHERE id=$1", key)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		return result.Fail(result.Unavailable, "submission unavailable")
	}
	return result.OK(result.Created, map[string]any{"id": tid, "sequence": seq, "state": "queued"})
}
