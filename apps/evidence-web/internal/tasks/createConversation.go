package tasks

import (
	"context"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/result"
)

func (a *Store) CreateConversation(ctx context.Context, owner string, in CreateConversationInput) result.Value {
	cid := identity.NewID()
	tag, e := a.db.Exec(ctx, "INSERT INTO ew_conversations(id,bundle_id,account_id) SELECT $1,id,account_id FROM ew_bundles WHERE id=$2 AND account_id=$3", cid, in.BundleID, owner)
	if e != nil {
		return result.Fail(result.Unavailable, "conversation unavailable")
	}
	if tag.RowsAffected() != 1 {
		return result.Fail(result.Missing, "bundle not found")
	}
	return result.OK(result.Created, map[string]string{"id": cid, "bundleId": in.BundleID})
}
