package startup

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"pan-agent/evidence-web/internal/bundles"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/database"
	"pan-agent/evidence-web/internal/executor"
	"pan-agent/evidence-web/internal/httpapi"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/querylog"
	"pan-agent/evidence-web/internal/tasks"
	"pan-agent/evidence-web/internal/taskview"
	"pan-agent/evidence-web/internal/worker"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Run(args []string, get func(string) string) error {
	c, e := config.Parse(args, get)
	if e != nil {
		return e
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	pc, e := pgxpool.ParseConfig(c.DSN)
	if e != nil {
		return errors.New("DATABASE_URL configuration invalid")
	}
	pc.MaxConns = 4
	if c.Command == "" {
		pc.MaxConns = 8
	}
	pc.ConnConfig.Tracer = querylog.QueryTracer{}
	db, e := pgxpool.NewWithConfig(ctx, pc)
	if e != nil {
		return errors.New("database configuration invalid")
	}
	defer db.Close()
	ping, stop := context.WithTimeout(ctx, 10*time.Second)
	e = db.Ping(ping)
	stop()
	if e != nil {
		return errors.New("database unavailable")
	}
	if e = database.Migrate(ctx, db); e != nil {
		return e
	}
	ids := identity.New(db)
	if c.Command == "account" {
		if e = ids.Invite(ctx, c.Email, c.Password); e != nil {
			return e
		}
		fmt.Println("invited account created")
		return nil
	}
	process := &executor.Process{Config: c.Execution}
	commands := tasks.New(db, process)
	if c.Command == "worker" {
		return worker.Run(ctx, c, commands, executor.New(c.Execution, commands).Execute)
	}
	// API supervision owns maintenance, including periods with zero Workers/queries.
	maintenanceDone := make(chan struct{})
	go func() { defer close(maintenanceDone); (worker.Coordinator{Store: commands, Config: c}).Run(ctx) }()
	defer func() { cancel(); <-maintenanceDone }()
	handler := httpapi.New(c, ids, commands, taskview.New(db), bundles.New(db))
	server := &http.Server{Addr: c.Address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 16}
	go func() {
		<-ctx.Done()
		bounded, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		server.Shutdown(bounded)
	}()
	log.Print("evidence-web listening on ", c.Address)
	e = server.ListenAndServe()
	if errors.Is(e, http.ErrServerClosed) {
		return nil
	}
	return errors.New("HTTP listener failed")
}
