#!/bin/sh
# Server preparation under the spare 1CPU/1GiB slot; dependencies must already be cached.
set -eu
cd "$(dirname "$0")/.."
: "${GO_ROOT:?}" "${GO_CACHE_ROOT:?}"
mkdir -p bin "$GO_CACHE_ROOT/go-build" "$GO_CACHE_ROOT/gopath"
docker run --rm --name pan-pi-142-build --label pan.workorder=142 \
 --network none --cpus 1 --memory 1g \
 -v "$PWD:/source:ro" -v "$PWD/bin:/out" -v "$GO_ROOT:/go:ro" -v "$GO_CACHE_ROOT:/cache" \
 -e GOROOT=/go -e GOPATH=/cache/gopath -e GOCACHE=/cache/go-build -e GOTOOLCHAIN=local -e GOENV=off -e CGO_ENABLED=0 -e GOMAXPROCS=1 \
 -w /source --entrypoint /bin/sh \
 python@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 \
 -c '/go/bin/go build -p 1 -trimpath -o /out/service ./cmd/service && /go/bin/go build -p 1 -trimpath -o /out/load ./cmd/load'
