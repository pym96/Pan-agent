# #73 Criteria1.0 — partial Builder evidence and ScopeChallenge

Candidate branch: `workorder/73-candidate`. Accepted base: `3d42cc22df25a6d34cbc5bdc18edde47a1180119`. The final Handoff binds the full pushed SHA; this document makes no acceptance claim.

[SC-73-01](../design/benchmark-membership-resolution.md) identifies the frog/bird README identity, plotting task/scoring/inventory mismatch and safe-projection limitation. Dependent membership selection stopped. C-MEM-01/02 deliverables are incomplete; C-MEM-05 Human review has not occurred. This is not a finished structural subset and should not be accepted as one.

## Primary records

Retained evidence: `/Volumes/WD_BLACK/pan-agent/wo73-da-membership-20260921/`. `investigation.tar.gz` preserves the selected #72 inputs, 22 pinned source files, original network receipts, before-use projection tests, static-code projections, acquisition scripts and final local check records. Archive SHA256: `e8b4f8da3e31b2865779f9d7b046584cec1c41373d9562dd8c70ccf80d82810f` (106,944 bytes), also recorded in the adjacent checksum file. Raw sources may contain mixed prose; do not dump them into model context.

Original input archive: `/Volumes/WD_BLACK/pan-agent/wo72-benchmark-subset-20260921/raw-inputs.tar.gz`, SHA256 `010ff8f907e98bf923987377031a129812a7b7aa841e72c87f0b05e76cc8540b`. Only its locked tree and task all.jsonl were extracted; the task helper projects the 16 allowlisted IDs and instruction/post_process fields. No eval/gold archive members were extracted here.

[Provenance](../../scripts/benchmark-membership/source-provenance.json) records all 22 acquisitions with pinned paths, Git blobs and whole-file hashes. [Observations](../../scripts/benchmark-membership/observations.json) reconstructs all 16 instructions/inventories and restricted README concept labels. It does not establish absence of other possible providers.

## Checks and original failures

- Before raw use, eight synthetic projection tests passed; before closed-vocabulary use, nine passed. Final nine-test run passed. These tests do not prove universal semantic redaction.
- Offline reconstruction verifies original input hashes, untruncated pinned tree, and every acquired file against both Git blob and SHA256. Repeat output must exactly match committed observations.json.
- Initial sandbox DNS acquisition failed with zero response bytes; the authorized external network retry succeeded. The acquisition loop later stopped on absent `requirements.txt` in the pinned tree. No such file was fetched or fabricated. The 22 successful files were verified from cache and retained; this original failure remains documented.
- Cumulative source response body bytes: 71,466. Resource receipts preserve timing/free-space/allocation observations. No data/gold payload requests were made.
- Protected-byte/scope, whitespace and local links are checked for this partial candidate. Full host acceptance and candidate-bound isolated host acceptance were not run: dependent completion is stopped at ScopeChallenge. C-MEM-04 is not claimed complete. Unchanged Product/Reference suites were not repeated.

README source prose was withheld throughout this investigation. No accidental answer exposure was observed; this is not a universal answer-cleanliness or untouched-holdout claim. Historical exposure flags remain unchanged. No new project/resume facts are promoted. Host SOURCE_OF_TRUTH/navigation changes belong to Master, outside this write scope.
