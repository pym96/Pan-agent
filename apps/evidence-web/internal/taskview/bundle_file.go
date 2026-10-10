package taskview

import (
	"context"
	"pan-agent/evidence-web/internal/result"
)

func (a *Reader) BundleFile(ctx context.Context, owner string, key, filename string) result.Value {
	var b []byte
	var h string
	name := filename
	e := a.db.QueryRow(ctx, "SELECT f.content,f.sha256 FROM ew_files f JOIN ew_bundles b ON b.id=f.bundle_id WHERE b.id=$1 AND b.account_id=$2 AND f.name=$3", key, owner, name).Scan(&b, &h)
	if e != nil {
		return result.Fail(result.Missing, "文件不存在")
	}
	return result.OK(result.Success, result.File{Name: name, SHA: h, Content: b})
}
