# Design

Design documents record contracts and trade-offs; they do not establish implementation facts.

## Authoritative product

- [`native-module-layout.md`](native-module-layout.md): WorkOrder #41 source relocation, resolved dependency graph, public package/type checks and unchanged installed behavior; [`workorder-41-relocations.json`](workorder-41-relocations.json) records all source/import/locator mappings.

- [`packed-product-consumer.md`](packed-product-consumer.md): WorkOrder #35 compiled private tarball, installed executable/exports and Node 22.19.0 offline consumer proof, accepted and landed; historical procedure retained unchanged.

- [`typescript-pi-general-agent-working-stack.md`](typescript-pi-general-agent-working-stack.md): the authoritative TypeScript/Pi working stack, deep `GeneralAgentSession` Interface, real DeepSeek and deterministic Faux Adapters, typed workspace tools, trusted-local authority boundary, observable terminals, and three memory lanes.
- [`native-agent-kernel-v0.md`](native-agent-kernel-v0.md): WorkOrder #28's accepted `AgentKernel` seam, default Pi compatibility implementation, explicit repository-owned Native implementation, shared Context/tool/cancellation/budget semantics, and dual-Kernel conformance boundary.
- [`pan-owned-canonical-protocol.md`](pan-owned-canonical-protocol.md): WorkOrder #31's accepted Pan-owned Message/Tool/usage/identity/failure semantics plus the `ModelAdapter` and `AgentTool` seams used by NativeKernel; Pi remains the default behind a named transitional compatibility module.
- [`pan-faux-and-trusted-local-tools.md`](pan-faux-and-trusted-local-tools.md): WorkOrder #32's accepted reusable deterministic Pan Faux Adapter and direct Pan-owned trusted-local read/write/edit/bash Tools on explicit Native composition.
- [`pan-deepseek-model-adapter.md`](pan-deepseek-model-adapter.md): WorkOrder #33's direct Pan-owned DeepSeek ModelAdapter, internal transport, exact Context encoding, SSE assembly, private reasoning continuation, and typed offline failure boundary; Builder candidate pending independent review.
- [`../adr/0015-three-lane-memory-contract.md`](../adr/0015-three-lane-memory-contract.md): the accepted archive, retrospective-ledger, and Runbook memory contract landed by WorkOrder #25.
- [`../adr/0016-authoritative-typescript-product-path.md`](../adr/0016-authoritative-typescript-product-path.md): WorkOrder #24's proposed supersession record making TypeScript/Pi the default product and classifying every retained non-product lane.
- [`../../conformance/README.md`](../../conformance/README.md): implementation-neutral fixtures for retained tool semantics, terminal outcomes, active-tool cancellation, and cross-task Context behavior.

## Reference-only implementation

- [`evented-tui-tracer.md`](evented-tui-tracer.md): the credential-free Python evented TUI and replay/cancellation reference.
- [`proactive-semantic-compaction.md`](proactive-semantic-compaction.md): known-window proactive Context projection, exact artifact retention, and fail-closed non-fitting projection.
- [`provider-context-overflow-recovery.md`](provider-context-overflow-recovery.md): one classified Context-overflow recovery, failed-exchange retention, and explicit retry exhaustion.
- [`tui-three-view-projections.md`](tui-three-view-projections.md): compact/expanded/trace projections and the shared visibility policy.
- [`deepseek-live-tui.md`](deepseek-live-tui.md): the retained Python DeepSeek entry with default no-shell behavior and opt-in trusted-local shell/Human PTY semantics.

These documents remain useful comparison material. Their Python AgentLoop, TUI, and task-specific mechanics are not dependencies of the authoritative TypeScript product.

## Historical experiment and evaluation designs

