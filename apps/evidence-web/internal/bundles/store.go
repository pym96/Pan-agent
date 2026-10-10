package bundles

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/result"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{db: db} }
func (s *Store) Import(ctx context.Context, owner string, manifest []byte, files map[string][]byte) result.Value {
	m, o, e := evidence.ParseBundle(manifest, files)
	if e != nil {
		return result.Fail(result.Invalid, e.Error())
	}
	overview, _ := json.Marshal(o)
	bundle := identity.NewID()
	tx, e := s.db.Begin(ctx)
	if e != nil {
		return result.Fail(result.Unavailable, "导入存储暂不可用")
	}
	defer tx.Rollback(ctx)
	_, e = tx.Exec(ctx, "INSERT INTO ew_bundles(id,account_id,title,summary_name,parser_version,overview) VALUES($1,$2,$3,$4,$5,$6)", bundle, owner, m.Title, m.Summary, evidence.ParserVersion, overview)
	if e == nil {
		files["manifest.json"] = manifest
		for name, data := range files {
			_, e = tx.Exec(ctx, "INSERT INTO ew_files(bundle_id,name,sha256,content) VALUES($1,$2,$3,$4)", bundle, name, evidence.Hash(data), data)
			if e != nil {
				break
			}
		}
	}
	if e != nil {
		return result.Fail(result.Unavailable, "导入未保存，请稍后再试")
	}
	if e = tx.Commit(ctx); e != nil {
		return result.Fail(result.Unavailable, "导入状态未确认，请检查列表")
	}
	return result.OK(result.Created, map[string]string{"id": bundle})
}
