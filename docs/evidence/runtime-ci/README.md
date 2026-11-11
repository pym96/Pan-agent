# Runtime CI evidence — WorkOrder #154

Candidate automation is described in [the local entry guide](../../../scripts/runtime-ci/README.md). Raw runs and negative probes belong outside the checkout, bound by SHA in the Handoff. They are not project-fact or benchmark-result promotion.

The gate combines existing TypeScript tests, byte-verified installed CLI lifecycle tests and the offline consumer walkthrough. It does not execute Docker sandbox tests, live-model evaluation, or production load tests. GitHub artifact `source_sha` identifies the tested PR head; `event_sha` may identify GitHub's synthetic merge commit instead.

## Preparation observation (2026-11-07)

At implementation commit `a29f2c4854732db998a7aca3eea88702ca407666`, the first full TypeScript invocation under the host's non-ASCII checkout path returned 247 passes and 15 failures. Existing fixtures used URL `.pathname` as a filesystem path, leaving percent-encoded directory names in RUNBOOK lookup. An exact committed-source ASCII worktree then passed all 262 TypeScript cases, all 16 installed lifecycle cases and the offline walkthrough. The original failing output is retained outside Git; no TypeScript test or Runtime bytes were changed. This is a test-path portability limitation, not a repaired product defect or a model result. Subsequent final-SHA CI and independent review remain required.

Actual Linux CI1/CI2 failed with 19 failures per Node job: 17 hardcoded macOS temporary-directory fixture failures, one historical-facts lookup and one historical module-layout archive failure from shallow checkout (the latter prevented three additional cases from registering). SC-CI-LINUX-02 permits only portable fixture-root construction and full-history checkout, preserving assertions and Runtime bytes. Both original runs/artifacts remain evidence; a successful local macOS run did not establish Linux compatibility.

CI3 reached all262 TypeScript cases but failed two filesystem premises (260pass/2fail on both Node versions). Prospective CI1.1 / SC-CI-FS-03 keeps missing-anchor denial explicit before materializing the ordinary-control fixture's anchors. Unicode alias checks now record actual existence and device/inode: observed native aliases must retain identity and denied reads; absent paths must remain absent after denied reads. No links are manufactured, no platform name predicts behavior, and no test is skipped. Actual local native-fold evidence and Linux absent-path evidence are separate; neither substitutes for the other. Runtime authorization policy remains unchanged.

## Post-integration observation and CI1.2

After PR155 merged the accepted candidate, main workflow42338396065 passed Node22 but failed Node26 at the shared C-FILE-02 rejection assertion. The raw output did not identify which mutation mode failed; independent local diagnosis did not reproduce it. Timestamp collision is only a hypothesis. The old acceptance and contrary main-run evidence are both retained.

The bounded CI1.2 repair records each oversize/growth/change/replace/cancel mode and its read counters. The same-size change fixture writes WXYZ, explicitly sets mtime10seconds beyond observed initial mtime via `utimes`, and asserts unchanged device/inode/size plus changed mtime before capture continues. Typed rejection, bounded reads, replacement/cancellation and cleanup checks remain. This verifies metadata-observable mutation detection; it does not prove every concurrent host mutation is detectable or establish the original failure's cause. Runtime and package bytes remain unchanged.

Independent negative review rejected the first CI1.2 fixture repair: a deliberately impossible assertion inside the mocked read was converted by the SUT's catch boundary into a generic AttachmentError, which a broad rejection helper accepted. The corrected fixture only records metadata inside the callback; the test asserts it outside that exception boundary and requires `attachment_changed_during_capture` for same-size change. Impossible-premise and wrong-code negatives must fail. This newly diagnosed test-oracle flaw is separate from the original main failure, whose exact cause remains unknown.

## #157 portable-checkout candidate

[PATH1.0](https://github.com/pym96/Pan-agent/issues/157) addresses three Kimi RUNBOOK fixture conversions from file URLs to OS paths. The seven-case regression executes the original fixtures and Runtime bytes, and CI uses a combined-special-character checkout. Raw red/green evidence, command records, source/package hashes and the complete SHA are bound in the issue Handoff; this index does not declare acceptance. The #154 records above are preserved, including unrelated unresolved failures. No new runtime, security or benchmark claim follows.
