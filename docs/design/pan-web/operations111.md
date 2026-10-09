# #111 Criteria1.0 — bounded operation reconciliation

Candidate design, not an accepted project fact. Baseline `69fbd8a23f72a161ea2d4d7921b121bfc33a2ea7`; [contract](https://github.com/pym96/Pan-agent/issues/111#issuecomment-6081968162). Human chose the scope and architecture; Builder implemented and produced offline evidence. Independent Regulator decides acceptance.

## Ordering and authority

The optional Native `CheckpointSink.pending` receives version2 after a complete, validated single-tool response, with canonical messages, source run, admitted cumulative counters and adapter-owned private continuation. It commits before `tool.started` or the tool effect. Multi-tool responses retain the old settled-boundary behavior and have no partial recovery point. No Go code reconstructs messages from Trace. Version1 settled checkpoints keep their prior semantics; version2 requires the new capability and explicit trusted resolution. Missing/unknown resolution fails before adapter import or tool/model sends.

The trusted Node Docker wrapper advances the private envelope from `pre_dispatch` to `dispatched` by fsync/rename and a Worker database acknowledgement **before Docker create/start**. After the process exits, it persists a complete tool result, artifact hashes and operation binding before returning to Native. The Go transaction checks current running task/attempt and monotonic transition, invalidates older points and commits authoritative bytes/hash before ACK. A lost ACK cannot prove not-started: authoritative dispatched state remains unknown. Native's optional `settled` barrier prevents a wrapper/receipt persistence exception from becoming ordinary failure feedback followed by another model exchange.

The binding includes task, attempt, source run, toolCall/name, canonical argument/code hashes and identity hash. The identity covers managed input tree, effective public context, installed Pan distribution, executor code, pinned image ID, CPU and memory settings. Executor code pins network none, mounts, non-root user and other sandbox settings. Output is a fixed allowlist of single-link regular files. The model can write `/output`; it cannot write host checkpoint files or the DB. `stage1.json` is an analysis intermediate, **not** a trusted completion receipt. A model-written success file cannot advance the host lifecycle.

Completed snapshots contain the exact stdout/stderr/exit/signal/overflow result and result hash, including nonzero outcomes. Recovery preserves that canonical result; it never changes failure to success. Host and DB administrators remain trusted. Hashes detect mismatches; they are not signatures against an administrator.

## Explicit reconciliation and continuation

The existing owner-gated POST `/api/conversations/{id}/tasks/{task}/resume` takes only requestId/checkpointId. For version2 it performs readonly reconciliation before consuming the point: conversation/task lock, current active attempt, confirmed cleanup, no cancellation, eligible unconsumed bytes/hash, then a bounded host verifier. The Worker registers its credential-free execution environment in private `ew_reconcile_runtime`; HTTP clients supply no verifier, paths, image, receipt, state or hashes. The verifier reads stopped original inputs/artifacts, checks identity and the exact image's local availability, then accepts only a complete valid receipt or a persistent pre-dispatch state. The DB retains its reconciliation decision. Unknown/invalid evidence returns409 and creates no attempt. Later worker validation/import remains fail-closed, including private adapter state.

Admission and cancel/replace serialize through the existing conversation/task locks. Same request returns the original attempt; consumed or stale points cannot create another. Old Node/container stop is established by existing owned-resource cleanup, never inferred from lease expiry. A stopped unresolved task remains historical/interrupted; it cannot permanently monopolize independent work. Unknown cleanup retains the global admission guard.

The new attempt receives its own input/output/Node/run/archive. It copies only validated persistent files. `confirmed_complete` supplies the original result to Native without calling the tool. `confirmed_not_started` permits its pending call once. A new pending barrier transfers state to the new attempt before effects; an imported completed result remains classified completed if interrupted again. Subsequent model exchanges invalidate prior eligibility as before. Sealed old archives remain unchanged.

The analysis environment is disposable. A stopped old container can be removed while persistent files remain; the next tool creates and inspects a different owned container using the bound image/configuration and new attempt's validated inputs/artifacts. No image substitution/pull occurs in reconciliation. No RAM, background-service or external-effect restoration is claimed.

## Accounting and limits

Native counters remain cumulative across continuation. API accounting uses actual model settlement identity rather than summing cumulative attempt totals. Observed tool executions count host `sandbox.result` events; dispatched operations without observed result are shown separately. Reusing a receipt emits no fresh canonical tool execution observations or Docker execution; the imported canonical result is in subsequent model context, with provenance through attempt/checkpoint links. This avoids an orphan `tool.settled` in the new archive. Missing usage remains unknown. UI identifies Faux, explicit reconciliation, attempts/history, finite reconstruction and Kimi's unsupported status.

This is a single Worker, local Docker, single-tool pending gap implementation. It is not general exactly-once execution, arbitrary tool transactions, real Kimi continuation, multi-tool partial recovery, public deployment or new benchmark evidence. Old version1 remains supported when its original invariants hold; malformed versions reject without sends.

[Reproduction and evidence](../../evidence/web111/README.md).
