#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
expected=${1:?usage: demo.sh FULL_CANDIDATE_SHA}
case "$expected" in *[!0-9a-f]*|'') echo 'Invalid SHA' >&2; exit 1;; esac
[ "${#expected}" -eq 40 ] || exit 1
[ "$(git -C "$repo" rev-parse HEAD)" = "$expected" ] || { echo 'Candidate identity mismatch' >&2; exit 1; }
[ -z "$(git -C "$repo" status --porcelain)" ] || { echo 'Candidate must be clean' >&2; exit 1; }
node_bin=${OVERNIGHT_NODE:-node}
[ "$("$node_bin" --version)" = 'v22.19.0' ] || { echo 'Requires Node 22.19.0' >&2; exit 1; }
printf 'SIMULATED offline demo; source %s; no real Agents/accounts\n' "$expected"
exec "$node_bin" --experimental-strip-types "$repo/devtools/overnight/src/cli.ts" demo
