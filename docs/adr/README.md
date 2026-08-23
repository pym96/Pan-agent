# Architecture Decisions

Architecture decisions record target structure and trade-offs; they do not prove implementation.

- ADR-0001, ADR-0003, and ADR-0007 are superseded historical research-product decisions.
- ADR-0002, ADR-0004, ADR-0005, ADR-0006, and ADR-0008 are accepted decisions from the current history.
- [`0009-general-runtime-and-vertical-domain-packs.md`](0009-general-runtime-and-vertical-domain-packs.md) is Human-accepted and supersedes the single Local Workspace product assumption in ADR-0008. Its implementation candidate remains pending independent verification.
- [`0010-external-and-vertical-evaluation-lanes.md`](0010-external-and-vertical-evaluation-lanes.md) is Human-accepted. It keeps PinchBench compatibility and the local 30-case vertical campaign above the Runtime seam; no Adapter or score exists yet.
- [`0011-react-mvp-before-swe-aci.md`](0011-react-mvp-before-swe-aci.md) is Human-accepted. It freezes a five-case bash-only Act/ReAct learning smoke before any SWE-agent-style ACI expansion; implementation conformance and results remain pending independent review.
