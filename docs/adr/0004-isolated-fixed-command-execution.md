# ADR-0004: Separate a patch-producing agent from an Isolated Executor

- Status: Accepted
- Date: 2026-08-11

## Context

An eight-hour unattended agent with arbitrary host-shell access could leak credentials, mutate its evaluator, damage unrelated work, or make its own results impossible to trust.

## Decision

The agent produces Patch Proposals only for allowlisted workspace files. The Isolated Executor applies accepted proposals in temporary Git worktrees and invokes only predefined setup, test, and evaluation commands. The Protected Control Plane is outside the patch boundary. Out-of-policy actions terminate the Task Run as Policy Blocked.

## Consequences

The agent loses some exploratory freedom. In return, executions become safer, repeatable, attributable to exact code, and suitable for unattended operation.
