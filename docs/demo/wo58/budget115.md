# #115 Criteria1.0 Stage A — explicit 56 GiB demo profile

[Contract](https://github.com/pym96/Pan-agent/issues/115#issuecomment-6108658964).
Baseline `c327b74a5b3d496aff613d52645e63ef8f170bb0`. This is a Builder candidate,
not an activation or permission to start production preparation. Independent
acceptance and Master integration precede a separate prepare dispatch. Only a new
Master signature over the actual binding can authorize the subsequent single run.

## Policy and compatibility

`--demo-config` version **2** selects only the #115 policy: cumulative allocated
bytes strictly `<60129542144`, host free `>=21474836480`, fixed Docker baseline
`48503971840`. Version1 and all non-demo invocations remain54GiB. Arbitrary limits,
unknown versions, mismatched resourcePolicy and old54GiB signatures are rejected.
No persisted campaign is converted; all new profiles require a fresh owner.

The normalized config remains in metadata and signed `identity.demo58`.
`identity.executionPolicy.disk` and `binding.full.resourcePolicy` derive from the
same finite selector. Init, prepare, status, pre-run, timer and post-archive checks
use it. Explicit archive/recover also sample before and after. A runtime overrun
aborts through the existing controller, cleanup and evidence archive, then leaves
the segment paused; cleanup evidence is retained even when the budget is exceeded.
No replacement scheduler, scorer, provider or retry mechanism is introduced.

`demo115RequiredRoots(home)` retains the original state/Python/Node roots, the
#122 final external archive roots, Go/npm caches, actual PostgreSQL storage, and
Human-relocated #114 video. Nested roots are covered by their existing ancestor;
the unchanged sampler deduplicates device/inode and includes historical temporary
roots. PostgreSQL's read-only Homebrew alias resolves to its actual storage; the
normalized path is signed. A changed target requires a new matching configuration,
not a silent expense omission. Host free is sampled on the internal owner volume.
`node scripts/demo/wo58/resource115.mjs` provides an independent read-only sample.

Version2 production owner must be a direct `campaigns/wo115-*` child. Production
media root is `/Volumes/WD_BLACK/pan-agent/wo58-video-20261009/wo115-media`;
old media/authority/campaign paths remain intact. The old version1 root is unchanged.

## Read-only inventory and dependency locations

At Stage A inspection, the old `campaigns/demo-20261009-01` contains only
`authority.json` (hash `677c19ac4fd4747825c6258e4e6edf31a54fe8c782cffaba709798a694b9a206`).
It has no campaign, ledger, actual preparation or activation. That public authority
is bound to the old runner and cannot authorize #115. Other old test roots and
replay/media are historical offline fixtures; their original acceptance is reused.
The inventory and unchanged-byte verification are in this stage's private evidence.

Fixed installed dependencies, verified read-only without a model/container:

- Pan entry: `/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria111/consumer/node_modules/pan-agent/dist/index.js`
- Package SHA256: `5ecd3b9b4da688f90dfee3cc651b4a2f755595587b6d7d7287383cab23c8e580`
- Python: `/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/venv/bin/python`
- Harbor: `/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/venv/lib/python3.12/site-packages/harbor`
- Frozen official task root: `/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/tasks`

Package installed bytes, Python, Harbor bytes/imports and frozen dependency versions
were checked. Official source/solution/scorer is unchanged; no hidden answer was
read. Docker image availability is for the later authorized preparation to verify;
Stage A does not claim readiness from an old image observation.

## Exact future preparation commands (not executed in Stage A)

After independent accepted and integration, Master supplies a new public authority
at the fresh owner below, bound to the accepted full candidate SHA. The accepted
clean candidate can serve as runner at its existing path; verify its HEAD and clean
status against the accepted Handoff before executing. Do not use old authority.

```sh
RUNNER=/Users/panyiming/.local/state/pan-agent/wo58-video-20261009/wo115-stage-a/candidate
OWNER=/Users/panyiming/.local/state/pan-agent/wo58-video-20261009/campaigns/wo115-demo-01
CAMPAIGN="$OWNER/campaign"
CONFIG=/Users/panyiming/.local/state/pan-agent/wo58-video-20261009/wo115-stage-a/demo-config.json
ENTRY=/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria111/consumer/node_modules/pan-agent/dist/index.js
TASK_ROOT=/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria15/tasks
```

Create config after the separate prepare dispatch, once the authority and external
media directory exist. All writes are new wo115 namespaces. This is a command
recipe, **not a production binding**:

```sh
node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {demo115RequiredRoots,DEMO_BASELINE} from '/Users/panyiming/.local/state/pan-agent/wo58-video-20261009/wo115-stage-a/candidate/scripts/harbor/pilot/full-demo-config-58.mjs';
import {DEMO115_DISK_POLICY} from '/Users/panyiming/.local/state/pan-agent/wo58-video-20261009/wo115-stage-a/candidate/scripts/harbor/pilot/full-host.mjs';
import {digest} from '/Users/panyiming/.local/state/pan-agent/wo58-video-20261009/wo115-stage-a/candidate/scripts/harbor/pilot/policy.mjs';
const base='/Users/panyiming/.local/state/pan-agent/wo58-video-20261009';
const owner=base+'/campaigns/wo115-demo-01',campaignRoot=owner+'/campaign';
const mediaRoot='/Volumes/WD_BLACK/pan-agent/wo58-video-20261009/wo115-media';
const frozen=JSON.parse(readFileSync('/Users/panyiming/.local/state/pan-agent/benchmark97-next/deploy-criteria111/layout.json'));
const config={version:2,campaignRoot,authorityPath:owner+'/authority.json',authorityHash:digest(readFileSync(owner+'/authority.json')),ledgerRoot:owner+'/ledger',outputRoot:campaignRoot+'/segments',mediaRoot,baselineDocker:DEMO_BASELINE,resourcePolicy:DEMO115_DISK_POLICY,taskIds:['log-summary-date-ranges'],layout:{...frozen,runner:base+'/wo115-stage-a/candidate',archiveRoot:mediaRoot+'/task-archives/'+digest(campaignRoot),ownedRoots:[...demo115RequiredRoots(homedir()),mediaRoot]}};
writeFileSync(base+'/wo115-stage-a/demo-config.json',JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
JS
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" init --campaign "$CAMPAIGN" --entry "$ENTRY" --demo-config "$CONFIG"
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" prepare --campaign "$CAMPAIGN" --task log-summary-date-ranges --task-root "$TASK_ROOT"
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" status --campaign "$CAMPAIGN" --task log-summary-date-ranges
```

After the actual complete proposedBinding, stop campaign writes and return it to
Master. Only after a new activation is issued at the agreed path (example below):

```sh
ACTIVATION="$OWNER/activation.json"
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" run --campaign "$CAMPAIGN" --activation "$ACTIVATION" --entry "$ENTRY" --task-root "$TASK_ROOT"
```

No model credential is needed or read by Stage A. The later run uses the existing
explicit controller credential mechanism. Failure/unscored remains an honest
outcome; no success-only rerun. Recording and same-run replay remain later stages,
following the original contract and once-only Human media review.
