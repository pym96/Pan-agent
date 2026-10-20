# Retrieval candidate evidence — #144 Criteria1.0

First candidate was independently rejected; repaired candidate is pending fresh independent review. No acceptance or external capability claim. Base: `b331feaf6ce67fed7ec3da457999ad4ca5ccff4f`. Only the installed TypeScript TUI retrieval extension is reopened.

- [Predeclared query manifest](queries.json), committed at `cc25f87` before final measurement: nine queries, eight source-bearing cases and one empty case; duplicate text expects both sources.
- [Design/limits](../../design/retrieval-tool.md): selection, approval, per-file policy, fresh snapshots and citation reconstruction.
- `typescript/test/retrieval.test.ts`: actual prior GeneralAgentSession/Faux run creates sealed history, official ledger writer creates corrections; negative probes cover authorization, links/protected data, updates, corruption, cancellation and limits.
- `typescript/scripts/retrieval-installed-demo.mjs PACKAGE_ROOT OUTPUT_ROOT`: production-only package; ordinary CLI config across processes, actual DailyWorkspace input/approval keystrokes, NativeKernel/tool/archive path and same-run replay. Only ModelAdapter is scripted. No provider/network call or model-quality claim.
- [First artifact manifest](manifest.json): preserved rejected-candidate snapshot, not current acceptance evidence.
- [Repair artifact manifest](repair-manifest.json): fresh source/package identities, red/green logs, installed UI smoke and contradictory-seal reproduction. Final candidate SHA is in the repair Handoff.

C-RET-01 uses installed integration;02 uses predeclared ranks/hash/offset checks;03 uses authority negatives and still needs additional Human/different-family review;04 uses freshness and ledger correction;05 uses failures/cancellation;06 uses full Product regression, typecheck, pack and production-only installation. Expected ranks measure synthetic lexical source coverage, not generic RAG accuracy.

## Additional authority-review brief

1. Selected ordinary prose may contain secrets. Snippets go to the configured model. **No generic redaction/secret detection** is claimed.
2. Per-call Allow once binds config/root identity, run/call/query and policy revision. Shell trust does not carry over; cancellation/revocation/reselection invalidates the result.
3. Own-memory exception only covers exact selected sealed archive files, verified ledger and RUNBOOK.md. It excludes settings, raw provider reasoning and other account stores. Configured protected paths still deny.
4. No-follow/hardlink/path checks are application checks, not race-free OS isolation. Retrieval writes no source/index and makes no network call. Retrieved instructions cannot grant authority.
5. The1MiB events cap excludes some long sessions. Partial diagnostics disclose it; use existing replay for skipped runs, never truncate seals. No complete long-history or semantic-recall claim.

## Article17 decisions and mistakes

Fresh per-call snapshots avoid persistent stale-cache disclosure at the cost of repeated scanning. Existing single-path authorization could not safely accept a query with undefined `args.path`; a deliberate batch admission retains per-file policy and current-invocation binding. Existing ledger reading only checked schema, so ingestion independently validates sequence, archive references and backward supersession before returning decisions.

Several initial creation commands used repository-relative paths while the shell was in the package directory; they failed before writes and were corrected. Initial typecheck rejected non-erasable parameter-property syntax and JSON union typing; both were repaired before tests. Failed outputs are retained where available. Human set scope, Master fixed the contract, Builder implemented/tests; independent review owns acceptance. No claim that Human independently wrote this implementation.

Measured environment: Node26.7.0 on macOS arm64. A local stale Homebrew Node22.18 binary failed to load its missing shared library; no host repair was attempted. The declared supported minimum22.19 was not separately exercised for this candidate, nor Linux/Windows. Full Product228/228 and focused11/11 pass on the measured runtime; clean installed0.1.7 smoke uses two approval overlays and three scripted exchanges, with zero network calls.

## Repair1 — semantic seal consistency (C-RET-04/05)

The [independent rejected Verdict](https://github.com/pym96/Pan-agent/issues/144#issuecomment-6288374318) showed that changing only `manifest.settled_state` from terminal to cancelled retained valid event checksums but returned complete historical success. Builder's initial assumption—that cryptographic integrity and manifest shape established a usable outcome—was insufficient. The hash chain proves byte linkage, not agreement between duplicated outcome fields.

Retrieval now requires exactly one `run.settled`, last, with a string reason and state matching the manifest, before admitting either history messages or its ledger reference. Archive writers, original bytes and broad archive/replay semantics are unchanged. Ten malformed variants exercise state/reason contradictions, missing/duplicate/nonfinal settlement and malformed fields; tests recompute hashes and ledger heads so unrelated integrity checks cannot mask the defect. Real writer-produced cancelled/failed/interrupted records remain supported. This validates internal consistency, not authenticity against an attacker rewriting the entire archive.

The original counterexample failed before the fix (red log). After repair: Product230/230, focused13 included, typecheck, fresh production-only package installation and ordinary installed CLI/DailyWorkspace smoke passed. An unchanged copy of the Regulator's probe was run by Builder against the repaired package: contradictory history returned `partial`, `complete:false`, no results and explicit archive/ledger diagnostics. That reuse is Builder evidence, not independent acceptance. The prior bundle and manifest remain unchanged. Source/package commit is in the repair manifest; subsequent candidate changes only document these results. No network/model calls, Docker or private corpus were used; platform and long-history limitations above remain.
