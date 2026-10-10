package taskview

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/result"
)

func (a *Reader) TaskFile(ctx context.Context, owner string, key, filename string) result.Value {
	var content []byte
	var h string
	name := filename
	e := a.db.QueryRow(ctx, "SELECT f.content,f.sha256 FROM ew_task_artifacts f JOIN ew_tasks t ON f.task_id=t.id WHERE t.id=$1 AND t.account_id=$2 AND f.name=$3", key, owner, name).Scan(&content, &h)
	if e != nil {
		// An unconfirmed-stop attempt may already have a validated final envelope.
		// After stop-only recovery, serve its retained bytes without reopening its archive.
		var raw []byte
		if name != "details.csv" && name != "analysis.json" {
			return result.Fail(result.Missing, "产物不存在")
		}
		if a.db.QueryRow(ctx, "SELECT attempt_result FROM ew_tasks WHERE id=$1 AND account_id=$2 AND cleanup_confirmed", key, owner).Scan(&raw) != nil {
			return result.Fail(result.Missing, "产物不存在")
		}
		var reply result.ExecutionReply
		if json.Unmarshal(raw, &reply) != nil {
			return result.Fail(result.Missing, "产物不存在")
		}
		artifact, ok := reply.Artifacts[name]
		if !ok {
			return result.Fail(result.Missing, "产物不存在")
		}
		content, e = base64.StdEncoding.DecodeString(artifact.Base64)
		h = artifact.SHA
		if e != nil || len(content) > 2<<20 || evidence.Hash(content) != h {
			return result.Fail(result.Missing, "产物不存在")
		}
	}

	return result.OK(result.Success, result.File{Name: name, SHA: h, Content: content})
}
