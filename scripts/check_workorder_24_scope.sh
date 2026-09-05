#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
accepted_base="c4796f7da173f1717d5c9adb07a9d2e13cc1cf8b"

git -C "$repo_root" cat-file -e "$accepted_base^{commit}"

protected_paths=(
  docs/evidence
  wiki
  workspace_agent_harness
)

for protected_path in "${protected_paths[@]}"; do
  if ! git -C "$repo_root" diff --quiet "$accepted_base" -- "$protected_path"; then
    echo "WorkOrder #24 modified protected historical path: $protected_path" >&2
    git -C "$repo_root" diff --name-only "$accepted_base" -- "$protected_path" >&2
    exit 1
  fi
done

echo "PASS: WorkOrder #24 protected historical paths match accepted base $accepted_base"
