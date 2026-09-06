#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
accepted_base="895aa65654405cf7f96cf4ec31dbb5f1031b13e2"

git -C "$repo_root" cat-file -e "$accepted_base^{commit}"

protected_paths=(
  conformance/fixtures
  docs/adr
  docs/evidence
  tests
  wiki
  workspace_agent_harness
  typescript/package-lock.json
)

for protected_path in "${protected_paths[@]}"; do
  if ! git -C "$repo_root" diff --quiet "$accepted_base" -- "$protected_path"; then
    echo "WorkOrder #31 modified protected path: $protected_path" >&2
    git -C "$repo_root" diff --name-only "$accepted_base" -- "$protected_path" >&2
    exit 1
  fi
done

allowed_pattern='^(CONTEXT\.md|README\.md|docs/agents/current-assignment\.md|docs/design/README\.md|docs/design/pan-owned-canonical-protocol\.md|docs/design/native-agent-kernel-v0\.md|scripts/README\.md|scripts/check_workorder_31_scope\.sh|typescript/README\.md|typescript/package\.json|typescript/src/(agent-tool|canonical-protocol|model-adapter-contract|pi-compatibility|session|tui|cli)\.ts|typescript/src/kernels/(agent-kernel|native-kernel|pi-kernel)\.ts|typescript/test/(cutover-contract|general-agent|kernel-conformance|kernel-selection|native-kernel|pan-contracts)\.test\.ts)$'
changed_files="$(git -C "$repo_root" diff --name-only "$accepted_base")"
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  if [[ ! "$path" =~ $allowed_pattern ]]; then
    echo "WorkOrder #31 changed file outside its frozen allowlist: $path" >&2
    exit 1
  fi
done <<< "$changed_files"

pan_modules=(
  typescript/src/canonical-protocol.ts
  typescript/src/model-adapter-contract.ts
  typescript/src/agent-tool.ts
  typescript/src/kernels/native-kernel.ts
)

if rg -n '@earendil-works/pi|PiModelAdapter|validatePiToolCall|\.streamFn\b' \
  "${pan_modules[@]/#/$repo_root/}"; then
  echo "Pan contract/NativeKernel modules contain a forbidden Pi dependency or delegation" >&2
  exit 1
fi

git -C "$repo_root" diff --quiet "$accepted_base" -- typescript/package-lock.json
git -C "$repo_root" diff "$accepted_base" -- typescript/package.json | \
  grep -E '^[+-].*@earendil-works/pi' && {
    echo "WorkOrder #31 changed a Pi dependency" >&2
    exit 1
  } || true

echo "PASS: WorkOrder #31 scope, protected bytes, Pan seam imports, and Pi dependencies match the frozen contract"
