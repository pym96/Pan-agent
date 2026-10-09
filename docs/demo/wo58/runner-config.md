# Criteria2.1 — explicit independent demo configuration

This is the offline candidate interface, not authorization to use it in production. Independent acceptance and Master integration must precede production preparation; a new Master-signed activation is required before run. The existing #103 package is reused, not rebuilt. The old Stage A sample stays unchanged.

## Contract

`full-cli.mjs init --campaign CAMPAIGN --entry ENTRY --demo-config CONFIG.json` selects the new mode. Omitting --demo-config retains the old behavior. Schema3 persists the normalized configuration both in campaign metadata and signed identity.demo58. Later commands read that persisted configuration; optionally supplying --demo-config again must exactly match it. Explicit null/incomplete configuration is rejected. Schema3 cannot silently fall back to wo75.

Production owner directory is a distinct child under `$STATE/wo58-video-20261009/campaigns/NAME`, where STATE is the existing user `.local/state/pan-agent`. Names are chosen once, not reused. Paths:

- campaignRoot = OWNER/campaign; outputRoot = CAMPAIGN/segments (the existing full-run output layout).
- authorityPath = OWNER/authority.json; ledgerRoot = OWNER/ledger. No implicit shared fallback. A public authority file must be supplied by Master before init; authorityHash is SHA256 of its exact bytes, including formatting. It is checked on every reopen and before signature authorization. No private signing key is read by the runner.
- mediaRoot = `/Volumes/WD_BLACK/pan-agent/wo58-video-20261009`; archiveRoot = MEDIA/task-archives/SHA256(CAMPAIGN_ABSOLUTE_UTF8). The path hash supplies an isolated deterministic namespace per campaign.
- layout.runner is the clean accepted runner checkout; layout.entry/Python/Harbor/taskRoot are verified installed/frozen dependencies. Product/runtime inputs may use the existing venv interpreter symlink to retain interpreter semantics. validateLayout resolves storage ownership; verifyProduct pins binary/package/Harbor bytes and Python imports/versions.
- Writable paths and owned root entries reject symlink components, including aliases swapped after init. Production archive storage must be on the external device. Existing receipt/snapshot paths are read-only reverified on reopen; identical bytes behind an alias do not satisfy storage identity.

JSON shape (placeholders, NOT a real proposal):

```json
{
  "version": 1,
  "campaignRoot": "<OWNER>/campaign",
  "authorityPath": "<OWNER>/authority.json",
  "authorityHash": "<SHA256 of Master public authority file>",
  "ledgerRoot": "<OWNER>/ledger",
  "outputRoot": "<OWNER>/campaign/segments",
  "mediaRoot": "/Volumes/WD_BLACK/pan-agent/wo58-video-20261009",
  "baselineDocker": 48503971840,
  "resourcePolicy": {"minFreeBytes": 21474836480, "incrementExclusiveBytes": 57982058496},
  "taskIds": ["log-summary-date-ranges"],
  "layout": {
    "version": 1,
    "runner": "<accepted clean runner>",
    "entry": "<installed #103 package>/dist/index.js",
    "python": "<frozen venv>/bin/python",
    "harborRoot": "<frozen venv>/lib/python3.12/site-packages/harbor",
    "taskRoot": "<frozen official tasks>",
    "archiveRoot": "<MEDIA>/task-archives/<SHA256 of CAMPAIGN path>",
    "ownedRoots": ["<user>/.local/state/pan-agent", "/opt/homebrew/Cellar/python@3.12/3.12.9", "<user>/Desktop/todo/面试/career-planning/60-项目/pan-agent/typescript/node_modules", "/Volumes/WD_BLACK/pan-agent/wo58-video-20261009"]
  }
}
```

The configuration must include each listed historical persistent root, even when currently absent; new dependency paths must also be covered. The existing sampleDurable always adds `/private/tmp/wo97-live`, `/private/tmp/wo97-runner-disk39`, `/private/tmp/wo74-work`, `/private/tmp/wo94-kimi` plus the existing state root. Inode-deduplicated allocated bytes remain cumulative. Baseline is not freshly sampled/reset. Init, prepare, status and run sampling enforce owned+max(0,Docker−48503971840)<57982058496 and free>=21474836480. The live sampling timer remains the existing full runner's timer. Status samples resource bytes without changing the journal checkpoint.

## Workflow after acceptance and separate preparation dispatch

Master provides the accepted runner/public authority identity. Builder constructs the config from actual paths, verifies dependencies/image/resources, then uses:

```sh
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" init --campaign "$CAMPAIGN" --entry "$ENTRY" --demo-config "$CONFIG"
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" prepare --campaign "$CAMPAIGN" --task log-summary-date-ranges --task-root "$TASK_ROOT"
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" status --campaign "$CAMPAIGN" --task log-summary-date-ranges
```

The actual proposedBinding then includes all demo config, original budget/policy, installed package/runner/manifest identity, task/image and checkpoint. Builder stops writes and hands that real binding to Master. No current offline fixture binding is signable for production. Only after Master signs that binding:

```sh
node "$RUNNER/scripts/harbor/pilot/full-cli.mjs" run --campaign "$CAMPAIGN" --activation "$ACTIVATION" --entry "$ENTRY" --task-root "$TASK_ROOT"
```

The existing task loop, runAttempt, broker, scorer, cancellation, confirmation and durable archive machinery serve both old and new modes. Fresh demo imports zero #97 consumption; its summary denominator is1 and explicitly separate from #97, while old campaigns retain89. Official tasks, policies, product code, model behavior and defaults are unchanged. Consumed activation IDs are never reused; failed attempts do not refund consumption.

## Offline tests

`WO58_TEST_ROOT=<issue-owned persistent fixture root> node --test scripts/harbor/pilot/test_demo_config_58.mjs` calls the real full-cli parser/controller/Store with explicitly injected fake host dependencies and ephemeral test Ed25519 keys. It never starts Docker or calls a Provider. Fake home is a dependency field; no production HOME rewrite occurs. Test artifacts and earlier failed tests are retained under the issue's work/evidence roots. Additional related regressions and exact invocation are listed in the Handoff. Do not use test signatures or bindings as production activation.
