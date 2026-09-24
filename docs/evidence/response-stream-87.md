# WO87 Builder evidence — Criteria1.0

Base `fe0b23416606a7e7dffc9a9cf22ffe8592681cba`; candidate `workorder/87-candidate`. [Contract](https://github.com/pym96/Pan-agent/issues/87#issuecomment-5806602555), [design](../design/response-stream-87.md), [machine summary](response-stream-87-summary.json). Full candidate SHA is bound by the issue Handoff, not self-embedded in its commit. Independent acceptance is pending.

## Change and observations

Only policy, the Session response-cap predicate and the unsigned metered template change execution behavior. Explicit signed null removes cumulative byte rejection in metered mode. Old positive numeric permits retain their exact values and rejection behavior; bounded-mode null and omitted/invalid/tampered permits reject. The actual CLI authorization/identity/ledger route is tested with injected synthetic I/O and the real installed Product parser/Session. No real Provider, task, verifier or container was invoked.

C-RESP87-01: exact 524288, 524289, 525319, 527533 and 2097152-byte legal SSE streams, split at 4093 and 65536 bytes, complete parsing, execute exactly one tool and continue to a second model response. Padding is legal SSE framing, not a fake parser. A separate >570000-byte semantic Chinese-content response is parsed and archived through the installed Product; split UTF-8 is covered. Signed old metered and bounded caps reject >524288; CLI negative controls prevent all injected effects for missing/tampered/bounded-null authorization.

C-RESP87-02: byte receipts exactly equal synthetic inputs; known input/output 10/5 and separate usage-tail 123456/321 remain exact. Missing usage, malformed envelope/JSON and partial failures remain unknown rather than zero. The ledger records reservations, local send entries, completions/failures and tools. Local send entries are not Provider receipts. Large transient partial recovery retains the failed exchange and unknown usage and runs the previously completed tool only once. Same input across chunkings has identical semantic counts. Canary/private padding does not appear in report diagnostics; existing public semantic archive output is intentionally retained, not a new raw-body log.

C-RESP87-03: synthetic continuous >512KiB streams, waiting iterators and recovery backoff all stop on user cancellation or virtual official Agent deadline. No subsequent model/tool admission; user cancellation does not grade, while confirmed deadline handoff retains the existing synthetic verifier path. No real grader runs. Dispatch timeout/recovery, authorization, old bounded counts, Session and handoff regressions remain covered.

## Reproducible checks and package identity

Working directory `/private/tmp/wo87-work`; TMPDIR `/private/tmp/wo87-artifacts/tmp`; npm cache `/private/tmp/wo87-artifacts/npm-cache`; Node v26.7.0 (not a new minimum-version proof).

- `regression.log`: 100 pass, 0 fail, 1 skip across test_85, test_cli, test_session, test_policy, test_handoff, test_broker, test_recovery, test_command_control and the first 23 WO87 cases. The skip is the superseded WO81 control stub, not a WO87 requirement.
- `response-corrected.log`: final 25 WO87 cases all pass, including two later usage-tail/recovery additions. Overlaps the previous run; totals must not be added as unique tests.
- `provider-regression.log`: 15 related source tests pass. Command used `node --experimental-strip-types --test --test-skip-pattern='C-K3-01 closed profiles' typescript/test/kimi-adapter.test.ts typescript/test/kimi-k3.test.ts`; the configuration wizard is outside this scope and excluded to avoid credential-management behavior. No claim of full Product suite execution.
- Exact installed controls: `TMPDIR=/private/tmp/wo87-artifacts/tmp PAN_TEST_ENTRY=/private/tmp/wo87-artifacts/consumer/node_modules/pan-agent/dist/index.js node --test scripts/harbor/pilot/test_response_stream_87.mjs scripts/harbor/pilot/test_cli.mjs`. Remaining regression filenames above can be supplied in the same command.

Product source/package bytes did not change, so rebuilding/relocking them would introduce unrelated identity churn. Fresh offline install used `/private/tmp/wo85-work/pack-final/pan-agent-0.1.0.tgz`, actual tar SHA256 `a469597067f30d0bb7655538aff2050f8c7f2f41bb6ba3c57fc2ea7aa2eacba4`. All 80 installed-file hashes equal unchanged package-identity.json. Its historical package SHA256 remains `ff1be95187d83b90b2485255541b7f66fde54f5a6fcf2d86fa4db1eef5c525c8`; this is not a claim that the two tar archives are byte-identical. `installation-identity.json` records both identities and source non-change. CLI runs this candidate's changed runner against that matching installed Product, never an old runner or fake parser.

Host feedback was reread and empty. Whole-host `run_acceptance.sh` passed feedback then BLOCKed on existing root extras `.DS_Store` and `潘佳祥——agent简历.pdf`; subsequent host stages did not run. No removal or waiver. Candidate changed-link/scope/whitespace checks are retained separately. Root SOURCE_OF_TRUTH is Master-owned and explicitly forbidden by this WorkOrder, so navigation is updated only in the three permitted READMEs; Master handles root navigation after review.

## Raw evidence and retained failures

Archive `/Volumes/WD_BLACK/pan-agent/wo87-response-stream-20260924/builder-evidence.tar.gz`, SHA256 `9b9cf0d8ca30511adc676d4479c5c5024e713aa6cdc57ec1cccd3ee537c4e5cf`.
Index `builder-evidence-index.json`, SHA256 `406276392363a43f40844a12afaa4acc2ef355fe99b05bacee827a548c66ddb7`; all 1419 files rehashed from the archive. Includes raw synthetic reports/archives/ledgers, first failures, installation identity and logs. Excludes npm cache and installed-package duplication. Original working artifacts remain in `/private/tmp/wo87-artifacts`.

First fixture run: 22/23 passed; the missing-field test tried signing JavaScript undefined before deleting the property. Corrected fixture construction, without changing policy. Later added usage-tail fixture: 24/25 passed; missing required `object` envelope correctly failed with `kimi_sse_envelope_invalid`. Corrected the fixture envelope without relaxing the parser. Both failed logs and reports remain. Final 25/25 is evidence for the corrected controls, not erasure of their development failures.

## Decision record and limits

#86 established two HTTP200 streams stopped at our own byte cap, with usage unknown. It did not establish Provider malfunction, token violation or expected task success. Human chose to remove this cap (HF-20260924-001); Master fixed scope; Builder implemented and tested the explicit signed-null path. Upstream task/Harbor logic is unchanged. The fixture failures reinforced that controls must first form valid signed/protocol inputs; production checks were not weakened to satisfy them.

No old run/ledger/report, main, manifest, official task, recovery-78-proposal, fact register, resume or Wiki changed. No new activation was signed. requestBytes=131072, max_tokens=4096, dispatchSeconds=120, official deadlines and resource protections remain (full boundary list in design). Large retained context can still encounter request-size limits; memory is not claimed bounded for arbitrary semantic content. No task-success improvement is measured and #86 results stay unchanged.

Independent Regulator must review the exact remote SHA and raw evidence, with additional signed-boundary negatives. C-RESP87-01 requires different-family review or, after independent technical pass, one SHA-bound H-RESP87-BOUNDARY Human material review. Builder does not self-accept or activate another campaign.
