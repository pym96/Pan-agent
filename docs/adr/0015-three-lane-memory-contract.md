# ADR-0015: Separate raw archives, retrospectives, and current guidance into three memory lanes

- Status: Proposed
- Date: 2026-09-03
- Decision owner: Human accepted the three-lane memory rule in the Master session on 2026-09-03; this record awaits independent verification under WorkOrder #25 (Criteria-Version `1.0`, C-MEM-01…13)
- Depends on: the accepted #23 TypeScript/Pi General Agent Working Stack (base `c366060a706ddbf1905943eed8d4aa029837e8c2`) and the #26 operational Criteria contract

## Context

The accepted TypeScript working stack kept observations in memory only, with no durable event log or replay. The Human's accepted rule is that raw trajectories are read-only archives, retrospective cognition only grows, and execution manuals may be patched and rolled back. WorkOrder #22's Python prototype validated append-only event-log and replay semantics, but the authoritative TypeScript stack had no such contract, and no shared language separated evidence, interpretation, and current instructions.

Collapsing these three kinds into one document type makes old runs reinterpretable by later edits, lets conclusions silently overwrite raw history, and leaves no honest way to correct a retrospective without rewriting it.

## Decision

Adopt three memory lanes with three different mutation rules in the TypeScript working stack:

1. **Run Archive** (`typescript/src/run-archive.ts`): one exclusively created directory per run under the memory root, holding an append-only `events.jsonl` hash chain and a `manifest.json` seal. The session appends the durable `run.started` record — carrying run identity, Provider/model/thinking identity, and the Runbook revision — before any Provider exchange or tool side effect. Settlement seals the archive as `terminal | cancelled | failed`; recovery seals a crashed run as `interrupted` with disclosed torn-tail byte counts. Sealed archives refuse every application-owned write interface (`beginRun` identity reuse, `append`, re-`settle`, recovery write) and offer only verified read/replay. There is no overwrite or delete interface; this is an application-level contract with integrity detection, not filesystem immutability.
2. **Retrospective Ledger** (`typescript/src/retrospective-ledger.ts`): append-only post-run interpretation stored separately from raw archives. Admission requires the referenced archive to exist, be sealed, and match the declared head hash; a correction is a new entry with an explicit `supersedes` reference. Entries are typed distinctly from archive records and are rejected as trajectory input. They are never automatically Verified Project Facts.
3. **Runbook** (`typescript/RUNBOOK.md`, loaded via `typescript/src/runbook.ts`): current operating guidance, mutable through ordinary version-controlled edits and reverts. The session resolves the Runbook snapshot at each run's creation, binds its content-hash revision into the run archive and the model-visible prompt, and never mutates the Runbook implicitly; retrospectives may only propose changes.

Rejected alternatives:

- **Single durable log for everything** — later guidance edits would rewrite the meaning of old runs; corrections would overwrite the cognition they fix.
- **Python-style per-session roots** — the memory root is a durable, reusable store across sessions; per-session exclusive roots would fragment the archive and ledger.
- **Archive the raw Provider wire** — canonical semantic observations preserve what is needed to explain a run while never storing credentials; restricted reasoning stays out of archives and projections.

## Consequences

- The TUI gains zero-effect `:runs` and `:replay` inspection of sealed archives.
- The real entry command requires `--memory-root`, disjoint from the workspace.
- The three lane names and boundaries live in `CONTEXT.md`; `tests/test_governance_docs.py` anchors them.
- A run interrupted mid-write keeps a verifiable causal prefix and a disclosed torn-tail count; its identity is never reused.
- A present-but-corrupted sealed manifest never blocks startup: `open()` leaves it byte-untouched, and every read surface (`readManifest`, `readArchive`, `listRuns`) reports it as a typed `ArchiveIntegrityError`; TUI `:runs` and `:replay` render that failure as `ARCHIVE_ERROR`.
