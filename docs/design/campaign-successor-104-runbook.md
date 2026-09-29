# #104 successor deployment runbook (after acceptance and Master assignment only)

This procedure was **not executed against production** by #104. Use the full
accepted #104 Handoff SHA, never the moving branch name. Do not modify an old
runner, consumer, layout, campaign, ledger or activation. Do not resume #97 with
an old permit. A stopped source mismatch requires a new Master decision, not a new pin.

## Persistent isolated deployment

Run with the accepted SHA as `accepted_sha` (40 hex characters) and an unused
persistent deployment directory `deploy`. The following commands neither sign
nor run a task. Keep the old deployment and all evidence intact.

```sh
set -e
# Master supplies these two concrete values in the subsequent preparation order.
: "${accepted_sha:?full accepted #104 SHA required}"
: "${deploy:?unused absolute directory under ~/.local/state/pan-agent required}"
repo='/Users/panyiming/Desktop/todo/面试/career-planning/60-项目/pan-agent'
package='/Volumes/WD_BLACK/pan-agent/handoff-recovery-20260929/repair-source-settlement/pan-agent-0.1.0.tgz'
test ! -e "$deploy" || exit 1
mkdir -p "$deploy/consumer" "$deploy/reports" "$deploy/tmp"
git -C "$repo" worktree add --detach "$deploy/runner" "$accepted_sha"
git -C "$deploy/runner" status --porcelain
shasum -a 256 "$package"
# Must equal 5ecd3b9b4da688f90dfee3cc651b4a2f755595587b6d7d7287383cab23c8e580.
npm install --offline --ignore-scripts --no-audit --no-fund --cache "$deploy/npm-cache" --prefix "$deploy/consumer" "$package"
```

A suitable new internal root is
`/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-successor104-<unique stamp>`.
Do not use `/tmp`, copy an old worktree in place, upgrade Python/Harbor, pull images,
or read model credentials for preparation. If an offline installation fails, retain
its logs and diagnose the local package/cache; do not substitute a registry package.

Create a new existing archive root on the mounted external disk, for example
`/Volumes/WD_BLACK/pan-agent/wo97-full-live-20260925/persistent-successor104-<same stamp>/task-archives`.
Pass it as `archive_root` below; verify it is really on WD_BLACK before proceeding.

```sh
: "${archive_root:?new external archive namespace required}"
test ! -e "$archive_root" || exit 1
mkdir -p "$archive_root"
python3 - "$deploy" "$archive_root" <<'PY'
import json,sys
from pathlib import Path
r=Path(sys.argv[1]); old=Path('/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15')
x=json.loads((old/'layout.json').read_text())
x.update(runner=str(r/'runner'),entry=str(r/'consumer/node_modules/pan-agent/dist/index.js'),archiveRoot=sys.argv[2],ownedRoots=['/Users/panyiming/.local/state/pan-agent','/opt/homebrew/Cellar/python@3.12/3.12.9','/Users/panyiming/Desktop/todo/面试/career-planning/60-项目/pan-agent/typescript/node_modules'])
(r/'layout.json').write_text(json.dumps(x,indent=2)+'\n')
PY
```

The layout reuses frozen deploy-criteria15 Python/Harbor/tasks. Verification checks
installed product files, Python binary, Harbor files and dependency versions.
`sampleDurable` includes all Pan state and mandatory older temporary roots as well
as layout roots. Original Docker baseline stays48503971840; total owned plus
positive Docker delta must remain strictly below57982058496, with free>=21474836480.
Record before/after samples; no pruning or ledger reset is part of this runbook.

## Migrate, reconcile, prepare, propose; then stop

```sh
source_campaign='/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria17/campaign'
cli="$deploy/runner/scripts/harbor/pilot/full-cli.mjs"
node "$cli" successor97 --source "$source_campaign" --layout "$deploy/layout.json" --campaign "$deploy/campaign" > "$deploy/reports/migration.json"
node "$cli" recover --campaign "$deploy/campaign" > "$deploy/reports/recovery.json"
node "$cli" status --campaign "$deploy/campaign" > "$deploy/reports/status-before-prepare.json"
unstarted=$(python3 - "$deploy/reports/status-before-prepare.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]));print(','.join(r['task'] for r in s['rows'] if r['state']=='not_started'))
PY
)
node "$cli" prepare --campaign "$deploy/campaign" --task "$unstarted" --task-root '/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/tasks' > "$deploy/reports/prepared.json"
ready=$(python3 - "$deploy/reports/prepared.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]));print(','.join(r['task'] for r in s['rows'] if r['state']=='not_started' and r['preparations'] and r['preparations'][-1].get('ready') is True))
PY
)
node "$cli" status --campaign "$deploy/campaign" --task "$ready" > "$deploy/reports/proposed-binding.json"
```

Use fail-fast shell execution (`set -e`) or stop manually on every nonzero exit;
never execute later commands after a failed migration/recovery. Prepare only
inspects frozen sources, Docker capacity and cache, with no image pulls or task
containers. Present the complete proposedBinding, actual accepted runner SHA,
package hash, source/checkpoint provenance, resources,25 eligible IDs and2 missing
images (or explicit deviations) to Master. Preserve62 consumed and20unknown.
Copy preparation evidence to the new external evidence namespace and **stop campaign
writes** pending Master signature. No activation creation or run command belongs here.

## Failure handling

- Changed source fingerprint: record file differences; do not repin or edit source.
- Interrupted migration: preserve target; it has no valid completion marker and
  cannot bind. Start a new empty target/layout/archive namespace under the same budget.
- Existing valid target: use status/recover; never reimport over it.
- Failed archive before receipt: retain snapshots; recover may retry with a new
  snapshot, still requiring current stop checks. Committed receipt after a crash
  is verified before reconciliation is appended. Corruption is blocking, not replaced.
- Active/unknown residual, missing external volume, wrong package/dependency,
  resource breach, or changed task/image: stop and report the concrete condition.
  No automatic task rerun, model call, cleanup or permit reuse is authorized.
