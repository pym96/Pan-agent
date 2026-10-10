package taskview

import (
	"context"
	"pan-agent/evidence-web/internal/result"
	"time"
)

func (a *Reader) BundleList(ctx context.Context, owner string) result.Value {
	rows, e := a.db.Query(ctx, "SELECT id,title,created_at FROM ew_bundles WHERE account_id=$1 ORDER BY created_at DESC", owner)
	if e != nil {
		return result.Fail(result.Unavailable, "无法读取列表")
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var id, title string
		var created time.Time
		if e = rows.Scan(&id, &title, &created); e != nil {
			return result.Fail(result.Unavailable, "无法读取列表")
		}
		out = append(out, map[string]any{"id": id, "title": title, "createdAt": created})
	}
	if rows.Err() != nil {
		return result.Fail(result.Unavailable, "无法读取列表")
	}
	return result.OK(result.Success, out)
}
