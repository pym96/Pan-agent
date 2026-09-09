#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
node_bin="${OVERNIGHT_NODE:-node}"
[[ "${1:-}" =~ ^[0-9a-f]{40}$ ]] || { echo 'Full candidate SHA required'; exit 1; }
[[ "$(git -C "$root" rev-parse HEAD)" == "$1" ]] || { echo 'Candidate SHA mismatch'; exit 1; }
[[ -z "$(git -C "$root" status --porcelain)" ]] || { echo 'Clean candidate required'; exit 1; }
[[ "$($node_bin --version)" == 'v22.19.0' ]] || { echo 'Node 22.19.0 required'; exit 1; }
echo "SIMULATED connector demo; source $1; no Codex inference or account operation"
exec "$node_bin" --experimental-strip-types "$root/devtools/overnight/src/connector.ts" demo
