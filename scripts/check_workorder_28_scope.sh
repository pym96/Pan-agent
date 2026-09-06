#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
accepted_base="255da3c043bdddde28b5f94d549725edddee2ff6"

git -C "$repo_root" cat-file -e "$accepted_base^{commit}"

protected_paths=(
  conformance/fixtures/v1
  docs/evidence
  tests
  wiki
  workspace_agent_harness
)

for protected_path in "${protected_paths[@]}"; do
  if ! git -C "$repo_root" diff --quiet "$accepted_base" -- "$protected_path"; then
    echo "WorkOrder #28 modified protected path: $protected_path" >&2
    git -C "$repo_root" diff --name-only "$accepted_base" -- "$protected_path" >&2
    exit 1
  fi
done

echo "PASS: WorkOrder #28 protected paths match accepted base $accepted_base"