- [`general-vertical-system.md`](general-vertical-system.md): General Runtime and Vertical Domain Pack experiment architecture.
- [`deerflow-mechanism-map.md`](deerflow-mechanism-map.md): pinned external mechanism inspection and local adopt/defer/reject map.
- [`proof-domains.md`](proof-domains.md): two bounded proof domains and deterministic evaluation contracts.
- [`benchmark-strategy.md`](benchmark-strategy.md): PinchBench compatibility, the configured vertical catalog, metrics, provenance, and the external campaign seam.
- [`react-to-swe-mvp.md`](react-to-swe-mvp.md): the Human-accepted Act-only/ReAct comparison and progression toward an SWE-agent-style ACI.
- [`protocol-reliability-v1.md`](protocol-reliability-v1.md): the 24-context J0/J1/S0/S1 replay design, repair accounting, L0-L3 metrics, and claim boundary.
- [`protocol-reliability-v1.1-max-token-sensitivity.md`](protocol-reliability-v1.1-max-token-sensitivity.md): the five-context 2K/4K/8K sensitivity design.
- [`protocol-reliability-v1.2-max-token-16k-extension.md`](protocol-reliability-v1.2-max-token-16k-extension.md): the separately identified post-v1.1 16K extension.
- [`translation-adapter.md`](translation-adapter.md): the independently accepted offline typed canonical-history Translation Adapter.
- [`agent-loop-behavioral-eval-v0.md`](agent-loop-behavioral-eval-v0.md): the independently accepted event-sourced AgentLoop and Behavioral Eval design freeze.
- [`behavioral-eval-runtime-v0.md`](behavioral-eval-runtime-v0.md): the deterministic 12-case campaign and zero-call reconstruction contract.
- [`deepseek-live-behavioral-eval-stage-a.md`](deepseek-live-behavioral-eval-stage-a.md): the frozen paired 120-slot DeepSeek campaign and zero-call inventory.
- [`deepseek-live-budgeted-serial-runner.md`](deepseek-live-budgeted-serial-runner.md): the accepted budgeted v2 runner and terminal denominator behavior.
- [`deepseek-live-v3-adapter-stage-a.md`](deepseek-live-v3-adapter-stage-a.md): the accepted zero-call v3 Translation repair and new lock identity.

All historical experiment Evidence, locks, reports, and Wiki material retain their original identities and review boundaries. Current verified implementation facts remain exclusively in [`../evidence/verified-project-facts.md`](../evidence/verified-project-facts.md).

The Human-accepted architecture history remains indexed in [`../adr/README.md`](../adr/README.md). WorkOrder #24 changes the product route; it does not retroactively change the acceptance status or claims of any retained design.

- [Product isolation](product-isolation.md) — #34 Product/Frozen Reference relocation, coverage and checks.

- [WorkOrder #34 baseline case map](workorder-34-coverage.json) — all 78 baseline test identities and destinations.

## WorkOrder #42 presentation candidate

- [Native compact TUI](native-compact-tui.md): Criteria-Version 1.1, count sources, editable input, safe projection, demo and review protocol.
- [Prior test obligation map](workorder-42-obligations.json): all 73 obligations, historical/current execution and exact presentation substitutions.

- [Native streaming TUI](native-streaming-tui.md): #44 optional transient progress interface, English labels, safety boundaries and reproduction.
- [#44 obligation map](workorder-44-obligations.json): all 83 prior tests, precise presentation substitutions and approved wiring diffs.

[native-file-input.md](native-file-input.md) and [workorder-43-obligations.json](workorder-43-obligations.json): #43 explicit snapshots, exact task envelope, named review outputs and 92 retained obligations.

[native-file-input-repair.md](native-file-input-repair.md) and [workorder-43-repair-obligations.json](workorder-43-repair-obligations.json): prospective #43 Criteria 1.1 and eight-criterion evidence map.

- [Overnight handoff](overnight-handoff.md) and [#45 obligations](workorder-45-obligations.json): independent offline development-tool candidate.

[native-daily-workspace.md](native-daily-workspace.md) and [workorder-tui-a-obligations.json](workorder-tui-a-obligations.json): #47 daily workspace contract and prior-test mapping.

#47 Criteria-Version 1.2 adds timer-free compatibility framing (Ctrl-G Back, ESC prefix only) and immutable raw-prefix screen evidence. Old 1.1 grids remain historical failed evidence.

[preview-first-task.md](preview-first-task.md) and [workorder-preview-entry-obligations.json](workorder-preview-entry-obligations.json): #51 product-first entry, deterministic offline first task, fresh-process replay, canary isolation and 115 retained obligations.

[preview-config.md](preview-config.md) and [workorder-preview-config-obligations.json](workorder-preview-config-obligations.json): #52 first-run settings, explicit credential source, closed selection, canary containment and disposable Keychain lifecycle.

[preview-kimi.md](preview-kimi.md) and [workorder-preview-kimi-obligations.json](workorder-preview-kimi-obligations.json): #53 Pan-owned Kimi Code adapter, frozen official wire contract, offline fixtures, boundary/switch/cancellation proofs.
