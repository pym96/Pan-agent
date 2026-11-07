# Runtime CI evidence — WorkOrder #154

Candidate automation is described in [the local entry guide](../../../scripts/runtime-ci/README.md). Raw runs and negative probes belong outside the checkout, bound by SHA in the Handoff. They are not project-fact or benchmark-result promotion.

The gate combines existing TypeScript tests, byte-verified installed CLI lifecycle tests and the offline consumer walkthrough. It does not execute Docker sandbox tests, live-model evaluation, or production load tests. GitHub artifact `source_sha` identifies the tested PR head; `event_sha` may identify GitHub's synthetic merge commit instead.

## Preparation observation (2026-11-07)

At implementation commit `a29f2c4854732db998a7aca3eea88702ca407666`, the first full TypeScript invocation under the host's non-ASCII checkout path returned 247 passes and 15 failures. Existing fixtures used URL `.pathname` as a filesystem path, leaving percent-encoded directory names in RUNBOOK lookup. An exact committed-source ASCII worktree then passed all 262 TypeScript cases, all 16 installed lifecycle cases and the offline walkthrough. The original failing output is retained outside Git; no TypeScript test or Runtime bytes were changed. This is a test-path portability limitation, not a repaired product defect or a model result. Subsequent final-SHA CI and independent review remain required.

Actual Linux CI1/CI2 failed with 19 failures per Node job: 17 hardcoded macOS temporary-directory fixture failures, one historical-facts lookup and one historical module-layout archive failure from shallow checkout (the latter prevented three additional cases from registering). SC-CI-LINUX-02 permits only portable fixture-root construction and full-history checkout, preserving assertions and Runtime bytes. Both original runs/artifacts remain evidence; a successful local macOS run did not establish Linux compatibility.
