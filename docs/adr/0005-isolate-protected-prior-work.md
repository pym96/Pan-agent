# ADR-0005: Isolate Protected Prior Work from public workspace fixtures

- Status: Accepted
- Date: 2026-08-11

## Context

Unpublished or anonymously reviewed work can create confidentiality, anonymity, overlap, and evaluator-integrity risks if it enters a public workspace fixture.

## Decision

Protected Prior Work is not copied, read, summarized, modified, or evaluated by this repository. Workspace Tasks use independent fixtures and separately defined graders. Only general expertise already possessed by the user may inform their design.

## Consequences

Fixtures may take longer to bootstrap, but the Harness can be published without exposing or contaminating prior work.
