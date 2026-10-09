package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

func (a *app) submitTask(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in struct {
		Question string `json:"question"`
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(&in) != nil || len(in.Question) < 1 || len(in.Question) > 4000 {
		fail(w, 400, "question required (1–4000 bytes)")
		return
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		fail(w, 400, "invalid JSON")
		return
	}
	tid := id()
	tag, e := a.db.Exec(r.Context(), "INSERT INTO ew_tasks(id,bundle_id,account_id,question,state) SELECT $1,id,account_id,$2,'queued' FROM ew_bundles WHERE id=$3 AND account_id=$4", tid, in.Question, r.PathValue("id"), owner)
	if e != nil {
		fail(w, 503, "任务未创建")
		return
	}
	if tag.RowsAffected() != 1 {
		fail(w, 404, "证据包不存在")
		return
	}
	send(w, 201, map[string]string{"id": tid, "state": "queued", "mode": "offline-faux"})
}
func (a *app) markLost(ctx context.Context) {
	_, _ = a.db.Exec(ctx, "UPDATE ew_tasks SET state='interrupted',reason='worker_heartbeat_lost; stop not yet confirmed',finished_at=now() WHERE state='running' AND NOT EXISTS (SELECT 1 FROM ew_worker_lease WHERE singleton=107 AND worker_id=ew_tasks.worker_id AND heartbeat>now()-interval '10 seconds')")
}
func (a *app) taskList(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	a.markLost(r.Context())
	var ok bool
	if a.db.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM ew_bundles WHERE id=$1 AND account_id=$2)", r.PathValue("id"), owner).Scan(&ok) != nil || !ok {
		fail(w, 404, "证据包不存在")
		return
	}
	rows, e := a.db.Query(r.Context(), "SELECT id,question,state,created_at FROM ew_tasks WHERE bundle_id=$1 AND account_id=$2 ORDER BY created_at DESC", r.PathValue("id"), owner)
	if e != nil {
		fail(w, 503, "无法读取任务")
		return
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var tid, q, s string
		var t time.Time
		if rows.Scan(&tid, &q, &s, &t) != nil {
			fail(w, 503, "无法读取任务")
			return
		}
		out = append(out, map[string]any{"id": tid, "question": q, "state": s, "createdAt": t})
	}
	send(w, 200, out)
}
func (a *app) task(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	a.markLost(r.Context())
	var q, state, bid string
	var result json.RawMessage
	var reason *string
	var cleanup bool
	var contextText, contextHash, conversationID *string
	var sequence *int64
	var startedAt, finishedAt *time.Time
	e := a.db.QueryRow(r.Context(), "SELECT question,state,bundle_id,result,reason,cleanup_confirmed,context_text,context_sha256,conversation_id,message_sequence,started_at,finished_at FROM ew_tasks WHERE id=$1 AND account_id=$2", r.PathValue("id"), owner).Scan(&q, &state, &bid, &result, &reason, &cleanup, &contextText, &contextHash, &conversationID, &sequence, &startedAt, &finishedAt)
	if e != nil {
		fail(w, 404, "任务不存在")
		return
	}
	events := []json.RawMessage{}
	rows, e := a.db.Query(r.Context(), "SELECT event FROM ew_task_events WHERE task_id=$1 ORDER BY sequence", r.PathValue("id"))
	if e != nil {
		fail(w, 503, "无法读取事件")
		return
	}
	for rows.Next() {
		var b json.RawMessage
		if rows.Scan(&b) != nil {
			rows.Close()
			fail(w, 503, "无法读取事件")
			return
		}
		events = append(events, b)
	}
	rows.Close()
	send(w, 200, map[string]any{"id": r.PathValue("id"), "question": q, "state": state, "bundleId": bid, "result": result, "reason": reason, "cleanupConfirmed": cleanup, "events": events, "mode": "offline-faux", "startedAt": startedAt, "finishedAt": finishedAt, "contextText": contextText, "contextSHA256": contextHash, "conversationId": conversationID, "sequence": sequence, "notice": "确定性 Faux 经真实 Native Pan/Docker；不验证自然语言理解或真实模型质量"})
}
func (a *app) taskFile(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var content []byte
	var h string
	name := r.PathValue("name")
	e := a.db.QueryRow(r.Context(), "SELECT f.content,f.sha256 FROM ew_task_artifacts f JOIN ew_tasks t ON f.task_id=t.id WHERE t.id=$1 AND t.account_id=$2 AND f.name=$3", r.PathValue("id"), owner, name).Scan(&content, &h)
	if e != nil {
		fail(w, 404, "产物不存在")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	w.Header().Set("X-Content-SHA256", h)
	_, _ = w.Write(content)
}
