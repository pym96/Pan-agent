package taskview

import (
	"context"
	"pan-agent/evidence-web/internal/result"
	"time"
)

func (a *Reader) TaskList(ctx context.Context, owner string, key string, validated bool) result.Value {
	var ok bool
	if !validated {
		if a.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM ew_bundles WHERE id=$1 AND account_id=$2)", key, owner).Scan(&ok) != nil || !ok {
			return result.Fail(result.Missing, "证据包不存在")
		}
	}
	rows, e := a.db.Query(ctx, "SELECT id,question,state,created_at FROM ew_tasks WHERE bundle_id=$1 AND account_id=$2 ORDER BY created_at DESC", key, owner)
	if e != nil {
		return result.Fail(result.Unavailable, "无法读取任务")
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var tid, q, s string
		var t time.Time
		if rows.Scan(&tid, &q, &s, &t) != nil {
			return result.Fail(result.Unavailable, "无法读取任务")
		}
		out = append(out, map[string]any{"id": tid, "question": q, "state": s, "createdAt": t})
	}
	if rows.Err() != nil {
		return result.Fail(result.Unavailable, "无法读取任务")
	}
	return result.OK(result.Success, out)
}
