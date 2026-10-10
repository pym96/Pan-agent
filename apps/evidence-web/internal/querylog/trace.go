package querylog

import (
	"context"
	"errors"
	"sync/atomic"

	"github.com/jackc/pgx/v5"
)

type queryClassKey struct{}

type QueryAudit struct {
	Class  string
	Count  atomic.Int64
	Failed atomic.Bool
}
type QueryTracer struct{}

func (QueryTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	if q, ok := ctx.Value(queryClassKey{}).(*QueryAudit); ok {
		q.Count.Add(1)
	}
	return ctx
}
func (QueryTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryEndData) {
	if q, ok := ctx.Value(queryClassKey{}).(*QueryAudit); ok && d.Err != nil && !errors.Is(d.Err, pgx.ErrNoRows) {
		q.Failed.Store(true)
	}
}
func Audited(ctx context.Context, name string) (context.Context, *QueryAudit) {
	q := &QueryAudit{Class: name}
	return context.WithValue(ctx, queryClassKey{}, q), q
}
