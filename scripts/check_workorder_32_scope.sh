#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
accepted_base="72de8e5866196d7a55d7d1cd8ce02c60d1cf8122"

git -C "$repo_root" cat-file -e "$accepted_base^{commit}"

protected_paths=(
  conformance/fixtures
  docs/adr
  docs/evidence
  tests
  wiki
  workspace_agent_harness
  typescript/package-lock.json
  typescript/src/canonical-protocol.ts
  typescript/src/model-adapter-contract.ts
  typescript/src/model-adapter.ts
  typescript/src/tools.ts
)

for protected_path in "${protected_paths[@]}"; do
  if ! git -C "$repo_root" diff --quiet "$accepted_base" -- "$protected_path"; then
    echo "WorkOrder #32 modified protected path: $protected_path" >&2
    git -C "$repo_root" diff --name-only "$accepted_base" -- "$protected_path" >&2
    exit 1
  fi
done

allowed_pattern='^(CONTEXT\.md|README\.md|docs/agents/current-assignment\.md|docs/design/(README|native-agent-kernel-v0|pan-owned-canonical-protocol|pan-faux-and-trusted-local-tools)\.md|scripts/(README\.md|check_workorder_32_scope\.sh)|typescript/README\.md|typescript/package\.json|typescript/src/(agent-tool|cli|faux-model-adapter|pan-trusted-local-tools|pi-compatibility|session)\.ts|typescript/src/kernels/(agent-kernel|native-kernel)\.ts|typescript/test/(cutover-contract|pan-contracts|pan-faux-tools)\.test\.ts)$'
changed_files="$({
  git -C "$repo_root" diff --name-only "$accepted_base"
  git -C "$repo_root" ls-files --others --exclude-standard
} | sort -u)"
while IFS= read -r changed_path; do
  [[ -z "$changed_path" ]] && continue
  if [[ ! "$changed_path" =~ $allowed_pattern ]]; then
    echo "WorkOrder #32 changed file outside its frozen allowlist: $changed_path" >&2
    exit 1
  fi
done <<< "$changed_files"

pan_modules=(
  typescript/src/faux-model-adapter.ts
  typescript/src/pan-trusted-local-tools.ts
)

if rg -n '@earendil-works/pi|PiModelAdapter|validatePi|NodeExecutionEnv|create(Read|Write|Edit|Bash)Tool|import\s*\([^)]*pi|require\s*\([^)]*pi' \
  "${pan_modules[@]/#/$repo_root/}"; then
  echo "Pan Faux/Tool modules contain a forbidden Pi import, alias, factory, validator, or delegation" >&2
  exit 1
fi

if rg -n 'node:https?|\bfetch\s*\(|process\.env|Date\.|randomUUID|Math\.random' \
  "$repo_root/typescript/src/faux-model-adapter.ts"; then
  echo "Pan Faux Adapter contains Provider/network/credential/clock/random behavior" >&2
  exit 1
fi

if ! rg -q 'createPanTrustedLocalTools\(workspace\)' "$repo_root/typescript/src/cli.ts"; then
  echo "Explicit Native composition does not construct Pan Tools directly" >&2
  exit 1
fi
if rg -q 'adaptPiAgentTools' "$repo_root/typescript/src/cli.ts"; then
  echo "Explicit Native composition still crosses the Pi Tool bridge" >&2
  exit 1
fi

git -C "$repo_root" diff --quiet "$accepted_base" -- typescript/package-lock.json
if git -C "$repo_root" diff "$accepted_base" -- typescript/package.json | rg '^[+-].*"(@earendil-works/pi-agent-core|@earendil-works/pi-ai)"'; then
  echo "WorkOrder #32 changed a Pi dependency declaration" >&2
  exit 1
fi

echo "PASS: WorkOrder #32 scope, protected bytes, Pan-only Faux/Tool graph, direct Native Tool composition, Provider Adapter, and Pi dependencies match Criteria 1.0"
