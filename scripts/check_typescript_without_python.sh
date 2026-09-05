#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dependency_root="$repo_root/typescript/node_modules"

if [[ ! -d "$dependency_root" ]]; then
  echo "typescript/node_modules is required; run npm --prefix typescript ci --ignore-scripts first" >&2
  exit 1
fi

if ! git -C "$repo_root" diff --quiet HEAD -- || \
   ! git -C "$repo_root" diff --cached --quiet HEAD -- || \
   [[ -n "$(git -C "$repo_root" ls-files --others --exclude-standard)" ]]; then
  echo "check_typescript_without_python.sh requires committed, clean candidate bytes" >&2
  exit 1
fi

temporary_parent="$(mktemp -d "${TMPDIR:-/tmp}/pan-agent-typescript-only.XXXXXX")"
temporary_root="$temporary_parent/checkout"
cleanup() {
  if [[ -e "$temporary_root/.git" ]]; then
    git -C "$repo_root" worktree remove --force "$temporary_root"
  fi
  rm -rf -- "$temporary_parent"
}
trap cleanup EXIT

git -C "$repo_root" worktree add --detach "$temporary_root" HEAD >/dev/null
rm -rf -- "$temporary_root/workspace_agent_harness"
ln -s "$dependency_root" "$temporary_root/typescript/node_modules"

if rg -n "workspace_agent_harness|from .*\.py|import .*\.py" \
  "$temporary_root/typescript/src" \
  "$temporary_root/typescript/test/conformance.test.ts"; then
  echo "TypeScript product or conformance runner references the removed implementation package" >&2
  exit 1
fi

test ! -e "$temporary_root/workspace_agent_harness"
test -r "$temporary_root/docs/design/typescript-pi-general-agent-working-stack.md"
npm --prefix "$temporary_root/typescript" run check

echo "PASS: TypeScript product checks completed with workspace_agent_harness physically absent"
