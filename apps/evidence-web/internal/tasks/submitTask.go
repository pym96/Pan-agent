package tasks

import (
	"context"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/result"
)

func (a *Store) SubmitTask(ctx context.Context, owner string, key string, in SubmitTaskInput) result.Value {
	if len(in.Question) < 1 || len(in.Question) > 4000 {
		return result.Fail(result.Invalid, "question required (1–4000 bytes)")
	}

	tid := identity.NewID()
	tag, e := a.db.Exec(ctx, "INSERT INTO ew_tasks(id,bundle_id,account_id,question,state) SELECT $1,id,account_id,$2,'queued' FROM ew_bundles WHERE id=$3 AND account_id=$4", tid, in.Question, key, owner)
	if e != nil {
		return result.Fail(result.Unavailable, "任务未创建")
	}
	if tag.RowsAffected() != 1 {
		return result.Fail(result.Missing, "证据包不存在")
	}
	return result.OK(result.Created, map[string]string{"id": tid, "state": "queued", "mode": "offline-faux"})
}
