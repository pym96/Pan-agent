package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"pan-agent/evidence-web/internal/evidence"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Snapshot public completed answers only; never copy archive internals or Provider continuation.
type publicTurn struct {
	TaskID    string `json:"taskId"`
	Sequence  int64  `json:"sequence"`
	Question  string `json:"question"`
	Answer    string `json:"answer"`
	ResultSHA string `json:"resultSHA256"`
}
type publicContext struct {
	TaskID         string       `json:"taskId"`
	Question       string       `json:"question"`
	Sequence       *int64       `json:"sequence"`
	Version        int          `json:"version"`
	ConversationID *string      `json:"conversationId"`
	BundleID       string       `json:"bundleId"`
	SummarySHA     string       `json:"summarySHA256"`
	Turns          []publicTurn `json:"turns"`
}

const maxContextBytes = 256 * 1024

func claimTask(ctx context.Context, db *pgxpool.Pool, wid string) (tid, bid, q string, err error) {
	tx, e := db.Begin(ctx)
	if e != nil {
		err = e
		return
	}
	defer tx.Rollback(ctx)
	{
		if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", claimLock); e != nil {
			err = e
			return
		}
		var available bool
		e = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM ew_owners WHERE id=$1 AND revoked_at IS NULL AND heartbeat>clock_timestamp()-interval '10 seconds') AND (SELECT count(*) FROM ew_tasks WHERE started_at IS NOT NULL AND NOT cleanup_confirmed)<2`, wid).Scan(&available)
		if e != nil {
			err = e
			return
		}
		if !available {
			err = pgx.ErrNoRows
			return
		}
	}
	var unsafe bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM ew_tasks WHERE state='cancelling' OR (started_at IS NOT NULL AND NOT cleanup_confirmed AND state IN ('interrupted','failed','cancelled')))").Scan(&unsafe); e != nil {
		err = e
		return
	}
	if unsafe {
		err = pgx.ErrNoRows
		return
	}
	// A missing/failed predecessor never becomes an invented answer. Blocked queues do not monopolize the Worker.
	_, e = tx.Exec(ctx, `UPDATE ew_tasks t SET state='blocked',reason='prerequisite unavailable: '||(SELECT p.id FROM ew_tasks p WHERE p.active_branch AND p.conversation_id=t.conversation_id AND p.message_sequence<t.message_sequence AND (p.state IN ('failed','interrupted','blocked','cancelled') OR (p.state='completed' AND COALESCE(p.result->'result'->>'finalText','')='')) ORDER BY p.message_sequence LIMIT 1),finished_at=now(),cleanup_confirmed=true WHERE t.active_branch AND t.state='queued' AND EXISTS(SELECT 1 FROM ew_tasks p WHERE p.active_branch AND p.conversation_id=t.conversation_id AND p.message_sequence<t.message_sequence AND (p.state IN ('failed','interrupted','blocked','cancelled') OR (p.state='completed' AND COALESCE(p.result->'result'->>'finalText','')='')))`)
	if e != nil {
		err = e
		return
	}
	var cid *string
	var seq *int64
	e = tx.QueryRow(ctx, `SELECT t.id,t.bundle_id,t.question,t.conversation_id,t.message_sequence FROM ew_tasks t WHERE t.active_branch AND t.state='queued' AND NOT EXISTS(SELECT 1 FROM ew_tasks p WHERE p.active_branch AND p.conversation_id=t.conversation_id AND p.message_sequence<t.message_sequence AND (p.state<>'completed' OR NOT p.cleanup_confirmed OR p.result IS NULL)) ORDER BY t.created_at,t.id LIMIT 1 FOR UPDATE OF t SKIP LOCKED`).Scan(&tid, &bid, &q, &cid, &seq)
	if errors.Is(e, pgx.ErrNoRows) {
		if e = tx.Commit(ctx); e != nil {
			err = e
		} else {
			err = pgx.ErrNoRows
		}
		return
	}
	if e != nil {
		err = e
		return
	}
	// A resumed task retains its original frozen public context; it is not a new question.
	var resume *string
	if e = tx.QueryRow(ctx, "SELECT resume_checkpoint FROM ew_tasks WHERE id=$1", tid).Scan(&resume); e != nil {
		err = e
		return
	}
	{
		if e = assignOwner(ctx, tx, tid, wid); e != nil {
			err = e
			return
		}
	}
	if resume != nil {
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET state='running',worker_id=$2,started_at=now(),cleanup_confirmed=false WHERE id=$1", tid, wid)
		if e == nil {
			e = tx.Commit(ctx)
		}
		err = e
		return
	}
	snapshot := publicContext{TaskID: tid, Question: q, Sequence: seq, Version: 1, ConversationID: cid, BundleID: bid, Turns: []publicTurn{}}
	if e = tx.QueryRow(ctx, "SELECT f.sha256 FROM ew_files f JOIN ew_bundles b ON b.id=f.bundle_id WHERE b.id=$1 AND f.name=b.summary_name", bid).Scan(&snapshot.SummarySHA); e != nil {
		err = e
		return
	}
	if cid != nil {
		rows, e := tx.Query(ctx, "SELECT id,message_sequence,question,result FROM ew_tasks WHERE active_branch AND conversation_id=$1 AND message_sequence<$2 ORDER BY message_sequence", *cid, *seq)
		if e != nil {
			err = e
			return
		}
		for rows.Next() {
			var t publicTurn
			var raw []byte
			if e = rows.Scan(&t.TaskID, &t.Sequence, &t.Question, &raw); e != nil {
				rows.Close()
				err = e
				return
			}
			var r struct {
				Result struct {
					FinalText string `json:"finalText"`
				} `json:"result"`
			}
			if json.Unmarshal(raw, &r) != nil || r.Result.FinalText == "" {
				rows.Close()
				err = errors.New("completed public answer missing")
				return
			}
			t.Answer = r.Result.FinalText
			t.ResultSHA = evidence.Hash(raw)
			snapshot.Turns = append(snapshot.Turns, t)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			err = e
			return
		}
	}
	raw, e := json.Marshal(snapshot)
	if e != nil {
		err = e
		return
	}
	if len(raw) > maxContextBytes {
		_, e = tx.Exec(ctx, "UPDATE ew_tasks SET state='blocked',reason='public context exceeds 262144 bytes; create a new conversation',finished_at=now(),cleanup_confirmed=true WHERE id=$1", tid)
		if e == nil {
			e = tx.Commit(ctx)
		}
		if e != nil {
			err = e
		} else {
			err = pgx.ErrNoRows
		}
		return
	}
	_, e = tx.Exec(ctx, "UPDATE ew_tasks SET state='running',worker_id=$2,started_at=now(),cleanup_confirmed=false,context_text=$3,context_sha256=$4 WHERE id=$1", tid, wid, string(raw), evidence.Hash(raw))
	if e == nil {
		e = tx.Commit(ctx)
	}
	err = e
	return
}
