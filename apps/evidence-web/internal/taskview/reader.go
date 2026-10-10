package taskview

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Reader has only a query capability: no transaction, Exec, or lifecycle operations.
type queryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}
type Reader struct{ db queryDB }

func New(db queryDB) *Reader { return &Reader{db: db} }
func (r *Reader) Allowed(ctx context.Context, owner, kind, id string) (bool, error) {
	table := "ew_tasks"
	if kind == "list" {
		table = "ew_bundles"
	}
	var ok bool
	e := r.db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+table+" WHERE id=$1 AND account_id=$2)", id, owner).Scan(&ok)
	return ok, e
}
