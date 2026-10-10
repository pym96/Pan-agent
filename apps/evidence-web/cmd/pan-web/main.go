package main

import (
	"log"
	"os"
	"pan-agent/evidence-web/internal/startup"
)

func main() {
	if e := startup.Run(os.Args[1:], os.Getenv); e != nil {
		log.Print(e)
		os.Exit(1)
	}
}
