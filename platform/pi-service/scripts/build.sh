#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p bin
# Use caller-selected user-space toolchain; no global installation.
go mod download
CGO_ENABLED=0 go build -trimpath -o bin/service ./cmd/service
CGO_ENABLED=0 go build -trimpath -o bin/load ./cmd/load
npm ci --prefix pi --ignore-scripts
