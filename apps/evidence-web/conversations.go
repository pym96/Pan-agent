package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"net/http"
	"time"
)

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		fail(w, 400, "invalid JSON")
		return false
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		fail(w, 400, "invalid JSON")
		return false
	}
	return true
}
func (a *app) createConversation(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in struct {
		BundleID string `json:"bundleId"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	cid := id()
	tag, e := a.db.Exec(r.Context(), "INSERT INTO ew_conversations(id,bundle_id,account_id) SELECT $1,id,account_id FROM ew_bundles WHERE id=$2 AND account_id=$3", cid, in.BundleID, owner)
	if e != nil {
		fail(w, 503, "conversation unavailable")
		return
	}
	if tag.RowsAffected() != 1 {
		fail(w, 404, "bundle not found")
		return
	}
	send(w, 201, map[string]string{"id": cid, "bundleId": in.BundleID})
}
func (a *app) conversations(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	rows, e := a.db.Query(r.Context(), "SELECT id,bundle_id,created_at FROM ew_conversations WHERE account_id=$1 AND ($2='' OR bundle_id=$2) ORDER BY created_at DESC", owner, r.URL.Query().Get("bundleId"))
	if e != nil {
		fail(w, 503, "conversations unavailable")
		return
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var cid, bid string
		var at time.Time
		if rows.Scan(&cid, &bid, &at) != nil {
			fail(w, 503, "conversations unavailable")
			return
		}
		out = append(out, map[string]any{"id": cid, "bundleId": bid, "createdAt": at})
	}
	if rows.Err() != nil {
		fail(w, 503, "conversations unavailable")
		return
	}
	send(w, 200, out)
}
func (a *app) conversation(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	a.markLost(r.Context())
	var bid string
	if a.db.QueryRow(r.Context(), "SELECT bundle_id FROM ew_conversations WHERE id=$1 AND account_id=$2", r.PathValue("id"), owner).Scan(&bid) != nil {
		fail(w, 404, "conversation not found")
		return
	}
	rows, e := a.db.Query(r.Context(), "SELECT id,question,state,message_sequence,request_id,reason,context_sha256 FROM ew_tasks WHERE conversation_id=$1 AND account_id=$2 ORDER BY message_sequence", r.PathValue("id"), owner)
	if e != nil {
		fail(w, 503, "history unavailable")
		return
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var tid, q, st, req string
		var seq int64
		var reason, h *string
		if rows.Scan(&tid, &q, &st, &seq, &req, &reason, &h) != nil {
			fail(w, 503, "history unavailable")
			return
		}
		out = append(out, map[string]any{"id": tid, "question": q, "state": st, "sequence": seq, "requestId": req, "reason": reason, "contextSHA256": h})
	}
	if rows.Err() != nil {
		fail(w, 503, "history unavailable")
		return
	}
	send(w, 200, map[string]any{"id": r.PathValue("id"), "bundleId": bid, "messages": out})
}
func (a *app) appendQuestion(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in struct {
		Question  string `json:"question"`
		RequestID string `json:"requestId"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	if len(in.Question) < 1 || len(in.Question) > 4000 || len(in.RequestID) < 1 || len(in.RequestID) > 128 {
		fail(w, 400, "question 1–4000 bytes; requestId 1–128 bytes")
		return
	}
	tx, e := a.db.Begin(r.Context())
	if e != nil {
		fail(w, 503, "submission unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var bid string
	var seq int64
	if tx.QueryRow(r.Context(), "SELECT bundle_id,next_sequence FROM ew_conversations WHERE id=$1 AND account_id=$2 FOR UPDATE", r.PathValue("id"), owner).Scan(&bid, &seq) != nil {
		fail(w, 404, "conversation not found")
		return
	}
	var tid, q, st string
	var oldSeq int64
	e = tx.QueryRow(r.Context(), "SELECT id,question,state,message_sequence FROM ew_tasks WHERE account_id=$1 AND conversation_id=$2 AND request_id=$3", owner, r.PathValue("id"), in.RequestID).Scan(&tid, &q, &st, &oldSeq)
	if e == nil {
		if q != in.Question {
			fail(w, 409, "requestId already bound to different question")
			return
		}
		send(w, 200, map[string]any{"id": tid, "sequence": oldSeq, "state": st})
		return
	}
	if !errors.Is(e, pgx.ErrNoRows) {
		fail(w, 503, "submission unavailable")
		return
	}
	tid = id()
	_, e = tx.Exec(r.Context(), "INSERT INTO ew_tasks(id,bundle_id,account_id,question,state,conversation_id,message_sequence,request_id) VALUES($1,$2,$3,$4,'queued',$5,$6,$7)", tid, bid, owner, in.Question, r.PathValue("id"), seq, in.RequestID)
	if e == nil {
		_, e = tx.Exec(r.Context(), "UPDATE ew_conversations SET next_sequence=next_sequence+1 WHERE id=$1", r.PathValue("id"))
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 503, "submission unavailable")
		return
	}
	send(w, 201, map[string]any{"id": tid, "sequence": seq, "state": "queued"})
}

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
	e = tx.QueryRow(ctx, `SELECT t.id,t.bundle_id,t.question,t.conversation_id,t.message_sequence FROM ew_tasks t WHERE t.active_branch AND t.state='queued' AND NOT EXISTS(SELECT 1 FROM ew_tasks p WHERE p.active_branch AND p.conversation_id=t.conversation_id AND p.message_sequence<t.message_sequence AND (p.state<>'completed' OR NOT p.cleanup_confirmed OR p.result IS NULL)) ORDER BY t.created_at,t.id LIMIT 1 FOR UPDATE OF t`).Scan(&tid, &bid, &q, &cid, &seq)
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
			t.ResultSHA = hash(raw)
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
	_, e = tx.Exec(ctx, "UPDATE ew_tasks SET state='running',worker_id=$2,started_at=now(),context_text=$3,context_sha256=$4 WHERE id=$1", tid, wid, string(raw), hash(raw))
	if e == nil {
		e = tx.Commit(ctx)
	}
	err = e
	return
}
