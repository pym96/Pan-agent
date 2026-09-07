#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
accepted_base="2ed4cee780e36f1e33845d66b9065381f775d6d2"

if ! command -v rg >/dev/null 2>&1; then
  echo "WorkOrder #33 scope check requires rg; refusing a vacuous scan" >&2
  exit 1
fi

git -C "$repo_root" cat-file -e "$accepted_base^{commit}"
cd "$repo_root"

protected_paths=(
  conformance/fixtures
  docs/adr
  docs/evidence
  tests
  wiki
  workspace_agent_harness
  typescript/package-lock.json
  typescript/RUNBOOK.md
  typescript/src/agent-tool.ts
  typescript/src/faux-model-adapter.ts
  typescript/src/kernels
  typescript/src/pan-trusted-local-tools.ts
  typescript/src/retrospective-ledger.ts
  typescript/src/run-archive.ts
  typescript/src/runbook.ts
  typescript/src/session.ts
  typescript/src/tools.ts
  typescript/src/tui.ts
)

for protected_path in "${protected_paths[@]}"; do
  if ! git -C "$repo_root" diff --quiet "$accepted_base" -- "$protected_path"; then
    echo "WorkOrder #33 modified protected Kernel/Tool/TUI/Archive/reference path: $protected_path" >&2
    git -C "$repo_root" diff --name-only "$accepted_base" -- "$protected_path" >&2
    exit 1
  fi
done

allowed_pattern='^(CONTEXT\.md|README\.md|docs/agents/current-assignment\.md|docs/design/(README|native-agent-kernel-v0|pan-owned-canonical-protocol|pan-deepseek-model-adapter|pan-faux-and-trusted-local-tools)\.md|scripts/(README\.md|check_workorder_33_scope\.sh)|typescript/README\.md|typescript/package\.json|typescript/src/(canonical-protocol|cli|deepseek-profile|deepseek-transport|model-adapter|pan-deepseek-model-adapter|pi-compatibility)\.ts|typescript/test/(cutover-contract|pan-deepseek-adapter)\.test\.ts|typescript/test/fixtures/pan-deepseek-v1/(empty-reasoning\.sse|failure-cases\.json|final\.sse|length\.sse|manifest\.json|multiple-tools\.sse|request-history\.expected\.json|single-tool\.sse))$'
changed_files="$({
  git -C "$repo_root" diff --name-only "$accepted_base"
  git -C "$repo_root" ls-files --others --exclude-standard
} | sort -u)"
while IFS= read -r changed_path; do
  [[ -z "$changed_path" ]] && continue
  if [[ ! "$changed_path" =~ $allowed_pattern ]]; then
    echo "WorkOrder #33 changed file outside its frozen allowlist: $changed_path" >&2
    exit 1
  fi
done <<< "$changed_files"

pan_provider_modules=(
  typescript/src/deepseek-profile.ts
  typescript/src/deepseek-transport.ts
  typescript/src/pan-deepseek-model-adapter.ts
)
if rg -ni '@earendil-works/pi|adaptPi|PiModel|validatePi|streamFn|openai|anthropic' \
  "${pan_provider_modules[@]/#/$repo_root/}"; then
  echo "Pan DeepSeek modules contain a forbidden Pi/SDK alias or delegation" >&2
  exit 1
fi

if ! rg -q 'createPanDeepSeekAdapter' "$repo_root/typescript/src/cli.ts"; then
  echo "Explicit Native composition does not construct the Pan DeepSeek Adapter" >&2
  exit 1
fi
if rg -q 'adaptPiModelAdapter' "$repo_root/typescript/src/cli.ts"; then
  echo "Explicit Native composition still imports or invokes the Pi model bridge" >&2
  exit 1
fi

git -C "$repo_root" diff --quiet "$accepted_base" -- typescript/package-lock.json
if git -C "$repo_root" diff "$accepted_base" -- typescript/package.json | rg '^[+-].*"(@earendil-works/pi-agent-core|@earendil-works/pi-ai)"'; then
  echo "WorkOrder #33 changed a Pi dependency declaration" >&2
  exit 1
fi

node --experimental-strip-types --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const fixtureRoot = join(root, "typescript/test/fixtures/pan-deepseek-v1");
const manifest = JSON.parse(await readFile(join(fixtureRoot, "manifest.json"), "utf8"));
for (const [name, expected] of Object.entries(manifest.files)) {
  const body = await readFile(join(fixtureRoot, name));
  assert.equal(createHash("sha256").update(body).digest("hex"), expected, name);
}
assert.deepEqual(
  [manifest.provider_calls, manifest.credential_reads, manifest.balance_queries, manifest.paid_or_formal_runs, manifest.cost_cny],
  [0, 0, 0, 0, 0],
);
NODE

echo "PASS: WorkOrder #33 scope, protected bytes, Pan-only Provider graph, direct Native composition, fixture hashes, dependencies, and rg guard match Criteria 1.0"
