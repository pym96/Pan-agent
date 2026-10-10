package tasks

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Process interface {
	Stop(context.Context, int, string, string, string) error
	Reconcile(context.Context, string, []string, []byte) ([]byte, error)
}
type Store struct {
	db      *pgxpool.Pool
	process Process
}

func New(db *pgxpool.Pool, p Process) *Store { return &Store{db: db, process: p} }
