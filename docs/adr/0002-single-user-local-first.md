# ADR-0002: Use a single-user, local-first deployment boundary for v1

- Status: Accepted
- Date: 2026-08-11

## Context

The primary user has a local workstation and online model access. Multi-user platform work would consume time without improving the Local Workspace Agent evidence.

## Decision

v1 serves one user on isolated local fixture workspaces. The code is intended for public source release and self-deployment, but v1 does not implement accounts, teams, tenant isolation, a public task market, or hosted SaaS.

## Consequences

The project can focus on the loop, isolation, evaluation, recovery, and audit trail. Remote collaboration and turnkey hosted deployment remain outside v1.
