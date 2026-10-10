package database

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"pan-agent/evidence-web/internal/evidence"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

func Migrate(ctx context.Context, db *pgxpool.Pool) error {
	migrationTx, e := db.Begin(ctx)
	if e != nil {
		return fmt.Errorf("migration transaction unavailable")
	}
	defer migrationTx.Rollback(ctx)
	if _, e = migrationTx.Exec(ctx, "SELECT pg_advisory_xact_lock(109000004)"); e != nil {
		return fmt.Errorf("migration lock unavailable")
	}
	if _, e = migrationTx.Exec(ctx, "CREATE TABLE IF NOT EXISTS ew_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())"); e != nil {
		return fmt.Errorf("migration ledger unavailable")
	}
	entries, _ := migrations.ReadDir("migrations")
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		sql, _ := migrations.ReadFile("migrations/" + entry.Name())
		var stored string
		e = migrationTx.QueryRow(ctx, "SELECT sha256 FROM ew_migrations WHERE name=$1", entry.Name()).Scan(&stored)
		if e == nil {
			if stored != evidence.Hash(sql) {
				return fmt.Errorf("migration identity changed")
			}
			continue
		}
		if entry.Name() == "007_ownership.sql" || entry.Name() == "008_owner_connection.sql" {
			var stopped bool
			if migrationTx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock($1)", 107010001).Scan(&stopped) != nil || !stopped {
				return errors.New("stop legacy workers before ownership migration")
			}
		}
		if _, e = migrationTx.Exec(ctx, string(sql)); e != nil {
			return fmt.Errorf("database migration failed: %s", entry.Name())
		}
		if _, e = migrationTx.Exec(ctx, "INSERT INTO ew_migrations(name,sha256) VALUES($1,$2)", entry.Name(), evidence.Hash(sql)); e != nil {
			return fmt.Errorf("migration receipt failed")
		}
	}
	if e = migrationTx.Commit(ctx); e != nil {
		return fmt.Errorf("migration commit failed")
	}

	return nil
}
