package taskview

import (
	"context"
	"pan-agent/evidence-web/internal/result"
	"time"
)

func (a *Reader) Conversations(ctx context.Context, owner string, bundleFilter string) result.Value {
	rows, e := a.db.Query(ctx, "SELECT id,bundle_id,created_at FROM ew_conversations WHERE account_id=$1 AND ($2='' OR bundle_id=$2) ORDER BY created_at DESC", owner, bundleFilter)
	if e != nil {
		return result.Fail(result.Unavailable, "conversations unavailable")
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var cid, bid string
		var at time.Time
		if rows.Scan(&cid, &bid, &at) != nil {
			return result.Fail(result.Unavailable, "conversations unavailable")
		}
		out = append(out, map[string]any{"id": cid, "bundleId": bid, "createdAt": at})
	}
	if rows.Err() != nil {
		return result.Fail(result.Unavailable, "conversations unavailable")
	}
	return result.OK(result.Success, out)
}
