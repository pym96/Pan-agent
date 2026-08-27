# Tests

The accepted implementation baseline is split across:

- `test_package_identity.py`;
- `test_runtime.py`;
- `test_trace.py`.

`test_general_runtime_contract.py` exercises the accepted ADR-0009 caller Interface: two exact Pack selectors through one Runtime, explicit Adapter configuration identity, recomputed and per-run revalidated Pack content, fail-closed task admission, authority non-escalation, and terminable evaluator failure/limit isolation. `test_proof_packs.py` also rebinding-probes live data/coding helpers to verify registered execution uses its frozen globals snapshot.

`test_benchmark_campaign_contract.py` exercises accepted ADR-0010 behavior: recomputed source/case/transform/Suite identity, exact selection, baseline provenance retention across all-Runtime-error campaigns, visible pre-run ineligibility, failure attribution, usage aggregation, failed-attempt cost retention, and append-only raw attempt artifacts. The campaign calls only the injected Runtime's public `run` seam.

`test_regulator_negative_probes.py` was authored by the independent Regulator session reviewing the 2026-08-19 backlog (fifth independent review), not by the Working Agent. It probes module data-global rebinding fail-closed revalidation, original-helper `__code__` replacement, evaluator process-group timeout cleanup with a grandchild process, Pack method rebinding, forged evaluator identity, resource traversal, caller-wider-than-ceiling authority, campaign root overlap, repetition append-only artifacts, and unregistered required packs.

`test_regulator_react_mvp_probes.py` was authored by the independent Regulator session reviewing the 2026-08-20..23 ReAct MVP backlog (sixth review): summary slot-identity and config-hash tampering must fail closed, and extra protocol-contract rejections (unexpected fields, non-bash tool, config byte drift) stay pinned.

`test_proof_packs.py` is the concrete Generality Proof integration contract. It must run the accepted `data-analysis` and `workspace-coding` seed Pack Adapters through one Runtime and one Model Adapter while preserving distinct capability and evaluator behavior.

`test_benchmark_configuration.py` exercises the configured benchmark seam: exact PinchBench commit/tree/manifest locks, clean-worktree and task-set drift rejection, required positive-integer task timeouts, non-execution of embedded grader text, manifest/frontmatter discrepancy provenance, exact 15+15 vertical denominators, eligible seed fixture/evaluator binding to the real Pack `ControlProjection`, and a development campaign in which only the two implemented seeds are attempted while 28 cases remain visibly ineligible.

`test_react_mvp.py` exercises the Phase 0 mechanism seam: the DeepSeek request locks provider thinking off and JSON-object output; Act-only rejects visible thought; ReAct requires a bounded thought and bash-only action; observations enter the next call through the existing `AgentLoop`; full stdout/stderr survive model-visible truncation with hashes; and the five-case/two-variant/three-repetition configuration rejects drift.

`test_react_mvp_summary.py` exercises the deterministic Phase 0 matrix summary: expected slots come from the frozen configuration, incomplete attempt artifacts remain infrastructure/artifact failures rather than unresolved task outcomes, and missing provider-usage records remain visible in call coverage.

`test_protocol_reliability.py` exercises the frozen post-ReAct protocol gate: exact 16+8 real-context corpus reconstruction, JSON/Strict historical-context equality, Strict schema constraints and thought placement, L0-L3 separation, one bounded repair message, credential-free lossless request/response retention, and Wilson intervals.

`test_protocol_reliability_summary.py` proves original legality and post-repair legality/cost remain separate, tampered raw response artifacts fail closed, and a different non-empty fingerprint stops within one transport while separate JSON/Strict fingerprints remain allowed.

`test_protocol_max_token_sensitivity.py` proves the exact 75-slot v1.1 and 25-slot 16K extension matrices, verifies that payload arms differ only in `max_tokens`, locks the extension to the completed v1.1 summary/manifest, checks returned marker diagnostics, excludes credentials, and rejects tampered response artifacts.

`test_translation_adapter.py` exercises WorkOrder #4's offline typed seam: native assistant tool-call and paired tool-result history round-trips correlation IDs; legacy/native history and thought/command reasoning remain independent; reasoning never enters canonical executable arguments; only `ModelProfile.max_output_tokens` controls the translated request; and length, malformed JSON, schema drift, missing/duplicate/reused IDs, orphan results, and multi-call output fail before action execution. Secret-free fixture provenance lives under [`fixtures/translation/manifest.json`](fixtures/translation/manifest.json), including the minimized retained DSML-runaway locator. The four-cell dry-run is deterministic, makes zero calls, and reports no causal result.

`test_evented_agent.py` exercises WorkOrder #6's pending-review evented Runtime slice: one admitted deterministic tool round trip through the public AgentLoop/ModelGateway seam, multi-action rejection before History or effects, `run-event/v1` sequence/hash/causal/terminal invariants, read-only replay, cancellation settlement, and terminal-consumer deletion equivalence.

`test_evented_tui.py` drives the documented Python entry through a real pseudo-terminal. It covers non-blank Unicode input, blank-input refusal without a Run, one-tool completion, Ctrl-C during exchange, process exits, equality between rendered terminal state and retained events, WorkOrder #7's long proactive-compaction demo, and WorkOrder #8's successful/exhausted overflow paths with event-derived explanation and replay.

`test_semantic_context.py` exercises WorkOrder #7 through public seams: exact versus semantic fit controls, known-window proactive triggering, source-attributed summary and active-commitment preservation, whole call/result groups, exact artifact recovery through two stores, replay equivalence, fail-closed non-fitting projections, and refusal to truncate an oversized active request.

`test_context_overflow_recovery.py` exercises WorkOrder #8 through the public AgentLoop/ModelGateway/Context-projector seams: only typed Context overflow enters recovery; the original failed exchange and per-attempt accounting remain separate; fallback/unknown windows do not block the first call; the #7 semantic summary preserves exact source semantics without truncation; one retry succeeds through normal admission or exhausts explicitly; unrelated failures remain distinct; malformed retry candidates execute no tool; and the exact-history projector cannot fake semantic recovery.

`test_agent_loop_behavioral_eval.py` exercises WorkOrder #9's exact 12-case/four-family manifest through the public evented `AgentLoop.run(...)` seam, verifies reference actions and model-visible recovery observations against protected exact oracles, keeps Runtime terminal status separate from evaluator verdict, distinguishes Provider/protocol/Context/tool/policy/task failures, rejects count/category/hash/oracle/limit/environment/tool/prose drift before execution, proves nested fixture immutability, compares repeated byte-stable reports, and reconstructs the same report from Event Logs with zero Gateway or Tool Adapter calls.

Run the full handoff command with:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The complete suite must be green for the implementation candidate. That result does not establish an external benchmark result, official PinchBench compatibility, or independent acceptance.

`test_regulator_protocol_probes.py` was authored by the independent Regulator session reviewing the 2026-08-23/24 protocol-reliability and max-token-sensitivity backlog (seventh/eighth review): config byte drift, corpus drift, and forged corpus-pointer binding must fail closed at the loader.
