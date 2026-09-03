# Runbook — current operating guidance

This file is the product Runbook: the current best operating instructions for
the General Agent working stack. It is intentionally mutable — edit, diff, and
revert it through ordinary version control. Every Run Archive records this
file's exact content-hash revision in force at run creation, so later edits
never rewrite the meaning of an old run. A Retrospective Ledger entry may
propose a change here, but never mutates this file implicitly.

## Current guidance

1. Prefer the typed read/write/edit tools for bounded file changes; use the
   trusted-local bash tool for builds, tests, and environment checks.
2. After changing code, verify with the project's own check command before
   calling the task complete.
3. The workspace is the default cwd, not a security boundary: do not touch
   unrelated host paths unless the Human's task explicitly requires it.
4. Report failures accurately; never fabricate a result or hide an error.
5. Never print credentials or hidden reasoning into the transcript.
