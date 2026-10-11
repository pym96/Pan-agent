# #115 Criteria1.0 Stage A — Builder evidence

Candidate baseline: `c327b74a5b3d496aff613d52645e63ef8f170bb0`.
[Contract](https://github.com/pym96/Pan-agent/issues/115#issuecomment-6108658964),
[machine summary](demo-video-115-summary.json), [interface and future commands](../demo/wo58/budget115.md).
This is the offline adaptation handoff, not an accepted Verdict or completed video.
Full candidate SHA is in the external Handoff and Draft PR to avoid self-reference.

## Change and verification

The problem is one budget spread across config, persisted identity, proposed binding
and execution checks. Version2 selects a finite56GiB policy in all of them; old
version1 and non-demo invocation retain54GiB. Signed execution policy and demo config
must agree. No live campaign or old identity is rewritten. Roots include inherited
archives/caches/relocated media; the existing sampler still counts device/inode once
and refuses unknown samples. Docker baseline remains48503971840, host floor20GiB.

- C-VID115-01: actual CLI with synthetic dependencies covers fresh init, binding,
  Ed25519 signature mismatch, unknown/malformed profiles, persisted tampering,
  old54 policy in each binding location, independent-process reopening above the
  old ceiling, archive and exact unchanged campaign bytes.
- C-VID115-02: deterministic old/new limit−1/equal/+1 and free-floor−1/equal/+1,
  invalid/missing/nonfinite values, Docker growth/drop, mandatory roots,
  overlapping roots/hardlink deduplication, and reopened refusal. Existing timer
  aborts an in-flight synthetic attempt on overflow, retaining consumed ledger,
  confirmed cleanup and archive. Growth after archive also pauses. Explicit
  recover/archive sample at entry and after writes. No new execution loop.
- C-VID115-03: related full-run, policy, selection, handoff, Session, archive,
  resources and old demo regressions passed.143/143,0 failed/skipped. After adding
  the recovery closing sample,51/51 demo checks passed; these counts overlap.
  All real network/model/task/container dependencies are replaced by explicit
  offline host fixtures. Fake signing material never authorizes production.

Raw commands, sanitized environment, logs and exits are under
`/Users/panyiming/.local/state/pan-agent/wo58-video-20261009/wo115-stage-a/evidence`.
`product-identity.json` verifies installed #103 files plus Python/Harbor/imports and
frozen dependency versions. The original tar SHA256 is
`5ecd3b9b4da688f90dfee3cc651b4a2f755595587b6d7d7287383cab23c8e580`.
TypeScript, Web, package lock, official manifest/task/scorer, model, and old Evidence
are unchanged. No product rebuild or historical replay rerun was needed.

## Original preparation and resources

The old production owner has only its public authority; there is no campaign,
ledger, real preparation or binding. That authority remains bound to the old runner.
`old-preparation-inventory.json` records raw hashes before work;
`preserved-identity.json` verifies them unchanged and checks the accepted #58 repair
Verdict/archive/inventory plus the fixed product tar. Older fixture and replay
results remain explicitly offline; no production proposal is manufactured.

Before work: UTC2026-10-11T11:45:41.984Z, cumulative58058473472 bytes,
host free23457906688. During: UTC2026-10-11T11:48:53.548Z,
cumulative58074329088, free23428321280. Both pass the authorized56GiB/20GiB rules,
and exceed the old54GiB ceiling; they do not retrospectively change the old limit.
Closing snapshot UTC2026-10-11T11:55:16.769Z: cumulative58344013824 bytes, host free23397212160; passed. Raw snapshot hash is in the summary and Handoff. Timestamp samples do not prove continuous peak
usage or future recording capacity. No baseline reset, prune or evidence deletion.

## Corrections, judgment and limits

Builder initially extracted roots from quoted strings in the retained #122 sampler;
this also picked two absent output-path prefixes (`/evidence/gate-` and
`/evidence/resource-`), which contributed zero allocated bytes. The first observation
is retained, then replaced by an explicit root list derived from the actual roots.
Homebrew PostgreSQL storage was resolved before config normalization because its
`opt` entry is a symlink; writable roots retain strict alias rejection. An initial
read used the host navigation directory for repo-relative paths and returned missing
files; corrected cwd reads followed without any state change. During final evidence collection, an unrelated non-UTF8 process command caused
a strict decoder failure before writes. Replacement decoding plus selection of
only this stage’s Node processes completed the stop inventory; the collection
note and earlier resource snapshot remain. These were tooling corrections, not
failed real attempts or concealed budget failures.

Human chose the demonstration and56GiB budget; Builder implemented and tested this
small policy seam. Independent Regulator remains responsible for acceptance.
No claimed benchmark improvement, finished media or Human-independent implementation.

This stage made **zero real Provider/model/balance queries, zero task/scorer container
starts/pulls, zero production signatures/campaigns and no real credential reads**.
No Web services started. Main and all historical consumed records remain unchanged.
All CLI runs were offline fixtures. Old replay/capture acceptance is reused by hash.
After accepted/integrated, Master separately dispatches real preparation; then signs
the actual immutable binding before one demonstration. No new live run is authorized
by this Handoff; failure/unscored outcomes must remain visible in the later video.
