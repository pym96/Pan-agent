package taskview

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/result"
)

func (a *Reader) BundleDetail(ctx context.Context, owner string, key string) result.Value {
	var title, summary, parser string
	var overview json.RawMessage
	e := a.db.QueryRow(ctx, "SELECT title,summary_name,parser_version,overview FROM ew_bundles WHERE id=$1 AND account_id=$2", key, owner).Scan(&title, &summary, &parser, &overview)
	if e != nil {
		return result.Fail(result.Missing, "证据包不存在")
	}
	rows, e := a.db.Query(ctx, "SELECT name,sha256,octet_length(content) FROM ew_files WHERE bundle_id=$1 ORDER BY name", key)
	if e != nil {
		return result.Fail(result.Unavailable, "无法读取文件列表")
	}
	defer rows.Close()
	files := []any{}
	for rows.Next() {
		var name, h string
		var size int
		if e = rows.Scan(&name, &h, &size); e != nil {
			return result.Fail(result.Unavailable, "无法读取文件列表")
		}
		files = append(files, map[string]any{"name": name, "sha256": h, "bytes": size})
	}
	if rows.Err() != nil {
		return result.Fail(result.Unavailable, "无法读取文件列表")
	}
	return result.OK(result.Success, map[string]any{"id": key, "title": title, "summary": summary, "parser": parser, "overview": overview, "files": files})
}
