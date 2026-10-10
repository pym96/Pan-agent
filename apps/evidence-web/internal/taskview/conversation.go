package taskview

import (
	"context"
	"pan-agent/evidence-web/internal/result"
)

func (a *Reader) Conversation(ctx context.Context, owner string, key string) result.Value {
	var bid string
	if a.db.QueryRow(ctx, "SELECT bundle_id FROM ew_conversations WHERE id=$1 AND account_id=$2", key, owner).Scan(&bid) != nil {
		return result.Fail(result.Missing, "conversation not found")
	}
	rows, e := a.db.Query(ctx, "SELECT id,question,state,message_sequence,request_id,reason,context_sha256 FROM ew_tasks WHERE conversation_id=$1 AND account_id=$2 ORDER BY message_sequence", key, owner)
	if e != nil {
		return result.Fail(result.Unavailable, "history unavailable")
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var tid, q, st, req string
		var seq int64
		var reason, h *string
		if rows.Scan(&tid, &q, &st, &seq, &req, &reason, &h) != nil {
			return result.Fail(result.Unavailable, "history unavailable")
		}
		out = append(out, map[string]any{"id": tid, "question": q, "state": st, "sequence": seq, "requestId": req, "reason": reason, "contextSHA256": h})
	}
	if rows.Err() != nil {
		return result.Fail(result.Unavailable, "history unavailable")
	}
	return result.OK(result.Success, map[string]any{"id": key, "bundleId": bid, "messages": out})
}
