# Design

Design documents are candidate contracts, not implementation facts.

- [`general-vertical-system.md`](general-vertical-system.md): active General Runtime and Vertical Domain Pack design entry.
- [`deerflow-mechanism-map.md`](deerflow-mechanism-map.md): pinned external mechanism inspection and local adopt/defer/reject map.
- [`proof-domains.md`](proof-domains.md): the two bounded proof domains and deterministic evaluation contracts.
- [`benchmark-strategy.md`](benchmark-strategy.md): PinchBench compatibility, the configured 30-case vertical catalog, metrics, provenance, and the external campaign seam. Executable locks/catalogs live under [`../../workspace_agent_harness/benchmark_configs/`](../../workspace_agent_harness/benchmark_configs/).
- [`react-to-swe-mvp.md`](react-to-swe-mvp.md): the Human-accepted Phase 0 Act-only/ReAct mechanism comparison, Docker/gold gate, dual-channel observations, and progression toward a SWE-agent-style ACI.

The Human-accepted architecture decisions are [`../adr/0009-general-runtime-and-vertical-domain-packs.md`](../adr/0009-general-runtime-and-vertical-domain-packs.md), [`../adr/0010-external-and-vertical-evaluation-lanes.md`](../adr/0010-external-and-vertical-evaluation-lanes.md), and [`../adr/0011-react-mvp-before-swe-aci.md`](../adr/0011-react-mvp-before-swe-aci.md). Their implementation status and verification boundaries remain explicit in each document. Current verified implementation facts remain exclusively in [`../evidence/verified-project-facts.md`](../evidence/verified-project-facts.md).
