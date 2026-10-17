package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"pan/pi-service/internal/api"
	"pan/pi-service/internal/executor"
	"pan/pi-service/internal/store"
	"sync"
	"syscall"
	"time"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	s, e := store.Open(ctx, os.Getenv("DATABASE_URL"))
	if e != nil {
		log.Fatal(e)
	}
	defer s.DB.Close()
	if e = s.Init(ctx); e != nil {
		log.Fatal(e)
	}
	lock, e := s.DB.Acquire(ctx)
	if e != nil {
		log.Fatal(e)
	}
	defer lock.Release()
	var owned bool
	if e = lock.QueryRow(ctx, "SELECT pg_try_advisory_lock(142001)").Scan(&owned); e != nil || !owned {
		log.Fatal("another control-plane instance owns this database")
	}
	if e = s.Recover(ctx); e != nil {
		log.Fatal(e)
	}
	hub := api.NewHub()
	a := &api.API{Store: s, Hub: hub}
	if os.Getenv("SSE_TAIL_CACHE") != "0" {
		a.Tail = api.NewTail(s.Events)
	}
	notify := func(session string) {
		if a.Tail != nil {
			a.Tail.Dirty(session)
		}
		hub.Notify(session)
	}
	p := &executor.Pool{Store: s, URL: os.Getenv("PI_URL"), Notify: notify}
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() { defer workers.Done(); p.Run(ctx) }()
	}
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
				err := lock.Conn().Ping(pingCtx)
				cancel()
				if err != nil {
					log.Print("singleton database lease connection lost; stopping")
					stop()
					return
				}
			}
		}
	}()
	server := &http.Server{Addr: ":8080", Handler: a.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8192}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 7*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}()
	log.Println("Pi service listening :8080; executor concurrency=2 queue=128 SSE=11000")
	if e = server.ListenAndServe(); e != nil && e != http.ErrServerClosed {
		log.Print(e)
	}
	stop()
	workers.Wait()
}
