# Runtime CI evidence — WorkOrder #154

Candidate automation is described in [the local entry guide](../../../scripts/runtime-ci/README.md). Raw runs and negative probes belong outside the checkout, bound by SHA in the Handoff. They are not project-fact or benchmark-result promotion.

The gate combines existing TypeScript tests, byte-verified installed CLI lifecycle tests and the offline consumer walkthrough. It does not execute Docker sandbox tests, live-model evaluation, or production load tests. GitHub artifact `source_sha` identifies the tested PR head; `event_sha` may identify GitHub's synthetic merge commit instead.
